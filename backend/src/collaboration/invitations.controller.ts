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
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationsService } from './invitations.service';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('projects/:projectId/invitations')
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /** POST /projects/:projectId/invitations — invite by email. Owner/admin. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitations.create(projectId, req.user.id, dto);
  }

  /** GET /projects/:projectId/invitations — list invitations. Owner/admin. */
  @Get()
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.invitations.findForProject(projectId, req.user.id);
  }

  /** DELETE /projects/:projectId/invitations/:invitationId — revoke. Owner/admin. */
  @Delete(':invitationId')
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.invitations.revoke(projectId, invitationId, req.user.id);
  }
}
