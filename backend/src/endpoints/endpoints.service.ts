import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HttpMethod, Prisma, Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { CreateEndpointDto } from './dto/create-endpoint.dto';

/** Shape of an endpoint as returned by the API. */
export interface EndpointItem {
  id: string;
  method: HttpMethod;
  path: string;
  description: string | null;
  addedManually: boolean;
  createdAt: Date;
}

@Injectable()
export class EndpointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  // --------------------------------------------------------------------------
  // findForProject — GET /projects/:projectId/endpoints
  // Any project member may read.
  // --------------------------------------------------------------------------
  async findForProject(
    projectId: string,
    userId: string,
  ): Promise<EndpointItem[]> {
    await this.access.assertAccess(projectId, userId);

    return this.prisma.endpoint.findMany({
      where: { projectId },
      orderBy: [{ path: 'asc' }, { method: 'asc' }],
      select: {
        id: true,
        method: true,
        path: true,
        description: true,
        addedManually: true,
        createdAt: true,
      },
    });
  }

  // --------------------------------------------------------------------------
  // createManual — POST /projects/:projectId/endpoints
  // Owner or admin only. Flags the endpoint as manually added.
  // --------------------------------------------------------------------------
  async createManual(
    projectId: string,
    userId: string,
    dto: CreateEndpointDto,
  ): Promise<EndpointItem> {
    await this.access.assertAccess(projectId, userId, [Role.admin]);

    try {
      return await this.prisma.endpoint.create({
        data: {
          projectId,
          method: dto.method,
          path: dto.path,
          description: dto.description ?? null,
          addedManually: true,
        },
        select: {
          id: true,
          method: true,
          path: true,
          description: true,
          addedManually: true,
          createdAt: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `An endpoint ${dto.method} ${dto.path} already exists for this project`,
        );
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // remove — DELETE /projects/:projectId/endpoints/:endpointId
  // Owner or admin only.
  // --------------------------------------------------------------------------
  async remove(
    projectId: string,
    endpointId: string,
    userId: string,
  ): Promise<{ message: string }> {
    await this.access.assertAccess(projectId, userId, [Role.admin]);

    // deleteMany scoped by projectId ensures an endpoint from another project
    // can't be deleted via this project's route; count 0 means not found here.
    const result = await this.prisma.endpoint.deleteMany({
      where: { id: endpointId, projectId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Endpoint not found');
    }

    return { message: 'Endpoint deleted successfully' };
  }
}
