import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DataSource, Repository } from 'typeorm';
import { JwtPayload, UserEntity } from './user.entity';

interface MemUser {
  username: string;
  passwordHash: string;
  role: string;
}

/**
 * Authentification multi-utilisateurs par JWT.
 *
 * - Auth active uniquement si `JWT_SECRET` est défini (sinon mode ouvert/dev).
 * - Utilisateurs en PostgreSQL si `DATABASE_URL` est présent, sinon repli en
 *   mémoire (l'admin amorcé depuis l'environnement reste opérationnel).
 * - Un compte admin est amorcé depuis `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
 */
@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private dataSource?: DataSource;
  private repo?: Repository<UserEntity>;
  private readonly memUsers = new Map<string, MemUser>();

  constructor(private readonly jwt: JwtService) {}

  authRequired(): boolean {
    return Boolean(process.env.JWT_SECRET);
  }

  async onModuleInit(): Promise<void> {
    if (!this.authRequired()) {
      this.logger.warn('JWT_SECRET absent — authentification désactivée (mode ouvert)');
      return;
    }
    const url = process.env.DATABASE_URL;
    if (url) {
      try {
        this.dataSource = new DataSource({
          type: 'postgres',
          url,
          entities: [UserEntity],
          synchronize: true,
          logging: false,
        });
        await this.dataSource.initialize();
        this.repo = this.dataSource.getRepository(UserEntity);
        this.logger.log('Magasin utilisateurs PostgreSQL initialisé');
      } catch (err) {
        this.logger.error(
          `PostgreSQL indisponible pour les utilisateurs, repli mémoire : ${(err as Error).message}`,
        );
      }
    } else {
      this.logger.warn('DATABASE_URL absent — utilisateurs en mémoire (non durable)');
    }
    await this.seedAdmin();
  }

  async onModuleDestroy(): Promise<void> {
    await this.dataSource?.destroy();
  }

  private async seedAdmin(): Promise<void> {
    const username = process.env.ADMIN_USERNAME ?? 'admin';
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      this.logger.warn(
        'ADMIN_PASSWORD absent — aucun compte amorcé. Définissez-le pour vous connecter.',
      );
      return;
    }
    if (await this.findUser(username)) {
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await this.createUser(username, passwordHash, 'admin');
    this.logger.log(`Compte admin amorcé : ${username}`);
  }

  private async findUser(username: string): Promise<MemUser | null> {
    if (this.repo) {
      const u = await this.repo.findOne({ where: { username } });
      return u ? { username: u.username, passwordHash: u.passwordHash, role: u.role } : null;
    }
    return this.memUsers.get(username) ?? null;
  }

  private async createUser(username: string, passwordHash: string, role: string): Promise<void> {
    if (this.repo) {
      await this.repo.insert({ username, passwordHash, role });
      return;
    }
    this.memUsers.set(username, { username, passwordHash, role });
  }

  /** Vérifie les identifiants et renvoie un JWT signé. */
  async login(username: string, password: string): Promise<{ token: string; role: string }> {
    const user = await this.findUser(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    const payload: JwtPayload = { sub: user.username, role: user.role };
    const token = await this.jwt.signAsync(payload);
    return { token, role: user.role };
  }

  /** Vérifie un JWT ; renvoie le payload ou null. */
  verify(token: string | undefined | null): JwtPayload | null {
    if (!this.authRequired()) {
      return { sub: 'anonymous', role: 'open' };
    }
    if (!token) {
      return null;
    }
    try {
      return this.jwt.verify<JwtPayload>(token);
    } catch {
      return null;
    }
  }
}
