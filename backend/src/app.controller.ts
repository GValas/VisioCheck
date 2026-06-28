import { Controller, Get } from '@nestjs/common';
import { AiService } from './ai/ai.service';
import { EventStore } from './persistence/event-store.service';

@Controller()
export class AppController {
  constructor(
    private readonly ai: AiService,
    private readonly store: EventStore,
  ) {}

  @Get('health')
  async health(): Promise<Record<string, unknown>> {
    const persistence = this.store.backend();
    try {
      const ai = await this.ai.health();
      return { status: 'ok', ai, persistence };
    } catch (err) {
      return {
        status: 'degraded',
        ai: null,
        persistence,
        error: (err as Error).message,
      };
    }
  }
}
