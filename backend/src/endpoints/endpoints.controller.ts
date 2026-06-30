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
import { CreateEndpointDto } from './dto/create-endpoint.dto';
import { EndpointsService } from './endpoints.service';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('projects/:projectId/endpoints')
@UseGuards(JwtAuthGuard)
export class EndpointsController {
  constructor(private readonly endpointsService: EndpointsService) {}

  /**
   * GET /projects/:projectId/endpoints
   * Lists the project's endpoints (auto-extracted + manually added).
   * Any project member.
   */
  @Get()
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.endpointsService.findForProject(projectId, req.user.id);
  }

  /**
   * POST /projects/:projectId/endpoints
   * Manually adds an endpoint. Owner/admin only.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: CreateEndpointDto,
  ) {
    return this.endpointsService.createManual(projectId, req.user.id, dto);
  }

  /**
   * DELETE /projects/:projectId/endpoints/:endpointId
   * Deletes a single endpoint. Owner/admin only.
   */
  @Delete(':endpointId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('endpointId', new ParseUUIDPipe()) endpointId: string,
  ) {
    return this.endpointsService.remove(projectId, endpointId, req.user.id);
  }
}
