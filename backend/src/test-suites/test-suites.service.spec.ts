import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HttpMethod, Role, SuiteStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { EngineService } from '../engine/engine.service';
import { TestSuitesService } from './test-suites.service';

const PROJECT_ID = 'project-1';
const USER_ID = 'user-1';
const SUITE_ID = 'suite-1';

describe('TestSuitesService', () => {
  let service: TestSuitesService;
  let prisma: {
    endpoint: { count: jest.Mock; findMany: jest.Mock };
    apiSpecification: { findUnique: jest.Mock };
    testSuite: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
      update: jest.Mock;
    };
    testCase: {
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      createMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let access: { assertAccess: jest.Mock };
  let engine: {
    startRun: jest.Mock;
    getStatus: jest.Mock;
    getResult: jest.Mock;
    getRequests: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      endpoint: { count: jest.fn(), findMany: jest.fn() },
      apiSpecification: { findUnique: jest.fn() },
      testSuite: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
      testCase: {
        findMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      requestLog: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };
    access = { assertAccess: jest.fn().mockResolvedValue(undefined) };
    engine = {
      startRun: jest.fn(),
      getStatus: jest.fn(),
      getResult: jest.fn(),
      getRequests: jest.fn().mockResolvedValue([]),
    };
    service = new TestSuitesService(
      prisma as unknown as PrismaService,
      access as unknown as ProjectAccessService,
      engine as unknown as EngineService,
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

  describe('run', () => {
    beforeEach(() => {
      // Prevent the real background timer from firing during unit tests.
      jest
        .spyOn(
          service as unknown as { beginPolling: () => void },
          'beginPolling',
        )
        .mockImplementation(() => {});
    });

    function stubRunnableSuite() {
      prisma.testSuite.findFirst.mockResolvedValue({
        id: SUITE_ID,
        status: SuiteStatus.pending,
        targetUrl: 'http://localhost:8080',
        timeBudget: 300,
        mutationRate: 0.2,
      });
      prisma.apiSpecification.findUnique.mockResolvedValue({
        fileContent: 'openapi: 3.0.0',
      });
      engine.startRun.mockResolvedValue({
        jobId: 'job-1',
        status: 'pending',
        error: null,
      });
      prisma.testSuite.update.mockResolvedValue({
        id: SUITE_ID,
        status: SuiteStatus.running,
        jobId: 'job-1',
      });
    }

    it('starts a run: calls the engine and moves the suite to running', async () => {
      stubRunnableSuite();

      const result = await service.run(PROJECT_ID, SUITE_ID, USER_ID);

      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID, [
        Role.admin,
        Role.tester,
      ]);
      expect(engine.startRun).toHaveBeenCalledWith({
        spec: 'openapi: 3.0.0',
        targetUrl: 'http://localhost:8080',
        timeBudget: 300,
        mutationRate: 0.2,
      });
      const updateCalls = prisma.testSuite.update.mock.calls as Array<
        [{ data: { status: SuiteStatus; jobId: string } }]
      >;
      expect(updateCalls[0][0].data.status).toBe(SuiteStatus.running);
      expect(updateCalls[0][0].data.jobId).toBe('job-1');
      expect(result.status).toBe(SuiteStatus.running);
    });

    it('404s when the suite is not in the project', async () => {
      prisma.testSuite.findFirst.mockResolvedValue(null);

      await expect(service.run(PROJECT_ID, SUITE_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(engine.startRun).not.toHaveBeenCalled();
    });

    it('409s when the suite is already running', async () => {
      prisma.testSuite.findFirst.mockResolvedValue({
        id: SUITE_ID,
        status: SuiteStatus.running,
        targetUrl: 'http://x',
        timeBudget: 60,
        mutationRate: 0.2,
      });

      await expect(service.run(PROJECT_ID, SUITE_ID, USER_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(engine.startRun).not.toHaveBeenCalled();
    });

    it('400s when the project has no spec', async () => {
      prisma.testSuite.findFirst.mockResolvedValue({
        id: SUITE_ID,
        status: SuiteStatus.pending,
        targetUrl: 'http://x',
        timeBudget: 60,
        mutationRate: 0.2,
      });
      prisma.apiSpecification.findUnique.mockResolvedValue(null);

      await expect(service.run(PROJECT_ID, SUITE_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(engine.startRun).not.toHaveBeenCalled();
    });
  });

  describe('persistResults', () => {
    const result = {
      summary: {
        totalOperations: 2,
        successfullyProcessed: 1,
        coveragePct: 50,
        totalRequests: 30,
        statusCodeDistribution: { '200': 21, '404': 6, '500': 3 },
        uniqueServerErrors: 3,
        operationsWithServerErrors: 1,
      },
      operations: [
        {
          operationId: 'listPets',
          method: 'GET',
          path: '/pets',
          statusCodes: { '200': 20 },
          totalRequests: 20,
          passed: true,
          serverErrors: [],
        },
        {
          operationId: 'delPet',
          method: 'DELETE',
          path: '/pets/{id}',
          statusCodes: { '500': 3 },
          totalRequests: 3,
          passed: false,
          serverErrors: [{ status_code: 500 }],
        },
        {
          operationId: 'ghost',
          method: 'PUT',
          path: '/not-in-project',
          statusCodes: { '200': 1 },
          totalRequests: 1,
          passed: true,
          serverErrors: [],
        },
      ],
      operationStatusCodes: {},
      serverErrors: {},
      rawReport: {},
    };

    it('computes counters and creates a TestCase per matched endpoint', async () => {
      prisma.endpoint.findMany.mockResolvedValue([
        { id: 'ep-get', method: HttpMethod.GET, path: '/pets' },
        { id: 'ep-del', method: HttpMethod.DELETE, path: '/pets/{id}' },
      ]);

      await (
        service as unknown as {
          persistResults: (
            p: string,
            s: string,
            j: string,
            r: unknown,
          ) => Promise<void>;
        }
      ).persistResults(PROJECT_ID, SUITE_ID, 'job-1', result);

      // Only the two matched operations become rows; "ghost" is skipped.
      const createCalls = prisma.testCase.createMany.mock.calls as Array<
        [{ data: Array<{ endpointId: string; passed: boolean }> }]
      >;
      const rows = createCalls[0][0].data;
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.endpointId).sort()).toEqual([
        'ep-del',
        'ep-get',
      ]);

      const updateCalls = prisma.testSuite.update.mock.calls as Array<
        [
          {
            data: {
              status: SuiteStatus;
              passedTestCases: number;
              failedTestCases: number;
              totalTestCases: number;
              coveredEndpoints: number;
            };
          },
        ]
      >;
      const data = updateCalls[0][0].data;
      expect(data.status).toBe(SuiteStatus.completed);
      expect(data.totalTestCases).toBe(30);
      expect(data.passedTestCases).toBe(21); // only 2xx
      expect(data.failedTestCases).toBe(9);
      expect(data.coveredEndpoints).toBe(1);
    });
  });

  describe('findTestCases', () => {
    it('returns flattened per-endpoint rows for a member', async () => {
      prisma.testSuite.findFirst.mockResolvedValue({ id: SUITE_ID });
      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'tc-1',
          endpointId: 'ep-1',
          statusCode: 200,
          passed: true,
          responseBody: { '200': 20 },
          failureExplanation: null,
          createdAt: new Date(),
          endpoint: { method: HttpMethod.GET, path: '/pets' },
        },
      ]);

      const rows = await service.findTestCases(PROJECT_ID, SUITE_ID, USER_ID);

      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
      expect(rows[0]).toMatchObject({
        endpointId: 'ep-1',
        method: HttpMethod.GET,
        path: '/pets',
        passed: true,
      });
    });

    it('404s when the suite is not in the project', async () => {
      prisma.testSuite.findFirst.mockResolvedValue(null);

      await expect(
        service.findTestCases(PROJECT_ID, SUITE_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
