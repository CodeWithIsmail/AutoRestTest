import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role, SuiteStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { TestSuitesService } from './test-suites.service';

const PROJECT_ID = 'project-1';
const USER_ID = 'user-1';
const SUITE_ID = 'suite-1';

describe('TestSuitesService', () => {
  let service: TestSuitesService;
  let prisma: {
    endpoint: { count: jest.Mock };
    testSuite: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let access: { assertAccess: jest.Mock };

  beforeEach(() => {
    prisma = {
      endpoint: { count: jest.fn() },
      testSuite: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    access = { assertAccess: jest.fn().mockResolvedValue(undefined) };
    service = new TestSuitesService(
      prisma as unknown as PrismaService,
      access as unknown as ProjectAccessService,
    );
  });

  describe('create', () => {
    const dto = {
      name: 'Smoke run',
      targetUrl: 'http://localhost:8080',
      timeBudget: 300,
      mutationRate: 0.3,
    };

    it('creates a pending run for owner/admin/tester when endpoints exist', async () => {
      prisma.endpoint.count.mockResolvedValue(5);
      prisma.testSuite.create.mockResolvedValue({
        id: SUITE_ID,
        name: 'Smoke run',
        status: SuiteStatus.pending,
        targetUrl: 'http://localhost:8080',
        timeBudget: 300,
        mutationRate: 0.3,
        totalEndpoints: 0,
        coveredEndpoints: 0,
        totalTestCases: 0,
        passedTestCases: 0,
        failedTestCases: 0,
        createdAt: new Date(),
        startedAt: null,
        completedAt: null,
        jobId: null,
        triggeredById: USER_ID,
      });

      const result = await service.create(PROJECT_ID, USER_ID, dto);

      expect(result.status).toBe(SuiteStatus.pending);
      expect(result.triggeredById).toBe(USER_ID);
      // owner/admin/tester may configure a run
      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID, [
        Role.admin,
        Role.tester,
      ]);
      const createCalls = prisma.testSuite.create.mock.calls as Array<
        [{ data: { status: SuiteStatus; triggeredById: string } }]
      >;
      const createArg = createCalls[0][0];
      expect(createArg.data.status).toBe(SuiteStatus.pending);
      expect(createArg.data.triggeredById).toBe(USER_ID);
    });

    it('rejects creating a run when the project has no endpoints', async () => {
      prisma.endpoint.count.mockResolvedValue(0);

      await expect(service.create(PROJECT_ID, USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.testSuite.create).not.toHaveBeenCalled();
    });

    it('propagates an access-denied error (e.g. viewer cannot create)', async () => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(service.create(PROJECT_ID, USER_ID, dto)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.endpoint.count).not.toHaveBeenCalled();
      expect(prisma.testSuite.create).not.toHaveBeenCalled();
    });

    it('omits mutationRate so the schema default applies when not provided', async () => {
      prisma.endpoint.count.mockResolvedValue(1);
      prisma.testSuite.create.mockResolvedValue({});

      await service.create(PROJECT_ID, USER_ID, {
        targetUrl: 'https://api.example.com',
        timeBudget: 60,
      });

      const createCalls = prisma.testSuite.create.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect('mutationRate' in createCalls[0][0].data).toBe(false);
    });
  });

  describe('findForProject', () => {
    it('lists runs for any member, newest first', async () => {
      const rows = [{ id: SUITE_ID }];
      prisma.testSuite.findMany.mockResolvedValue(rows);

      const result = await service.findForProject(PROJECT_ID, USER_ID);

      expect(result).toEqual(rows);
      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
      const findCalls = prisma.testSuite.findMany.mock.calls as Array<
        [{ orderBy: { createdAt: string } }]
      >;
      expect(findCalls[0][0].orderBy).toEqual({ createdAt: 'desc' });
    });

    it('propagates an access-denied error', async () => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(service.findForProject(PROJECT_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findOne', () => {
    it('returns a run scoped to the project', async () => {
      prisma.testSuite.findFirst.mockResolvedValue({ id: SUITE_ID });

      const result = await service.findOne(PROJECT_ID, SUITE_ID, USER_ID);

      expect(result).toEqual({ id: SUITE_ID });
      const findCalls = prisma.testSuite.findFirst.mock.calls as Array<
        [{ where: { id: string; projectId: string } }]
      >;
      expect(findCalls[0][0].where).toEqual({
        id: SUITE_ID,
        projectId: PROJECT_ID,
      });
    });

    it('404s when the run is not in the project', async () => {
      prisma.testSuite.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(PROJECT_ID, SUITE_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a run for owner/admin', async () => {
      prisma.testSuite.deleteMany.mockResolvedValue({ count: 1 });

      await expect(
        service.remove(PROJECT_ID, SUITE_ID, USER_ID),
      ).resolves.toEqual({ message: 'Test suite deleted successfully' });
      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID, [
        Role.admin,
      ]);
      expect(prisma.testSuite.deleteMany).toHaveBeenCalledWith({
        where: { id: SUITE_ID, projectId: PROJECT_ID },
      });
    });

    it('404s when there is no matching run', async () => {
      prisma.testSuite.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.remove(PROJECT_ID, SUITE_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates an access-denied error', async () => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(
        service.remove(PROJECT_ID, SUITE_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
