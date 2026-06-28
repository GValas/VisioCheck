import { Injectable } from '@nestjs/common';

interface SessionMetrics {
  frames: number;
  events: number;
  descriptions: number;
  totalInferMs: number;
  lastInferMs: number;
  startedAt: number;
  lastSeenAt: number;
}

/**
 * Métriques en mémoire par session (latence d'inférence, débit, comptages).
 * Exposées via /stats pour l'observabilité.
 */
@Injectable()
export class MetricsService {
  private readonly sessions = new Map<string, SessionMetrics>();

  open(sessionId: string): void {
    const now = Date.now();
    this.sessions.set(sessionId, {
      frames: 0,
      events: 0,
      descriptions: 0,
      totalInferMs: 0,
      lastInferMs: 0,
      startedAt: now,
      lastSeenAt: now,
    });
  }

  record(sessionId: string, opts: { inferMs: number; events: number; hasDescription: boolean }): void {
    const m = this.sessions.get(sessionId);
    if (!m) {
      return;
    }
    m.frames += 1;
    m.events += opts.events;
    m.descriptions += opts.hasDescription ? 1 : 0;
    m.totalInferMs += opts.inferMs;
    m.lastInferMs = opts.inferMs;
    m.lastSeenAt = Date.now();
  }

  close(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  snapshot(): Record<string, unknown> {
    const sessions = [...this.sessions.entries()].map(([id, m]) => ({
      sessionId: id,
      frames: m.frames,
      events: m.events,
      descriptions: m.descriptions,
      avgInferMs: m.frames > 0 ? +(m.totalInferMs / m.frames).toFixed(1) : 0,
      lastInferMs: +m.lastInferMs.toFixed(1),
      fps: this.estimateFps(m),
      uptimeS: +((Date.now() - m.startedAt) / 1000).toFixed(0),
    }));
    return { activeSessions: sessions.length, sessions };
  }

  private estimateFps(m: SessionMetrics): number {
    const elapsedS = (m.lastSeenAt - m.startedAt) / 1000;
    return elapsedS > 0 ? +(m.frames / elapsedS).toFixed(1) : 0;
  }
}
