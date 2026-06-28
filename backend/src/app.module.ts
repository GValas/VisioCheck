import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AiService } from './ai/ai.service';
import { StreamGateway } from './stream/stream.gateway';
import { PersistenceModule } from './persistence/persistence.module';
import { SessionsModule } from './sessions/sessions.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    PersistenceModule,
    SessionsModule,
  ],
  controllers: [AppController],
  providers: [AiService, StreamGateway],
})
export class AppModule {}
