import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HttpMethod, Prisma, Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { EndpointsService } from './endpoints.service';

const PROJECT_ID = 'project-1';
const USER_ID = 'user-1';
const ENDPOINT_ID = 'endpoint-1';

describe('EndpointsService', () => {
  let service: EndpointsService;
  let prisma: {
    endpoint: {
      findMany: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let access: { assertAccess: jest.Mock };

  beforeEach(() => {
    prisma = {
      endpoint: {
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    access = { assertAccess: jest.fn().mockResolvedValue(undefined) };
    service = new EndpointsService(
      prisma as unknown as PrismaService,
      access as unknown as ProjectAccessService,
    );
  });

  describe('findForProject', () => {
    it('lists endpoints for any member (read access)', async () => {
      const rows = [
        {
          id: ENDPOINT_ID,
          method: HttpMethod.GET,
          path: '/users',
          description: null,
          addedManually: false,
          createdAt: new Date(),
        },
      ];
      prisma.endpoint.findMany.mockResolvedValue(rows);

      const result = await service.findForProject(PROJECT_ID, USER_ID);

      expect(result).toEqual(rows);
      // read access => no mutating roles required
      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
    });

    it('propagates an access-denied error', async () => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(service.findForProject(PROJECT_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createManual', () => {
    const dto = {
      method: HttpMethod.POST,
      path: '/orders',
      description: 'Create order',
    };

    it('creates a manually-added endpoint for owner/admin', async () => {
      prisma.endpoint.create.mockResolvedValue({
        id: 'new-1',
        method: HttpMethod.POST,
        path: '/orders',
        description: 'Create order',
        addedManually: true,
        createdAt: new Date(),
      });

      const result = await service.createManual(PROJECT_ID, USER_ID, dto);

      expect(result.addedManually).toBe(true);
      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID, [
        Role.admin,
      ]);
      const createCalls = prisma.endpoint.create.mock.calls as Array<
        [{ data: { addedManually: boolean; projectId: string } }]
      >;
      const createArg = createCalls[0][0];
      expect(createArg.data.addedManually).toBe(true);
      expect(createArg.data.projectId).toBe(PROJECT_ID);
    });

    it('throws 409 on a duplicate path+method', async () => {
      prisma.endpoint.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.createManual(PROJECT_ID, USER_ID, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('propagates an access-denied error', async () => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(
        service.createManual(PROJECT_ID, USER_ID, dto),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.endpoint.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes an endpoint belonging to the project', async () => {
      prisma.endpoint.deleteMany.mockResolvedValue({ count: 1 });

      await expect(
        service.remove(PROJECT_ID, ENDPOINT_ID, USER_ID),
      ).resolves.toEqual({ message: 'Endpoint deleted successfully' });
      expect(prisma.endpoint.deleteMany).toHaveBeenCalledWith({
        where: { id: ENDPOINT_ID, projectId: PROJECT_ID },
      });
    });

    it('404s when the endpoint is not in the project', async () => {
      prisma.endpoint.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.remove(PROJECT_ID, ENDPOINT_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates an access-denied error', async () => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(
        service.remove(PROJECT_ID, ENDPOINT_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
