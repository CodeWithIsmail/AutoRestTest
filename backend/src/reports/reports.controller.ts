import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { reportToCsv, reportToPdf } from './report-export';
import { ReportsService } from './reports.service';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('projects/:projectId/test-suites/:suiteId')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET .../report — computed JSON report. Any project member.
   */
  @Get('report')
  async getReport(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('suiteId', new ParseUUIDPipe()) suiteId: string,
  ) {
    return this.reportsService.getReport(projectId, suiteId, req.user.id);
  }

  /**
   * GET .../report/export?format=csv|pdf — downloadable report. Any member.
   */
  @Get('report/export')
  async export(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('suiteId', new ParseUUIDPipe()) suiteId: string,
    @Query('format') format = 'csv',
  ) {
    const report = await this.reportsService.getReport(
      projectId,
      suiteId,
      req.user.id,
    );
    const base = `report-${suiteId}`;

    if (format === 'csv') {
      res
        .status(HttpStatus.OK)
        .setHeader('Content-Type', 'text/csv')
        .setHeader('Content-Disposition', `attachment; filename="${base}.csv"`)
        .send(reportToCsv(report));
      return;
    }

    if (format === 'pdf') {
      const pdf = await reportToPdf(report);
      res
        .status(HttpStatus.OK)
        .setHeader('Content-Type', 'application/pdf')
        .setHeader('Content-Disposition', `attachment; filename="${base}.pdf"`)
        .send(pdf);
      return;
    }

    throw new BadRequestException('format must be "csv" or "pdf"');
  }

  /**
   * POST .../explain — generate + cache LLM failure explanations.
   * Owner/admin/tester.
   */
  @Post('explain')
  @HttpCode(HttpStatus.OK)
  async explain(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('suiteId', new ParseUUIDPipe()) suiteId: string,
  ) {
    return this.reportsService.explainFailures(projectId, suiteId, req.user.id);
  }
}
