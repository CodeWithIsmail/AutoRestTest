import {
  Controller,
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
import { GraphService } from './graph.service';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('projects/:projectId/graph')
@UseGuards(JwtAuthGuard)
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  /**
   * GET /projects/:projectId/graph
   * The project's dependency graph and the state of any build. Any member.
   */
  @Get()
  async get(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.graphService.get(projectId, req.user.id);
  }

  /**
   * POST /projects/:projectId/graph
   * Builds the graph from the project's current spec. Owner/admin/tester.
   * Returns 202: the build runs in the engine and the client polls GET.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async build(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.graphService.build(projectId, req.user.id);
  }
}
