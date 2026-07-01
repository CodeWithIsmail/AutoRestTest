import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InvitationsService } from './invitations.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string };
}

/**
 * The invitee's view of invitations. Not project-scoped: the caller may not be
 * a member of the project yet, so these can't sit behind ProjectAccessService.
 */
@Controller('invitations')
@UseGuards(JwtAuthGuard)
export class MyInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /** GET /invitations — my pending invitations (matched to my email). */
  @Get()
  async findMine(@Req() req: AuthenticatedRequest) {
    return this.invitations.findMine(req.user.email);
  }

  /** POST /invitations/:token/accept — accept and become a member. */
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @Req() req: AuthenticatedRequest,
    @Param('token') token: string,
  ) {
    return this.invitations.accept(token, req.user.id, req.user.email);
  }

  /** POST /invitations/:token/decline — decline. */
  @Post(':token/decline')
  @HttpCode(HttpStatus.OK)
  async decline(
    @Req() req: AuthenticatedRequest,
    @Param('token') token: string,
  ) {
    return this.invitations.decline(token, req.user.email);
  }
}
