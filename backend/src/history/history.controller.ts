import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { EventStore } from '../persistence/event-store.service';
import { MetricsService } from '../observability/metrics.service';
import type { StoredEvent } from '../persistence/scene-event.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/** API REST d'historique et d'observabilité. */
@Controller()
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(
    private readonly store: EventStore,
    private readonly metrics: MetricsService,
  ) {}

  @Get('events/recent')
  recent(@Query('limit') limit?: string): Promise<StoredEvent[]> {
    return this.store.recent(this.parseLimit(limit, 50));
  }

  @Get('sessions/:id/events')
  bySession(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ): Promise<StoredEvent[]> {
    return this.store.bySession(id, this.parseLimit(limit, 200));
  }

  @Get('stats')
  async stats(): Promise<Record<string, unknown>> {
    const [store, live] = await Promise.all([
      this.store.stats(),
      Promise.resolve(this.metrics.snapshot()),
    ]);
    return { store, live };
  }

  private parseLimit(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return fallback;
    }
    return Math.min(n, 500);
  }
}
