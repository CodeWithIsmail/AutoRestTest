import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InvitationStatus, Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';

const INVITE_EXPIRY_DAYS = 7;

/** Invitation as seen by a project owner/admin (includes the shareable link). */
export interface InvitationItem {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  token: string;
  acceptUrl: string;
  expiresAt: Date;
  createdAt: Date;
}

/** Invitation as seen by the invitee. */
export interface MyInvitationItem {
  id: string;
  projectId: string;
  projectName: string;
  role: Role;
  token: string;
  acceptUrl: string;
  invitedBy: string;
  expiresAt: Date;
  createdAt: Date;
}

const INVITE_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  token: true,
  expiresAt: true,
  createdAt: true,
} as const;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  private acceptUrl(token: string): string {
    return `/invitations/${token}/accept`;
  }

  // --------------------------------------------------------------------------
  // create — POST /projects/:projectId/invitations (owner/admin)
  // --------------------------------------------------------------------------
  async create(
    projectId: string,
    inviterId: string,
    dto: CreateInvitationDto,
  ): Promise<InvitationItem> {
    await this.access.assertAccess(projectId, inviterId, [Role.admin]);

    const email = dto.email.trim().toLowerCase();

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        owner: { select: { email: true } },
        members: { select: { user: { select: { email: true } } } },
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (project.owner.email.toLowerCase() === email) {
      throw new BadRequestException('This user is the project owner');
    }
    if (project.members.some((m) => m.user.email.toLowerCase() === email)) {
      throw new ConflictException('This user is already a member');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    // Re-inviting an email that previously declined/expired reuses the row;
    // a still-pending invite is a conflict.
    const existing = await this.prisma.projectInvitation.findUnique({
      where: { projectId_email: { projectId, email } },
      select: { id: true, status: true },
    });
    if (existing && existing.status === InvitationStatus.pending) {
      throw new ConflictException(
        'A pending invitation already exists for this email',
      );
    }

    const data = {
      role: dto.role,
      token,
      status: InvitationStatus.pending,
      invitedById: inviterId,
      expiresAt,
    };

    const invitation = existing
      ? await this.prisma.projectInvitation.update({
          where: { id: existing.id },
          data,
          select: INVITE_SELECT,
        })
      : await this.prisma.projectInvitation.create({
          data: { projectId, email, ...data },
          select: INVITE_SELECT,
        });

    this.logger.log(
      `Invitation for ${email} to project ${projectId}: ${this.acceptUrl(token)}`,
    );

    return { ...invitation, acceptUrl: this.acceptUrl(invitation.token) };
  }

  // --------------------------------------------------------------------------
  // findForProject — GET /projects/:projectId/invitations (owner/admin)
  // --------------------------------------------------------------------------
  async findForProject(
    projectId: string,
    userId: string,
  ): Promise<InvitationItem[]> {
    await this.access.assertAccess(projectId, userId, [Role.admin]);

    const rows = await this.prisma.projectInvitation.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: INVITE_SELECT,
    });
    return rows.map((r) => ({ ...r, acceptUrl: this.acceptUrl(r.token) }));
  }

  // --------------------------------------------------------------------------
  // revoke — DELETE /projects/:projectId/invitations/:invitationId (owner/admin)
  // --------------------------------------------------------------------------
  async revoke(
    projectId: string,
    invitationId: string,
    userId: string,
  ): Promise<{ message: string }> {
    await this.access.assertAccess(projectId, userId, [Role.admin]);

    const result = await this.prisma.projectInvitation.deleteMany({
      where: { id: invitationId, projectId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Invitation not found');
    }
    return { message: 'Invitation revoked' };
  }

  // --------------------------------------------------------------------------
  // findMine — GET /invitations (the invitee's pending invitations)
  // --------------------------------------------------------------------------
  async findMine(userEmail: string): Promise<MyInvitationItem[]> {
    const email = userEmail.toLowerCase();
    const rows = await this.prisma.projectInvitation.findMany({
      where: {
        email,
        status: InvitationStatus.pending,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        role: true,
        token: true,
        expiresAt: true,
        createdAt: true,
        project: { select: { id: true, name: true } },
        invitedBy: { select: { username: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      projectId: r.project.id,
      projectName: r.project.name,
      role: r.role,
      token: r.token,
      acceptUrl: this.acceptUrl(r.token),
      invitedBy: r.invitedBy.username,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
    }));
  }

  // --------------------------------------------------------------------------
  // accept — POST /invitations/:token/accept
  // --------------------------------------------------------------------------
  async accept(
    token: string,
    userId: string,
    userEmail: string,
  ): Promise<{ message: string; projectId: string; role: Role }> {
    const invitation = await this.loadForResponse(token, userEmail);

    if (new Date(invitation.expiresAt) < new Date()) {
      await this.prisma.projectInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.expired },
      });
      throw new GoneException('Invitation has expired');
    }

    await this.prisma.$transaction(async (tx) => {
      // upsert so re-accepting / already-a-member is harmless.
      await tx.projectMember.upsert({
        where: {
          projectId_userId: { projectId: invitation.projectId, userId },
        },
        create: {
          projectId: invitation.projectId,
          userId,
          role: invitation.role,
        },
        update: {},
      });
      await tx.projectInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.accepted },
      });
    });

    return {
      message: 'Invitation accepted',
      projectId: invitation.projectId,
      role: invitation.role,
    };
  }

  // --------------------------------------------------------------------------
  // decline — POST /invitations/:token/decline
  // --------------------------------------------------------------------------
  async decline(
    token: string,
    userEmail: string,
  ): Promise<{ message: string }> {
    const invitation = await this.loadForResponse(token, userEmail);
    await this.prisma.projectInvitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.declined },
    });
    return { message: 'Invitation declined' };
  }

  /** Load a pending invitation by token and verify it belongs to the caller. */
  private async loadForResponse(token: string, userEmail: string) {
    const invitation = await this.prisma.projectInvitation.findUnique({
      where: { token },
      select: {
        id: true,
        projectId: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
      },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address',
      );
    }
    if (invitation.status !== InvitationStatus.pending) {
      throw new ConflictException(`Invitation is already ${invitation.status}`);
    }
    return invitation;
  }
}
