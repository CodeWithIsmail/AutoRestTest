import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  HttpMethod,
  Prisma,
  Role,
  SuiteStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import {
  EngineRequestRecord,
  EngineResult,
  EngineService,
} from '../engine/engine.service';
import { CreateTestSuiteDto } from './dto/create-test-suite.dto';

/** Run configuration + results summary as returned in list views. */
export interface TestSuiteSummary {
  id: string;
  name: string | null;
  status: SuiteStatus;
  targetUrl: string;
  timeBudget: number;
  mutationRate: number;
  totalEndpoints: number;
  coveredEndpoints: number;
  totalTestCases: number;
  passedTestCases: number;
  failedTestCases: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** A single run with the extra async-job fields exposed. */
export interface TestSuiteDetail extends TestSuiteSummary {
  jobId: string | null;
  triggeredById: string;
}

/** A persisted per-endpoint result row for a completed run. */
export interface TestCaseItem {
  id: string;
  endpointId: string;
  method: HttpMethod;
  path: string;
  statusCode: number | null;
  passed: boolean;
  responseBody: unknown;
  failureExplanation: string | null;
  createdAt: Date;
}

/** Per-endpoint rollup of captured requests for a run. */
export interface RequestLogEndpointSummary {
  endpointId: string | null;
  method: string | null;
  path: string | null;
  total: number;
  passed: number; // 2xx responses
  failed: number; // non-2xx responses
  statusClasses: Record<string, number>; // '2xx' | '3xx' | '4xx' | '5xx' | 'other'
}

/** Lightweight row for the paginated per-endpoint request list. */
export interface RequestLogListItem {
  id: string;
  seq: number;
  method: string;
  path: string;
  statusCode: number | null;
  durationMs: number | null;
}

export interface RequestLogPage {
  items: RequestLogListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Full captured request/response for the expandable detail view. */
export interface RequestLogDetail {
  id: string;
  seq: number;
  endpointId: string | null;
  method: string;
  path: string;
  url: string;
  statusCode: number | null;
  durationMs: number | null;
  requestHeaders: unknown;
  requestBody: string | null;
  requestTruncated: boolean;
  responseHeaders: unknown;
  responseBody: string | null;
  responseTruncated: boolean;
  createdAt: Date;
}

function statusClassRange(
  cls?: string,
): { gte: number; lt: number } | undefined {
  switch (cls) {
    case '2xx':
      return { gte: 200, lt: 300 };
    case '3xx':
      return { gte: 300, lt: 400 };
    case '4xx':
      return { gte: 400, lt: 500 };
    case '5xx':
      return { gte: 500, lt: 600 };
    default:
      return undefined;
  }
}

// select projection shared by the two read shapes.
const SUMMARY_SELECT = {
  id: true,
  name: true,
  status: true,
  targetUrl: true,
  timeBudget: true,
  mutationRate: true,
  totalEndpoints: true,
  coveredEndpoints: true,
  totalTestCases: true,
  passedTestCases: true,
  failedTestCases: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  jobId: true,
  triggeredById: true,
} as const;

// Roles (besides owner) allowed to configure/trigger a run. Testers are the
// role meant to run tests, so they may create suites — unlike specs/endpoints
// where only owner/admin may write.
const RUN_MUTATING_ROLES: Role[] = [Role.admin, Role.tester];

// Background polling cadence + safety cap on how long we track a single job.
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 1500; // ~75 min at 3s

@Injectable()
export class TestSuitesService {
  private readonly logger = new Logger(TestSuitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly engine: EngineService,
  ) {}

  // --------------------------------------------------------------------------
  // create — POST /projects/:projectId/test-suites
  // Owner, admin, or tester. Creates the run record in `pending`.
  // --------------------------------------------------------------------------
  async create(
    projectId: string,
    userId: string,
    dto: CreateTestSuiteDto,
  ): Promise<TestSuiteDetail> {
    await this.access.assertAccess(projectId, userId, RUN_MUTATING_ROLES);

    // A run needs something to test — block configuring one against a project
    // that has no endpoints yet (upload a spec or add endpoints first).
    const endpointCount = await this.prisma.endpoint.count({
      where: { projectId },
    });
    if (endpointCount === 0) {
      throw new BadRequestException(
        'This project has no endpoints to test. Upload a spec or add an endpoint first.',
      );
    }

    return this.prisma.testSuite.create({
      data: {
        projectId,
        triggeredById: userId,
        name: dto.name ?? null,
        status: SuiteStatus.pending,
        targetUrl: dto.targetUrl,
        timeBudget: dto.timeBudget,
        ...(dto.mutationRate !== undefined
          ? { mutationRate: dto.mutationRate }
          : {}),
      },
      select: DETAIL_SELECT,
    });
  }

  // --------------------------------------------------------------------------
  // findForProject — GET /projects/:projectId/test-suites
  // Any project member may read. Newest first.
  // --------------------------------------------------------------------------
  async findForProject(
    projectId: string,
    userId: string,
  ): Promise<TestSuiteSummary[]> {
    await this.access.assertAccess(projectId, userId);

    return this.prisma.testSuite.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: SUMMARY_SELECT,
    });
  }

  // --------------------------------------------------------------------------
  // findOne — GET /projects/:projectId/test-suites/:suiteId
  // Any project member may read.
  // --------------------------------------------------------------------------
  async findOne(
    projectId: string,
    suiteId: string,
    userId: string,
  ): Promise<TestSuiteDetail> {
    await this.access.assertAccess(projectId, userId);

    // Scope by projectId so a suite from another project can't be read via
    // this project's route.
    const suite = await this.prisma.testSuite.findFirst({
      where: { id: suiteId, projectId },
      select: DETAIL_SELECT,
    });

    if (!suite) {
      throw new NotFoundException('Test suite not found');
    }

    return suite;
  }

  // --------------------------------------------------------------------------
  // remove — DELETE /projects/:projectId/test-suites/:suiteId
  // Owner or admin only. Cascade-deletes the suite's test cases.
  // --------------------------------------------------------------------------
  async remove(
    projectId: string,
    suiteId: string,
    userId: string,
  ): Promise<{ message: string }> {
    await this.access.assertAccess(projectId, userId, [Role.admin]);

    const result = await this.prisma.testSuite.deleteMany({
      where: { id: suiteId, projectId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Test suite not found');
    }

    return { message: 'Test suite deleted successfully' };
  }

  // --------------------------------------------------------------------------
  // run — POST /projects/:projectId/test-suites/:suiteId/run
  // Owner/admin/tester. Hands the run to engine-service and starts polling.
  // --------------------------------------------------------------------------
  async run(
    projectId: string,
    suiteId: string,
    userId: string,
  ): Promise<TestSuiteDetail> {
    await this.access.assertAccess(projectId, userId, RUN_MUTATING_ROLES);

    const suite = await this.prisma.testSuite.findFirst({
      where: { id: suiteId, projectId },
      select: {
        id: true,
        status: true,
        targetUrl: true,
        timeBudget: true,
        mutationRate: true,
      },
    });
    if (!suite) {
      throw new NotFoundException('Test suite not found');
    }
    if (suite.status === SuiteStatus.running) {
      throw new ConflictException('Test suite is already running');
    }

    const spec = await this.prisma.apiSpecification.findUnique({
      where: { projectId },
      select: { fileContent: true },
    });
    if (!spec) {
      throw new BadRequestException(
        'Upload an API specification before running a test suite.',
      );
    }

    const job = await this.engine.startRun({
      spec: spec.fileContent,
      targetUrl: suite.targetUrl,
      timeBudget: suite.timeBudget,
      mutationRate: suite.mutationRate,
    });

    // Reset the run record + drop any results from a previous run.
    const updated = await this.prisma.testSuite.update({
      where: { id: suiteId },
      data: {
        status: SuiteStatus.running,
        jobId: job.jobId,
        startedAt: new Date(),
        completedAt: null,
        totalEndpoints: 0,
        coveredEndpoints: 0,
        totalTestCases: 0,
        passedTestCases: 0,
        failedTestCases: 0,
        testCases: { deleteMany: {} },
        requestLogs: { deleteMany: {} },
      },
      select: DETAIL_SELECT,
    });

    this.beginPolling(projectId, suiteId, job.jobId);
    return updated;
  }

  // --------------------------------------------------------------------------
  // findTestCases — GET /projects/:projectId/test-suites/:suiteId/test-cases
  // Any project member. Per-endpoint results for a completed run.
  // --------------------------------------------------------------------------
  async findTestCases(
    projectId: string,
    suiteId: string,
    userId: string,
  ): Promise<TestCaseItem[]> {
    await this.access.assertAccess(projectId, userId);

    const suite = await this.prisma.testSuite.findFirst({
      where: { id: suiteId, projectId },
      select: { id: true },
    });
    if (!suite) {
      throw new NotFoundException('Test suite not found');
    }

    const rows = await this.prisma.testCase.findMany({
      where: { testSuiteId: suiteId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        endpointId: true,
        statusCode: true,
        passed: true,
        responseBody: true,
        failureExplanation: true,
        createdAt: true,
        endpoint: { select: { method: true, path: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      endpointId: r.endpointId,
      method: r.endpoint.method,
      path: r.endpoint.path,
      statusCode: r.statusCode,
      passed: r.passed,
      responseBody: r.responseBody,
      failureExplanation: r.failureExplanation,
      createdAt: r.createdAt,
    }));
  }

  // --------------------------------------------------------------------------
  // getRequestLogSummary — GET .../test-suites/:suiteId/request-logs/summary
  // Per-endpoint counts of captured requests. Any project member.
  // --------------------------------------------------------------------------
  async getRequestLogSummary(
    projectId: string,
    suiteId: string,
    userId: string,
  ): Promise<RequestLogEndpointSummary[]> {
    await this.access.assertAccess(projectId, userId);
    await this.assertSuiteInProject(projectId, suiteId);

    const logs = await this.prisma.requestLog.findMany({
      where: { testSuiteId: suiteId },
      select: { endpointId: true, statusCode: true },
    });

    // Aggregate per endpoint (null endpointId = unmatched bucket).
    const acc = new Map<
      string,
      { endpointId: string | null; total: number; classes: Map<string, number> }
    >();
    for (const l of logs) {
      const key = l.endpointId ?? '__unmatched__';
      let entry = acc.get(key);
      if (!entry) {
        entry = { endpointId: l.endpointId, total: 0, classes: new Map() };
        acc.set(key, entry);
      }
      entry.total += 1;
      const cls =
        l.statusCode == null
          ? 'other'
          : l.statusCode >= 200 && l.statusCode < 300
            ? '2xx'
            : l.statusCode >= 300 && l.statusCode < 400
              ? '3xx'
              : l.statusCode >= 400 && l.statusCode < 500
                ? '4xx'
                : l.statusCode >= 500
                  ? '5xx'
                  : 'other';
      entry.classes.set(cls, (entry.classes.get(cls) ?? 0) + 1);
    }

    // Resolve method/path for matched endpoints.
    const ids = [...acc.values()]
      .map((e) => e.endpointId)
      .filter((id): id is string => id !== null);
    const endpoints = ids.length
      ? await this.prisma.endpoint.findMany({
          where: { id: { in: ids } },
          select: { id: true, method: true, path: true },
        })
      : [];
    const meta = new Map(endpoints.map((e) => [e.id, e]));

    const result: RequestLogEndpointSummary[] = [...acc.values()].map((e) => {
      const classes = Object.fromEntries(e.classes);
      const passed = e.classes.get('2xx') ?? 0;
      const m = e.endpointId ? meta.get(e.endpointId) : undefined;
      return {
        endpointId: e.endpointId,
        method: m?.method ?? null,
        path: m?.path ?? null,
        total: e.total,
        passed,
        failed: e.total - passed,
        statusClasses: classes,
      };
    });

    // Matched endpoints first (by path), unmatched bucket last.
    result.sort((a, b) => {
      if (a.endpointId === null) return 1;
      if (b.endpointId === null) return -1;
      return (a.path ?? '').localeCompare(b.path ?? '');
    });
    return result;
  }

  // --------------------------------------------------------------------------
  // listRequestLogs — GET .../test-suites/:suiteId/request-logs
  // Paginated captured requests, optionally filtered by endpoint + status class.
  // --------------------------------------------------------------------------
  async listRequestLogs(
    projectId: string,
    suiteId: string,
    userId: string,
    opts: {
      endpointId?: string;
      status?: string;
      page?: number;
      pageSize?: number;
    },
  ): Promise<RequestLogPage> {
    await this.access.assertAccess(projectId, userId);
    await this.assertSuiteInProject(projectId, suiteId);

    const page = Math.max(1, Math.floor(Number(opts.page)) || 1);
    const pageSize = Math.min(
      200,
      Math.max(1, Math.floor(Number(opts.pageSize)) || 50),
    );

    const where: Prisma.RequestLogWhereInput = { testSuiteId: suiteId };
    if (opts.endpointId === 'unmatched') {
      where.endpointId = null;
    } else if (opts.endpointId) {
      where.endpointId = opts.endpointId;
    }
    const range = statusClassRange(opts.status);
    if (range) where.statusCode = range;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.requestLog.count({ where }),
      this.prisma.requestLog.findMany({
        where,
        orderBy: { seq: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          seq: true,
          method: true,
          path: true,
          statusCode: true,
          durationMs: true,
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  // --------------------------------------------------------------------------
  // getRequestLog — GET .../test-suites/:suiteId/request-logs/:logId
  // Full captured request/response for one record. Any project member.
  // --------------------------------------------------------------------------
  async getRequestLog(
    projectId: string,
    suiteId: string,
    logId: string,
    userId: string,
  ): Promise<RequestLogDetail> {
    await this.access.assertAccess(projectId, userId);

    const log = await this.prisma.requestLog.findFirst({
      where: {
        id: logId,
        testSuiteId: suiteId,
        testSuite: { projectId },
      },
      select: {
        id: true,
        seq: true,
        endpointId: true,
        method: true,
        path: true,
        url: true,
        statusCode: true,
        durationMs: true,
        requestHeaders: true,
        requestBody: true,
        requestTruncated: true,
        responseHeaders: true,
        responseBody: true,
        responseTruncated: true,
        createdAt: true,
      },
    });
    if (!log) {
      throw new NotFoundException('Request log not found');
    }
    return log;
  }

  private async assertSuiteInProject(
    projectId: string,
    suiteId: string,
  ): Promise<void> {
    const suite = await this.prisma.testSuite.findFirst({
      where: { id: suiteId, projectId },
      select: { id: true },
    });
    if (!suite) {
      throw new NotFoundException('Test suite not found');
    }
  }

  // --------------------------------------------------------------------------
  // Background polling — in-process. Not awaited by the request.
  // --------------------------------------------------------------------------
  private beginPolling(
    projectId: string,
    suiteId: string,
    jobId: string,
  ): void {
    const tick = (attempt: number): void => {
      setTimeout(() => {
        void this.poll(projectId, suiteId, jobId, attempt, tick);
      }, POLL_INTERVAL_MS);
    };
    tick(0);
  }

  private async poll(
    projectId: string,
    suiteId: string,
    jobId: string,
    attempt: number,
    tick: (attempt: number) => void,
  ): Promise<void> {
    try {
      const status = await this.engine.getStatus(jobId);
      if (status.status === 'completed') {
        const result = await this.engine.getResult(jobId);
        await this.persistResults(projectId, suiteId, jobId, result);
        return;
      }
      if (status.status === 'failed') {
        await this.markFailed(suiteId, status.error ?? 'Engine run failed');
        return;
      }
    } catch (err) {
      this.logger.warn(
        `Polling suite ${suiteId} (attempt ${attempt}) failed: ${String(err)}`,
      );
    }

    if (attempt + 1 >= MAX_POLL_ATTEMPTS) {
      await this.markFailed(suiteId, 'Polling timed out');
      return;
    }
    tick(attempt + 1);
  }

  private async persistResults(
    projectId: string,
    suiteId: string,
    jobId: string,
    result: EngineResult,
  ): Promise<void> {
    const summary = result.summary ?? {
      totalOperations: 0,
      successfullyProcessed: 0,
      totalRequests: 0,
      statusCodeDistribution: {},
    };

    const dist = summary.statusCodeDistribution ?? {};
    let passed = 0;
    let totalFromDist = 0;
    for (const [code, count] of Object.entries(dist)) {
      const n = Number(count) || 0;
      totalFromDist += n;
      if (Math.floor(Number(code) / 100) === 2) passed += n;
    }
    const totalTestCases = summary.totalRequests || totalFromDist;
    const failed = Math.max(totalTestCases - passed, 0);

    // Match each engine operation to a stored Endpoint by (method, path).
    const endpoints = await this.prisma.endpoint.findMany({
      where: { projectId },
      select: { id: true, method: true, path: true },
    });
    const endpointByKey = new Map(
      endpoints.map((e) => [`${e.method}:${e.path}`, e.id]),
    );

    const rows: Prisma.TestCaseCreateManyInput[] = [];
    for (const op of result.operations ?? []) {
      if (!op.method || !op.path) continue;
      const endpointId = endpointByKey.get(`${op.method}:${op.path}`);
      if (!endpointId) continue; // engine op with no matching endpoint row
      rows.push({
        testSuiteId: suiteId,
        endpointId,
        statusCode: dominantStatusCode(op.statusCodes),
        // Keep both the status distribution and raw server errors so the Reports
        // module (and the LLM explainer) have the failure detail.
        responseBody: {
          statusCodes: op.statusCodes ?? {},
          serverErrors: op.serverErrors ?? [],
        } as Prisma.InputJsonValue,
        passed: op.passed,
        failureExplanation: op.passed
          ? null
          : summarizeServerErrors(op.serverErrors),
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.testCase.deleteMany({ where: { testSuiteId: suiteId } });
      if (rows.length > 0) {
        await tx.testCase.createMany({ data: rows });
      }
      await tx.testSuite.update({
        where: { id: suiteId },
        data: {
          status: SuiteStatus.completed,
          completedAt: new Date(),
          totalEndpoints: summary.totalOperations || 0,
          coveredEndpoints: summary.successfullyProcessed || 0,
          totalTestCases,
          passedTestCases: passed,
          failedTestCases: failed,
        },
      });
    });

    // Persist every captured request/response (best-effort; not fatal to the run).
    await this.persistRequestLogs(suiteId, jobId, endpointByKey);

    this.logger.log(
      `Suite ${suiteId} completed: ${passed}/${totalTestCases} requests passed, ${rows.length} endpoint results.`,
    );
  }

  /**
   * Fetch the run's captured requests from the engine-service and store them.
   * Each record is matched to an Endpoint by (method, templated path). Inserted
   * in chunks since a real run can produce many thousands of requests.
   */
  private async persistRequestLogs(
    suiteId: string,
    jobId: string,
    endpointByKey: Map<string, string>,
  ): Promise<void> {
    let records: EngineRequestRecord[];
    try {
      records = await this.engine.getRequests(jobId);
    } catch (err) {
      this.logger.warn(
        `Could not fetch captured requests for suite ${suiteId}: ${String(err)}`,
      );
      return;
    }

    await this.prisma.requestLog.deleteMany({
      where: { testSuiteId: suiteId },
    });
    if (records.length === 0) return;

    const rows: Prisma.RequestLogCreateManyInput[] = records.map((r) => ({
      testSuiteId: suiteId,
      endpointId: r.endpointPath
        ? (endpointByKey.get(`${r.method.toUpperCase()}:${r.endpointPath}`) ??
          null)
        : null,
      seq: r.seq,
      method: r.method,
      path: r.path,
      url: r.url,
      statusCode: r.statusCode ?? null,
      durationMs: r.durationMs ?? null,
      requestHeaders: (r.requestHeaders ??
        Prisma.JsonNull) as Prisma.InputJsonValue,
      requestBody: r.requestBody ?? null,
      requestTruncated: r.requestTruncated ?? false,
      responseHeaders: (r.responseHeaders ??
        Prisma.JsonNull) as Prisma.InputJsonValue,
      responseBody: r.responseBody ?? null,
      responseTruncated: r.responseTruncated ?? false,
    }));

    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await this.prisma.requestLog.createMany({
        data: rows.slice(i, i + CHUNK),
      });
    }
    this.logger.log(
      `Suite ${suiteId}: stored ${rows.length} captured requests.`,
    );
  }

  private async markFailed(suiteId: string, message: string): Promise<void> {
    this.logger.error(`Suite ${suiteId} failed: ${message}`);
    try {
      await this.prisma.testSuite.update({
        where: { id: suiteId },
        data: { status: SuiteStatus.failed, completedAt: new Date() },
      });
    } catch (err) {
      this.logger.error(
        `Could not mark suite ${suiteId} failed: ${String(err)}`,
      );
    }
  }
}

/** Pick the most frequent status code for a representative TestCase.statusCode. */
function dominantStatusCode(
  statusCodes: Record<string, number> | undefined,
): number | null {
  if (!statusCodes) return null;
  let best: number | null = null;
  let bestCount = -1;
  for (const [code, count] of Object.entries(statusCodes)) {
    const n = Number(count) || 0;
    if (n > bestCount) {
      bestCount = n;
      best = Number(code);
    }
  }
  return best !== null && Number.isFinite(best) ? best : null;
}

/** Build a short plain-text note from the engine's server-error records. */
function summarizeServerErrors(errors: unknown[]): string {
  const count = Array.isArray(errors) ? errors.length : 0;
  if (count === 0) {
    return 'Operation had no successful (2xx) responses.';
  }
  return `${count} server error(s) recorded during the run.`;
}
