import { Controller, Get } from '@nestjs/common';
import { AiService } from './ai/ai.service';

@Controller()
export class AppController {
  constructor(private readonly ai: AiService) {}

  @Get('health')
  async health(): Promise<Record<string, unknown>> {
    try {
      const ai = await this.ai.health();
      return { status: 'ok', ai };
    } catch (err) {
      return { status: 'degraded', ai: null, error: (err as Error).message };
    }
  }
}
