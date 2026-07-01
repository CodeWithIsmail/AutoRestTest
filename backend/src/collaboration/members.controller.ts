import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { MembersService } from './members.service';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('projects/:projectId/members')
@UseGuards(JwtAuthGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  /** GET /projects/:projectId/members — list owner + members. Any member. */
  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.members.list(projectId, req.user.id);
  }

  /**
   * DELETE /projects/:projectId/members/me — leave the project. Any member.
   * Declared before the :userId route so "me" matches literally.
   */
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  async leave(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.members.leave(projectId, req.user.id);
  }

  /** PATCH /projects/:projectId/members/:userId — change role. Owner/admin. */
  @Patch(':userId')
  async updateRole(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.members.updateRole(projectId, userId, req.user.id, dto);
  }

  /** DELETE /projects/:projectId/members/:userId — remove a member. Owner/admin. */
  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.members.remove(projectId, userId, req.user.id);
  }
}
