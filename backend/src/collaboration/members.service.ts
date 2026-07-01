import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

export interface MemberItem {
  userId: string;
  username: string;
  email: string;
  role: Role;
  joinedAt: Date;
}

export interface MemberList {
  owner: { userId: string; username: string; email: string };
  members: MemberItem[];
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  // --------------------------------------------------------------------------
  // list — GET /projects/:projectId/members (any member)
  // --------------------------------------------------------------------------
  async list(projectId: string, userId: string): Promise<MemberList> {
    await this.access.assertAccess(projectId, userId);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        owner: { select: { id: true, username: true, email: true } },
        members: {
          orderBy: { joinedAt: 'asc' },
          select: {
            userId: true,
            role: true,
            joinedAt: true,
            user: { select: { username: true, email: true } },
          },
        },
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return {
      owner: {
        userId: project.owner.id,
        username: project.owner.username,
        email: project.owner.email,
      },
      members: project.members.map((m) => ({
        userId: m.userId,
        username: m.user.username,
        email: m.user.email,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    };
  }

  // --------------------------------------------------------------------------
  // updateRole — PATCH /projects/:projectId/members/:userId (owner/admin)
  // --------------------------------------------------------------------------
  async updateRole(
    projectId: string,
    targetUserId: string,
    userId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<MemberItem> {
    await this.access.assertAccess(projectId, userId, [Role.admin]);

    const result = await this.prisma.projectMember.updateMany({
      where: { projectId, userId: targetUserId },
      data: { role: dto.role },
    });
    if (result.count === 0) {
      throw new NotFoundException('Member not found');
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      select: {
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: { username: true, email: true } },
      },
    });
    // Non-null by construction (updateMany just matched it).
    return {
      userId: member!.userId,
      username: member!.user.username,
      email: member!.user.email,
      role: member!.role,
      joinedAt: member!.joinedAt,
    };
  }

  // --------------------------------------------------------------------------
  // remove — DELETE /projects/:projectId/members/:userId (owner/admin)
  // --------------------------------------------------------------------------
  async remove(
    projectId: string,
    targetUserId: string,
    userId: string,
  ): Promise<{ message: string }> {
    await this.access.assertAccess(projectId, userId, [Role.admin]);

    const result = await this.prisma.projectMember.deleteMany({
      where: { projectId, userId: targetUserId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Member not found');
    }
    return { message: 'Member removed' };
  }

  // --------------------------------------------------------------------------
  // leave — DELETE /projects/:projectId/members/me (any member)
  // --------------------------------------------------------------------------
  async leave(projectId: string, userId: string): Promise<{ message: string }> {
    await this.access.assertAccess(projectId, userId);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (project?.ownerId === userId) {
      throw new BadRequestException(
        'The owner cannot leave their own project; delete it instead',
      );
    }

    const result = await this.prisma.projectMember.deleteMany({
      where: { projectId, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('You are not a member of this project');
    }
    return { message: 'You have left the project' };
  }
}
