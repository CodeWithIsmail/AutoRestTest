import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HttpMethod, Role, SuiteStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { LlmService } from './llm.service';
import { ReportsService } from './reports.service';

const PROJECT_ID = 'project-1';
const SUITE_ID = 'suite-1';
const USER_ID = 'user-1';

const COMPLETED_SUITE = {
  id: SUITE_ID,
  name: 'Nightly',
  status: SuiteStatus.completed,
  targetUrl: 'http://localhost:8080',
  startedAt: new Date('2026-07-01T00:00:00Z'),
  completedAt: new Date('2026-07-01T00:02:00Z'), // +120s
  totalEndpoints: 2,
  coveredEndpoints: 1,
  totalTestCases: 10,
  passedTestCases: 7,
  failedTestCases: 3,
};

const CASES = [
  {
    endpointId: 'ep-1',
    passed: true,
    responseBody: { statusCodes: { '200': 7 }, serverErrors: [] },
    failureExplanation: null,
    endpoint: { method: HttpMethod.GET, path: '/pets' },
  },
  {
    endpointId: 'ep-2',
    passed: false,
    responseBody: { statusCodes: { '500': 3 }, serverErrors: [{ x: 1 }] },
    failureExplanation: null,
    endpoint: { method: HttpMethod.DELETE, path: '/pets/{id}' },
  },
];

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    testSuite: { findFirst: jest.Mock };
    testCase: { findMany: jest.Mock; update: jest.Mock };
  };
  let access: { assertAccess: jest.Mock };
  let llm: { assertUsable: jest.Mock; explainFailure: jest.Mock };

  beforeEach(() => {
    prisma = {
      testSuite: { findFirst: jest.fn() },
      testCase: { findMany: jest.fn(), update: jest.fn() },
    };
    access = { assertAccess: jest.fn().mockResolvedValue(undefined) };
    llm = {
      assertUsable: jest.fn(),
      explainFailure: jest.fn().mockResolvedValue('because reasons'),
    };
    service = new ReportsService(
      prisma as unknown as PrismaService,
      access as unknown as ProjectAccessService,
      llm as unknown as LlmService,
    );
  });

  describe('getReport', () => {
    it('aggregates counters, coverage, and status distribution', async () => {
      prisma.testSuite.findFirst.mockResolvedValue(COMPLETED_SUITE);
      prisma.testCase.findMany.mockResolvedValue(CASES);

      const report = await service.getReport(PROJECT_ID, SUITE_ID, USER_ID);

      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID);
      expect(report.overview.coveragePct).toBe(50);
      expect(report.overview.passRatePct).toBe(70);
      expect(report.overview.durationSeconds).toBe(120);
      expect(report.statusCodeDistribution).toEqual({ '200': 7, '500': 3 });
      expect(report.endpoints).toHaveLength(2);
      expect(report.failures).toHaveLength(1);
      expect(report.failures[0].method).toBe(HttpMethod.DELETE);
      expect(report.failures[0].hasServerErrors).toBe(true);
    });

    it('404s when the suite is not in the project', async () => {
      prisma.testSuite.findFirst.mockResolvedValue(null);
      await expect(
        service.getReport(PROJECT_ID, SUITE_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('409s when the run has not completed', async () => {
      prisma.testSuite.findFirst.mockResolvedValue({
        ...COMPLETED_SUITE,
        status: SuiteStatus.running,
      });
      await expect(
        service.getReport(PROJECT_ID, SUITE_ID, USER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('handles legacy responseBody stored as a bare distribution', async () => {
      prisma.testSuite.findFirst.mockResolvedValue(COMPLETED_SUITE);
      prisma.testCase.findMany.mockResolvedValue([
        {
          endpointId: 'ep-1',
          passed: true,
          responseBody: { '200': 5 }, // old shape
          failureExplanation: null,
          endpoint: { method: HttpMethod.GET, path: '/pets' },
        },
      ]);

      const report = await service.getReport(PROJECT_ID, SUITE_ID, USER_ID);
      expect(report.statusCodeDistribution).toEqual({ '200': 5 });
      expect(report.endpoints[0].hasServerErrors).toBe(false);
    });
  });

  describe('explainFailures', () => {
    it('requires a mutating role and generates + persists explanations', async () => {
      prisma.testSuite.findFirst.mockResolvedValue(COMPLETED_SUITE);
      prisma.testCase.findMany.mockResolvedValue([
        {
          id: 'tc-2',
          endpointId: 'ep-2',
          responseBody: { statusCodes: { '500': 3 }, serverErrors: [{ x: 1 }] },
          endpoint: { method: HttpMethod.DELETE, path: '/pets/{id}' },
        },
      ]);

      const out = await service.explainFailures(PROJECT_ID, SUITE_ID, USER_ID);

      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID, [
        Role.admin,
        Role.tester,
      ]);
      expect(llm.assertUsable).toHaveBeenCalled();
      expect(llm.explainFailure).toHaveBeenCalledTimes(1);
      expect(prisma.testCase.update).toHaveBeenCalledWith({
        where: { id: 'tc-2' },
        data: { failureExplanation: 'because reasons' },
      });
      expect(out[0].failureExplanation).toBe('because reasons');
    });

    it('propagates an access-denied error', async () => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());
      await expect(
        service.explainFailures(PROJECT_ID, SUITE_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
