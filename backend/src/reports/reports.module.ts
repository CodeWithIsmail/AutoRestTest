import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { LlmService } from './llm.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, LlmService],
})
export class ReportsModule {}
