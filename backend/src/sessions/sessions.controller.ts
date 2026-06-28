import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionRegistry } from './session-registry.service';
import { MetricsService } from '../observability/metrics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionsController {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly metrics: MetricsService,
  ) {}

  /** Liste les caméras actives, enrichies de leurs métriques live. */
  @Get()
  list(): Record<string, unknown> {
    const live = this.metrics.snapshot() as {
      sessions: Array<Record<string, unknown> & { sessionId: string }>;
    };
    const metricsBySession = new Map(live.sessions.map((s) => [s.sessionId, s]));
    const cameras = this.registry.list().map((cam) => ({
      ...cam,
      metrics: metricsBySession.get(cam.sessionId) ?? null,
    }));
    return { count: cameras.length, cameras };
  }
}
