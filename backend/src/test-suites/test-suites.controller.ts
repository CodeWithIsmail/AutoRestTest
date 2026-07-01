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
