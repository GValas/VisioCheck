import { Module } from '@nestjs/common';
import { EventStore } from './event-store.service';
import { MetricsService } from '../observability/metrics.service';
import { HistoryController } from '../history/history.controller';

@Module({
  controllers: [HistoryController],
  providers: [EventStore, MetricsService],
  exports: [EventStore, MetricsService],
})
export class PersistenceModule {}
