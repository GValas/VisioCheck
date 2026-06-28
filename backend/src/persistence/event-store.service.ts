import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SceneEventEntity, StoredEvent } from './scene-event.entity';

/**
 * Journal d'événements persistant.
 *
 * - Si `DATABASE_URL` est défini → PostgreSQL via TypeORM.
 * - Sinon → repli en mémoire (anneau borné), pour rester exécutable en dev /
 *   sans base. Le mode est exposé via `backend()`.
 */
@Injectable()
export class EventStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventStore.name);
  private dataSource?: DataSource;
  private repo?: Repository<SceneEventEntity>;
  private readonly memory: StoredEvent[] = [];
  private readonly memoryLimit = 1000;

  async onModuleInit(): Promise<void> {
    const url = process.env.DATABASE_URL;
    if (!url) {
      this.logger.warn('DATABASE_URL absent — persistance en mémoire (non durable)');
      return;
    }
    try {
      this.dataSource = new DataSource({
        type: 'postgres',
        url,
        entities: [SceneEventEntity],
        synchronize: true, // dev : crée le schéma automatiquement
        logging: false,
      });
      await this.dataSource.initialize();
      this.repo = this.dataSource.getRepository(SceneEventEntity);
      this.logger.log('Persistance PostgreSQL initialisée');
    } catch (err) {
      this.logger.error(
        `Connexion PostgreSQL impossible, repli en mémoire : ${(err as Error).message}`,
      );
      this.dataSource = undefined;
      this.repo = undefined;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.dataSource?.destroy();
  }

  backend(): 'postgres' | 'memory' {
    return this.repo ? 'postgres' : 'memory';
  }

  async save(events: StoredEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    if (this.repo) {
      await this.repo.insert(events);
      return;
    }
    this.memory.push(...events);
    if (this.memory.length > this.memoryLimit) {
      this.memory.splice(0, this.memory.length - this.memoryLimit);
    }
  }

  async recent(limit = 50): Promise<StoredEvent[]> {
    if (this.repo) {
      const rows = await this.repo.find({
        order: { atMs: 'DESC' },
        take: limit,
      });
      return rows.map(toStored);
    }
    return [...this.memory].sort((a, b) => b.atMs - a.atMs).slice(0, limit);
  }

  async bySession(sessionId: string, limit = 200): Promise<StoredEvent[]> {
    if (this.repo) {
      const rows = await this.repo.find({
        where: { sessionId },
        order: { atMs: 'DESC' },
        take: limit,
      });
      return rows.map(toStored);
    }
    return this.memory
      .filter((e) => e.sessionId === sessionId)
      .sort((a, b) => b.atMs - a.atMs)
      .slice(0, limit);
  }

  async stats(): Promise<{ backend: string; total: number; sessions: number }> {
    if (this.repo) {
      const total = await this.repo.count();
      const sessions = await this.repo
        .createQueryBuilder('e')
        .select('COUNT(DISTINCT e.sessionId)', 'c')
        .getRawOne<{ c: string }>();
      return { backend: 'postgres', total, sessions: Number(sessions?.c ?? 0) };
    }
    const sessions = new Set(this.memory.map((e) => e.sessionId));
    return { backend: 'memory', total: this.memory.length, sessions: sessions.size };
  }
}

function toStored(e: SceneEventEntity): StoredEvent {
  return {
    sessionId: e.sessionId,
    kind: e.kind,
    type: e.type,
    label: e.label,
    trackId: e.trackId,
    text: e.text,
    atMs: e.atMs,
  };
}
