import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

function makeService(): AuthService {
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } });
  return new AuthService(jwt);
}

describe('AuthService (mémoire)', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('mode ouvert quand JWT_SECRET absent : verify renvoie un payload', async () => {
    delete process.env.JWT_SECRET;
    const svc = makeService();
    expect(svc.authRequired()).toBe(false);
    expect(svc.verify(undefined)?.role).toBe('open');
  });

  it('amorce un admin et délivre un JWT vérifiable', async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'secret123';
    delete process.env.DATABASE_URL;

    const svc = makeService();
    await svc.onModuleInit();

    const { token, role } = await svc.login('admin', 'secret123');
    expect(role).toBe('admin');
    expect(svc.verify(token)?.sub).toBe('admin');
  });

  it('rejette de mauvais identifiants', async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'secret123';
    delete process.env.DATABASE_URL;

    const svc = makeService();
    await svc.onModuleInit();

    await expect(svc.login('admin', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verify rejette un token invalide quand l’auth est active', () => {
    process.env.JWT_SECRET = 'test-secret';
    const svc = makeService();
    expect(svc.verify('not-a-jwt')).toBeNull();
  });
});
