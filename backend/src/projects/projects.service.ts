import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Prisma,
  Role,
  SpecGenStatus,
  SuiteStatus,
} from '../../generated/prisma/client';
import { verifyPassword } from '../auth/password';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { DeleteProjectDto } from './dto/delete-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

/** Default role assigned to a user when they create or own a project. */
const OWNER_PROJECT_ROLE: Role = Role.admin;

/** The project's most recent test run, as summarized for the list view. */
export interface ProjectListItemLastRun {
  status: SuiteStatus;
  createdAt: Date;
  completedAt: Date | null;
}

/** Shape of a single project as returned by GET /projects (list view). */
export interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  memberCount: number;
  role: Role;
  /** Whether the project has no spec, an uploaded one, or an AI-generated one. */
  specStatus: 'none' | 'uploaded' | 'generated';
  /** Set only while a spec-generation job is in-flight or awaiting review. */
  generationStatus: SpecGenStatus | null;
  /** The most recent test run, or null if none has ever been triggered. */
  lastRun: ProjectListItemLastRun | null;
  /**
   * Latest known activity on the project: the max of `updatedAt`, the spec's
   * upload time, and the latest run's completion/start time. `updatedAt`
   * alone only reflects name/description edits, so it understates activity
   * on projects that have been tested or had a spec uploaded since.
   */
  lastActivityAt: Date;
}

/** Shape of a single project as returned by GET /projects/:id (detail view). */
export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  owner: {
    id: string;
    username: string;
    email: string;
  };
  members: Array<{
    userId: string;
    username: string;
    email: string;
    role: Role;
    joinedAt: Date;
  }>;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  // --------------------------------------------------------------------------
  // create — POST /projects
  // --------------------------------------------------------------------------
  async create(ownerId: string, dto: CreateProjectDto): Promise<ProjectDetail> {
    const name = dto.name.trim();

    if (!name) {
      throw new BadRequestException('Name is required');
    }

    // Project + ProjectMember must succeed together or not at all.
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name,
          description: dto.description ?? null,
          ownerId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          ownerId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.projectMember.create({
        data: {
          projectId: created.id,
          userId: ownerId,
          role: OWNER_PROJECT_ROLE,
        },
      });

      return created;
    });

    return this.findOne(project.id, ownerId);
  }

  // --------------------------------------------------------------------------
  // findAllForUser — GET /projects
  // --------------------------------------------------------------------------
  async findAllForUser(userId: string): Promise<ProjectListItem[]> {
    // Find every project the user can see (owner OR member).
    const projects = await this.prisma.project.findMany({
      where: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        members: {
          select: { role: true, userId: true },
        },
        // 1:1 relations — cheap to include, no ordering/take needed.
        spec: { select: { generatedByAI: true, uploadedAt: true } },
        specGeneration: { select: { status: true } },
        // TestSuite is unbounded per project, so only the latest row is
        // pulled (rather than the members-style JS reduction) to avoid
        // ever loading a project's full run history for a list page.
        testSuites: {
          select: { status: true, createdAt: true, completedAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return projects.map((project) => {
      // The current user's membership — they may appear as owner-only,
      // member-only, or both. Prefer the explicit member role when present
      // (matches what GET /projects/:id returns via the members list).
      const explicitMembership = project.members.find(
        (m) => m.userId === userId,
      );
      const role: Role =
        explicitMembership?.role ??
        (project.ownerId === userId ? OWNER_PROJECT_ROLE : Role.viewer);

      const specStatus: ProjectListItem['specStatus'] = !project.spec
        ? 'none'
        : project.spec.generatedByAI
          ? 'generated'
          : 'uploaded';

      const generationStatus = project.specGeneration?.status ?? null;

      const latestSuite = project.testSuites[0] ?? null;
      const lastRun: ProjectListItemLastRun | null = latestSuite
        ? {
            status: latestSuite.status,
            createdAt: latestSuite.createdAt,
            completedAt: latestSuite.completedAt,
          }
        : null;

      const lastActivityAt = [
        project.updatedAt,
        project.spec?.uploadedAt,
        lastRun?.completedAt ?? lastRun?.createdAt,
      ]
        .filter((d): d is Date => Boolean(d))
        .reduce((max, d) => (d > max ? d : max), project.createdAt);

      return {
        id: project.id,
        name: project.name,
        description: project.description,
        ownerId: project.ownerId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        memberCount: project.members.length,
        role,
        specStatus,
        generationStatus,
        lastRun,
        lastActivityAt,
      };
    });
  }

  // --------------------------------------------------------------------------
  // findOne — GET /projects/:id
  // --------------------------------------------------------------------------
  async findOne(projectId: string, userId: string): Promise<ProjectDetail> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        description: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: { id: true, username: true, email: true },
        },
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

    const isOwner = project.ownerId === userId;
    const isMember = project.members.some((m) => m.userId === userId);
    if (!isOwner && !isMember) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      ownerId: project.ownerId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      owner: project.owner,
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
  // update — PATCH /projects/:id
  // --------------------------------------------------------------------------
  async update(
    projectId: string,
    userId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectDetail> {
    if (dto.name === undefined && dto.description === undefined) {
      throw new BadRequestException(
        'Provide at least one field to update (name or description)',
      );
    }

    const data: Prisma.ProjectUpdateInput = {};

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (!trimmed) {
        throw new BadRequestException('Name cannot be empty');
      }
      data.name = trimmed;
    }

    if (dto.description !== undefined) {
      // Allow explicit null to clear the description.
      data.description = dto.description === null ? null : dto.description;
    }

    try {
      // updateMany with owner filter doubles as a 404/403 check in one query:
      // if the count is 0 we either don't own it or it doesn't exist.
      const result = await this.prisma.project.updateMany({
        where: { id: projectId, ownerId: userId },
        data,
      });

      if (result.count === 0) {
        await this.assertOwnerOrNotFound(projectId, userId);
      }
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException('Project not found');
      }
      throw err;
    }

    return this.findOne(projectId, userId);
  }

  // --------------------------------------------------------------------------
  // remove — DELETE /projects/:id
  // --------------------------------------------------------------------------
  async remove(
    projectId: string,
    userId: string,
    dto: DeleteProjectDto,
  ): Promise<{ message: string }> {
    // findUnique lets us distinguish 404 from 403 cleanly.
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        ownerId: true,
        owner: { select: { password: true } },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the project owner can delete this project',
      );
    }

    // A valid session is not enough for something this irreversible — an
    // unattended laptop should not be able to destroy the project this way.
    const matches = await verifyPassword(dto.password, project.owner.password);
    if (!matches) {
      throw new UnauthorizedException('Password is incorrect.');
    }

    // ProjectMember rows are removed automatically via the
    // `onDelete: Cascade` relation in the Prisma schema.
    await this.prisma.project.delete({
      where: { id: projectId },
    });

    return { message: 'Project deleted successfully' };
  }

  // --------------------------------------------------------------------------
  // private helpers
  // --------------------------------------------------------------------------

  /**
   * After a failed updateMany, decide whether the project was missing (404)
   * or whether the caller just isn't the owner (403).
   */
  private async assertOwnerOrNotFound(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the project owner can update this project',
      );
    }
  }
}
