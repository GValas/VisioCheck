import { Module } from '@nestjs/common';
import { SessionRegistry } from './session-registry.service';
import { SessionsController } from './sessions.controller';
import { PersistenceModule } from '../persistence/persistence.module';

@Module({
  imports: [PersistenceModule],
  controllers: [SessionsController],
  providers: [SessionRegistry],
  exports: [SessionRegistry],
})
export class SessionsModule {}
