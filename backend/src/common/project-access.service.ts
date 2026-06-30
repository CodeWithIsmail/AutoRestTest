import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Shared project authorization. Centralizes the owner/member/role check used by
 * every project-scoped feature module (specs, endpoints, and future ones) so
 * the access rules live in exactly one place.
 */
@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensure `userId` may act on the project.
   *
   * - Without `mutatingRoles`: any owner or member (incl. viewer) passes — use
   *   for read access.
   * - With `mutatingRoles`: the caller must be the owner OR a member holding
   *   one of those roles — use for writes.
   *
   * Throws `NotFoundException` (404) if the project is missing, or
   * `ForbiddenException` (403) if the caller lacks access.
   */
  async assertAccess(
    projectId: string,
    userId: string,
    mutatingRoles?: Role[],
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        members: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isOwner = project.ownerId === userId;
    const membership = project.members[0];

    if (!isOwner && !membership) {
      throw new ForbiddenException('You do not have access to this project');
    }

    if (mutatingRoles && !isOwner) {
      if (!membership || !mutatingRoles.includes(membership.role)) {
        throw new ForbiddenException(
          'You do not have permission to perform this action on this project',
        );
      }
    }
  }
}
