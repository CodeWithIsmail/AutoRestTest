import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTestSuiteDto } from './dto/create-test-suite.dto';
import { TestSuitesService } from './test-suites.service';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('projects/:projectId/test-suites')
@UseGuards(JwtAuthGuard)
export class TestSuitesController {
  constructor(private readonly testSuitesService: TestSuitesService) {}

  /**
   * POST /projects/:projectId/test-suites
   * Configures a test run (created as `pending`). Owner/admin/tester.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: CreateTestSuiteDto,
  ) {
    return this.testSuitesService.create(projectId, req.user.id, dto);
  }

  /**
   * GET /projects/:projectId/test-suites
   * Lists the project's test runs, newest first. Any project member.
   */
  @Get()
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.testSuitesService.findForProject(projectId, req.user.id);
  }

  /**
   * GET /projects/:projectId/test-suites/:suiteId
   * Gets one test run with its config + results summary. Any project member.
   */
  @Get(':suiteId')
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('suiteId', new ParseUUIDPipe()) suiteId: string,
  ) {
    return this.testSuitesService.findOne(projectId, suiteId, req.user.id);
  }

  /**
   * POST /projects/:projectId/test-suites/:suiteId/run
   * Triggers execution via the engine-service. Owner/admin/tester.
   */
  @Post(':suiteId/run')
  @HttpCode(HttpStatus.ACCEPTED)
  async run(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('suiteId', new ParseUUIDPipe()) suiteId: string,
  ) {
    return this.testSuitesService.run(projectId, suiteId, req.user.id);
  }

  /**
   * GET /projects/:projectId/test-suites/:suiteId/test-cases
   * Per-endpoint results for a run. Any project member.
   */
  @Get(':suiteId/test-cases')
  async findTestCases(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('suiteId', new ParseUUIDPipe()) suiteId: string,
  ) {
    return this.testSuitesService.findTestCases(
      projectId,
      suiteId,
      req.user.id,
    );
  }

  /**
   * GET /projects/:projectId/test-suites/:suiteId/request-logs/summary
   * Per-endpoint counts of captured requests. Any project member.
   */
  @Get(':suiteId/request-logs/summary')
  async requestLogSummary(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('suiteId', new ParseUUIDPipe()) suiteId: string,
  ) {
    return this.testSuitesService.getRequestLogSummary(
      projectId,
      suiteId,
      req.user.id,
    );
  }

  /**
   * GET /projects/:projectId/test-suites/:suiteId/request-logs
   * Paginated captured requests, optionally filtered by endpointId + status.
   */
  @Get(':suiteId/request-logs')
  async requestLogs(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('suiteId', new ParseUUIDPipe()) suiteId: string,
    @Query('endpointId') endpointId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.testSuitesService.listRequestLogs(
      projectId,
      suiteId,
      req.user.id,
      {
        endpointId,
        status,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      },
    );
  }

  /**
   * GET /projects/:projectId/test-suites/:suiteId/request-logs/:logId
   * Full captured request/response for one record. Any project member.
   */
  @Get(':suiteId/request-logs/:logId')
  async requestLog(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('suiteId', new ParseUUIDPipe()) suiteId: string,
    @Param('logId', new ParseUUIDPipe()) logId: string,
  ) {
    return this.testSuitesService.getRequestLog(
      projectId,
      suiteId,
      logId,
      req.user.id,
    );
  }

  /**
   * DELETE /projects/:projectId/test-suites/:suiteId
   * Deletes a test run (cascades its test cases). Owner/admin only.
   */
  @Delete(':suiteId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('suiteId', new ParseUUIDPipe()) suiteId: string,
  ) {
    return this.testSuitesService.remove(projectId, suiteId, req.user.id);
  }
}
