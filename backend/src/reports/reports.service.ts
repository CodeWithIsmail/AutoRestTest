import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HttpMethod, Role, SuiteStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { LlmService } from './llm.service';

export interface ReportEndpoint {
  endpointId: string;
  method: HttpMethod;
  path: string;
  passed: boolean;
  statusCodes: Record<string, number>;
  hasServerErrors: boolean;
  failureExplanation: string | null;
}

export interface SuiteReport {
  overview: {
    suiteId: string;
    name: string | null;
    status: SuiteStatus;
    targetUrl: string;
    startedAt: Date | null;
    completedAt: Date | null;
    durationSeconds: number | null;
    totalEndpoints: number;
    coveredEndpoints: number;
    coveragePct: number;
    totalTestCases: number;
    passedTestCases: number;
    failedTestCases: number;
    passRatePct: number;
  };
  statusCodeDistribution: Record<string, number>;
  endpoints: ReportEndpoint[];
  failures: ReportEndpoint[];
}

const RUN_MUTATING_ROLES: Role[] = [Role.admin, Role.tester];

// Shape stored in TestCase.responseBody by the executor.
interface StoredResponse {
  statusCodes?: Record<string, number>;
  serverErrors?: unknown[];
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly llm: LlmService,
  ) {}

  // --------------------------------------------------------------------------
  // getReport — GET /projects/:projectId/test-suites/:suiteId/report
  // --------------------------------------------------------------------------
  async getReport(
    projectId: string,
    suiteId: string,
    userId: string,
  ): Promise<SuiteReport> {
    await this.access.assertAccess(projectId, userId);
    const suite = await this.loadSuite(projectId, suiteId, {
      requireCompleted: true,
    });

    const cases = await this.prisma.testCase.findMany({
      where: { testSuiteId: suiteId },
      orderBy: { createdAt: 'asc' },
      select: {
        endpointId: true,
        passed: true,
        responseBody: true,
        failureExplanation: true,
        endpoint: { select: { method: true, path: true } },
      },
    });

    const endpoints: ReportEndpoint[] = cases.map((c) => {
      const stored = this.parseResponse(c.responseBody);
      return {
        endpointId: c.endpointId,
        method: c.endpoint.method,
        path: c.endpoint.path,
        passed: c.passed,
        statusCodes: stored.statusCodes ?? {},
        hasServerErrors: (stored.serverErrors?.length ?? 0) > 0,
        failureExplanation: c.failureExplanation,
      };
    });

    const statusCodeDistribution: Record<string, number> = {};
    for (const ep of endpoints) {
      for (const [code, count] of Object.entries(ep.statusCodes)) {
        statusCodeDistribution[code] =
          (statusCodeDistribution[code] ?? 0) + (Number(count) || 0);
      }
    }

    const durationSeconds =
      suite.startedAt && suite.completedAt
        ? Math.max(
            Math.round(
              (suite.completedAt.getTime() - suite.startedAt.getTime()) / 1000,
            ),
            0,
          )
        : null;

    return {
      overview: {
        suiteId: suite.id,
        name: suite.name,
        status: suite.status,
        targetUrl: suite.targetUrl,
        startedAt: suite.startedAt,
        completedAt: suite.completedAt,
        durationSeconds,
        totalEndpoints: suite.totalEndpoints,
        coveredEndpoints: suite.coveredEndpoints,
        coveragePct: pct(suite.coveredEndpoints, suite.totalEndpoints),
        totalTestCases: suite.totalTestCases,
        passedTestCases: suite.passedTestCases,
        failedTestCases: suite.failedTestCases,
        passRatePct: pct(suite.passedTestCases, suite.totalTestCases),
      },
      statusCodeDistribution,
      endpoints,
      failures: endpoints.filter((e) => !e.passed),
    };
  }

  // --------------------------------------------------------------------------
  // explainFailures — POST /projects/:projectId/test-suites/:suiteId/explain
  // Owner/admin/tester. Generates + caches LLM explanations for failed cases.
  // --------------------------------------------------------------------------
  async explainFailures(
    projectId: string,
    suiteId: string,
    userId: string,
  ): Promise<ReportEndpoint[]> {
    await this.access.assertAccess(projectId, userId, RUN_MUTATING_ROLES);
    await this.loadSuite(projectId, suiteId, { requireCompleted: true });
    this.llm.assertUsable();

    const failed = await this.prisma.testCase.findMany({
      where: { testSuiteId: suiteId, passed: false },
      select: {
        id: true,
        endpointId: true,
        responseBody: true,
        endpoint: { select: { method: true, path: true } },
      },
    });

    const results: ReportEndpoint[] = [];
    for (const tc of failed) {
      const stored = this.parseResponse(tc.responseBody);
      const explanation = await this.llm.explainFailure({
        method: tc.endpoint.method,
        path: tc.endpoint.path,
        statusCodes: stored.statusCodes ?? {},
        serverErrors: stored.serverErrors ?? [],
      });
      await this.prisma.testCase.update({
        where: { id: tc.id },
        data: { failureExplanation: explanation },
      });
      results.push({
        endpointId: tc.endpointId,
        method: tc.endpoint.method,
        path: tc.endpoint.path,
        passed: false,
        statusCodes: stored.statusCodes ?? {},
        hasServerErrors: (stored.serverErrors?.length ?? 0) > 0,
        failureExplanation: explanation,
      });
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  private async loadSuite(
    projectId: string,
    suiteId: string,
    opts: { requireCompleted?: boolean } = {},
  ) {
    const suite = await this.prisma.testSuite.findFirst({
      where: { id: suiteId, projectId },
      select: {
        id: true,
        name: true,
        status: true,
        targetUrl: true,
        startedAt: true,
        completedAt: true,
        totalEndpoints: true,
        coveredEndpoints: true,
        totalTestCases: true,
        passedTestCases: true,
        failedTestCases: true,
      },
    });
    if (!suite) {
      throw new NotFoundException('Test suite not found');
    }
    if (opts.requireCompleted && suite.status !== SuiteStatus.completed) {
      throw new ConflictException(
        `Report is available only after the run completes (current status: ${suite.status})`,
      );
    }
    return suite;
  }

  private parseResponse(body: unknown): StoredResponse {
    if (body && typeof body === 'object' && 'statusCodes' in body) {
      return body as StoredResponse;
    }
    // Backwards-compat: older rows stored the distribution directly.
    if (body && typeof body === 'object') {
      return { statusCodes: body as Record<string, number>, serverErrors: [] };
    }
    return { statusCodes: {}, serverErrors: [] };
  }
}

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 10000) / 100;
}
