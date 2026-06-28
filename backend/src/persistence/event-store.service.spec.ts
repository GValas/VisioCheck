import { EventStore } from './event-store.service';
import type { StoredEvent } from './scene-event.entity';

function makeEvent(sessionId: string, atMs: number, label = 'person'): StoredEvent {
  return {
    sessionId,
    kind: 'event',
    type: 'OBJECT_ENTERED',
    label,
    trackId: 1,
    text: null,
    atMs,
  };
}

describe('EventStore (mode mémoire)', () => {
  let store: EventStore;

  beforeEach(async () => {
    delete process.env.DATABASE_URL; // force le repli en mémoire
    store = new EventStore();
    await store.onModuleInit();
  });

  it('utilise le backend mémoire sans DATABASE_URL', () => {
    expect(store.backend()).toBe('memory');
  });

  it('persiste et renvoie les plus récents en premier', async () => {
    await store.save([makeEvent('s1', 100), makeEvent('s1', 300), makeEvent('s1', 200)]);
    const recent = await store.recent(10);
    expect(recent.map((e) => e.atMs)).toEqual([300, 200, 100]);
  });

  it('filtre par session', async () => {
    await store.save([makeEvent('s1', 1), makeEvent('s2', 2), makeEvent('s1', 3)]);
    const s1 = await store.bySession('s1');
    expect(s1).toHaveLength(2);
    expect(s1.every((e) => e.sessionId === 's1')).toBe(true);
  });

  it('agrège les statistiques', async () => {
    await store.save([makeEvent('s1', 1), makeEvent('s2', 2)]);
    const stats = await store.stats();
    expect(stats).toEqual({ backend: 'memory', total: 2, sessions: 2 });
  });

  it('borne le tampon mémoire', async () => {
    const many = Array.from({ length: 1200 }, (_, i) => makeEvent('s1', i));
    await store.save(many);
    const stats = await store.stats();
    expect(stats.total).toBe(1000);
  });
});
