import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { RequestDescriptionsService } from './request-descriptions.service';
import { TestSuitesController } from './test-suites.controller';
import { TestSuitesService } from './test-suites.service';

@Module({
  // ReportsModule is imported for LlmService alone — the "Explain Requests"
  // pass reuses the same chat client (and admin-configured key) as the
  // failure explainer.
  imports: [ReportsModule],
  controllers: [TestSuitesController],
  providers: [TestSuitesService, RequestDescriptionsService],
})
export class TestSuitesModule {}
