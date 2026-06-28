import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AiService } from './ai/ai.service';
import { StreamGateway } from './stream/stream.gateway';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
  providers: [AiService, StreamGateway],
})
export class AppModule {}
