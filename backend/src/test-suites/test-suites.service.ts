import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as yaml from 'js-yaml';
import {
  HttpMethod,
  Prisma,
  Role,
  SuiteStatus,
  TestRunType,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { EmailService } from '../email/email.service';
import {
  EngineRequestRecord,
  EngineResult,
  EngineService,
} from '../engine/engine.service';
import type { DependencyGraph } from '../graph/graph-merge';
import { mergeGraph } from '../graph/graph-merge';
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
  runType: TestRunType;
  originSuiteId: string | null;
}

/** A single run with the extra async-job fields exposed. */
export interface TestSuiteDetail extends TestSuiteSummary {
  jobId: string | null;
  /** Null when the account that triggered the run has since been deleted. */
  triggeredById: string | null;
  /** Extra HTTP headers sent with every request to the target API. */
  customHeaders: Record<string, string> | null;
  /** Endpoint ids stripped from the spec before this run. */
  excludedEndpointIds: string[];
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
  statusCodes: Record<string, number>; // exact codes, e.g. { '200': 8, '404': 5 }
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

/**
 * Result of live-sending one captured request via `runRequestLog`. Ephemeral —
 * unlike a replay, nothing here is persisted as a RequestLog row.
 */
export interface RunRequestLogResult {
  method: string;
  url: string;
  statusCode: number | null;
  durationMs: number;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  responseTruncated: boolean;
  /** Set instead of a response when the fetch itself failed (network error, timeout). */
  error: string | null;
  ranAt: Date;
}

/**
 * Translates the `status` query param into a Prisma filter on `statusCode`.
 *
 * Accepts either a class ('4xx') or an exact code ('404') — the SRS asks for
 * filtering by "response status, or HTTP response code", which are these two
 * shapes. Anything unrecognised returns undefined so the list stays unfiltered
 * rather than silently returning nothing.
 */
function statusCodeFilter(
  value?: string,
): Prisma.RequestLogWhereInput['statusCode'] {
  switch (value) {
    case '2xx':
      return { gte: 200, lt: 300 };
    case '3xx':
      return { gte: 300, lt: 400 };
    case '4xx':
      return { gte: 400, lt: 500 };
    case '5xx':
      return { gte: 500, lt: 600 };
    default:
      return value && /^[1-5]\d{2}$/.test(value) ? Number(value) : undefined;
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
  runType: true,
  originSuiteId: true,
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  jobId: true,
  triggeredById: true,
  customHeaders: true,
  excludedEndpointIds: true,
} as const;

/**
 * Prisma types `customHeaders` as the general `Json` type; narrow it back to
 * the `Record<string, string>` shape the DTO validator already guarantees
 * every stored value has.
 */
function toDetail<T extends { customHeaders: Prisma.JsonValue }>(
  row: T,
): Omit<T, 'customHeaders'> & { customHeaders: Record<string, string> | null } {
  return {
    ...row,
    customHeaders: row.customHeaders as Record<string, string> | null,
  };
}

// Roles (besides owner) allowed to configure/trigger a run. Testers are the
// role meant to run tests, so they may create suites — unlike specs/endpoints
// where only owner/admin may write.
const RUN_MUTATING_ROLES: Role[] = [Role.admin, Role.tester];

// Background polling cadence + safety cap on how long we track a single job.
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 1500; // ~75 min at 3s

// Headers captured at record time that must not be replayed verbatim — fetch
// derives host/content-length itself, and stale values would corrupt or be
// rejected outright. Mirrors engine-service/proxy.py's _DROP_REQUEST_HEADERS.
const REPLAY_DROP_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'accept-encoding',
  'proxy-connection',
]);

// Mirrors engine-service/proxy.py's MAX_BODY_CHARS — same storage guard
// applied to a replay's own captured responses.
const MAX_REPLAY_BODY_CHARS = 100_000;

// Mirrors engine-service/proxy.py's default fetch timeout. A single hung
// target request must not hang a whole replay loop, or a synchronous
// single-request run endpoint, forever.
const SEND_TIMEOUT_MS = 60_000;

@Injectable()
export class TestSuitesService {
  private readonly logger = new Logger(TestSuitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly engine: EngineService,
    private readonly email: EmailService,
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

    // Drop any id that isn't actually an endpoint of this project, rather
    // than erroring — keeps this permissive the same way an unknown header
    // key would be.
    let excludedEndpointIds: string[] = [];
    if (dto.excludedEndpointIds && dto.excludedEndpointIds.length > 0) {
      const owned = await this.prisma.endpoint.findMany({
        where: { projectId, id: { in: dto.excludedEndpointIds } },
        select: { id: true },
      });
      excludedEndpointIds = owned.map((e) => e.id);
    }

    const created = await this.prisma.testSuite.create({
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
        ...(dto.customHeaders ? { customHeaders: dto.customHeaders } : {}),
        excludedEndpointIds,
      },
      select: DETAIL_SELECT,
    });
    return toDetail(created);
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

    return toDetail(suite);
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
        customHeaders: true,
        excludedEndpointIds: true,
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

    let specText = spec.fileContent;
    if (suite.excludedEndpointIds.length > 0) {
      const excluded = await this.prisma.endpoint.findMany({
        where: { id: { in: suite.excludedEndpointIds }, projectId },
        select: { method: true, path: true },
      });
      specText = this.excludeOperationsFromSpec(specText, excluded);
    }

    const job = await this.engine.startRun({
      spec: specText,
      targetUrl: suite.targetUrl,
      timeBudget: suite.timeBudget,
      mutationRate: suite.mutationRate,
      customHeaders:
        (suite.customHeaders as Record<string, string> | null) ?? undefined,
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
    return toDetail(updated);
  }

  /**
   * Strips the given operations out of a raw OpenAPI spec (YAML or JSON) and
   * re-serializes as YAML — engine-service accepts either, so the original
   * format doesn't need preserving. No-ops on anything unparseable or a
   * path/method no longer present (spec drift since the endpoint was
   * extracted), rather than failing the run over it.
   */
  private excludeOperationsFromSpec(
    specText: string,
    excluded: { method: HttpMethod; path: string }[],
  ): string {
    let doc: unknown;
    try {
      doc = yaml.load(specText);
    } catch {
      return specText;
    }
    if (typeof doc !== 'object' || doc === null || !('paths' in doc)) {
      return specText;
    }
    const paths = (doc as { paths?: Record<string, Record<string, unknown>> })
      .paths;
    if (!paths) {
      return specText;
    }
    for (const { method, path } of excluded) {
      const item = paths[path];
      if (!item) continue;
      delete item[method.toLowerCase()];
      if (Object.keys(item).length === 0) {
        delete paths[path];
      }
    }
    return yaml.dump(doc);
  }

  // --------------------------------------------------------------------------
  // replay — POST /projects/:projectId/test-suites/:suiteId/replay
  // Owner/admin/tester. Resends the origin run's captured request sequence
  // verbatim against the target — a deterministic regression check, not a
  // fresh AI-generated run. No engine-service involvement at all. Recorded as
  // a new TestSuite linked back to the origin so both stay comparable and the
  // original's results are never overwritten.
  // --------------------------------------------------------------------------
  async replay(
    projectId: string,
    suiteId: string,
    userId: string,
  ): Promise<TestSuiteDetail> {
    await this.access.assertAccess(projectId, userId, RUN_MUTATING_ROLES);

    const source = await this.prisma.testSuite.findFirst({
      where: { id: suiteId, projectId },
      select: {
        id: true,
        status: true,
        targetUrl: true,
        timeBudget: true,
        mutationRate: true,
        customHeaders: true,
        totalEndpoints: true,
        originSuiteId: true,
      },
    });
    if (!source) {
      throw new NotFoundException('Test suite not found');
    }
    if (source.status === SuiteStatus.running) {
      throw new ConflictException('Test suite is already running');
    }

    // A replay of a replay still resends the true origin's fixed sequence, so
    // every replay in a chain stays directly comparable to its siblings.
    const originId = source.originSuiteId ?? source.id;
    const requestCount = await this.prisma.requestLog.count({
      where: { testSuiteId: originId },
    });
    if (requestCount === 0) {
      throw new BadRequestException(
        'This run has no captured requests to replay.',
      );
    }

    const replaySuite = await this.prisma.testSuite.create({
      data: {
        projectId,
        triggeredById: userId,
        name: null,
        status: SuiteStatus.running,
        targetUrl: source.targetUrl,
        timeBudget: source.timeBudget,
        mutationRate: source.mutationRate,
        ...(source.customHeaders
          ? { customHeaders: source.customHeaders }
          : {}),
        totalEndpoints: source.totalEndpoints,
        runType: TestRunType.replay,
        originSuiteId: originId,
        startedAt: new Date(),
      },
      select: DETAIL_SELECT,
    });

    void this.executeReplay(replaySuite.id, originId);
    return toDetail(replaySuite);
  }

  // --------------------------------------------------------------------------
  // getHistory — GET /projects/:projectId/test-suites/:suiteId/history
  // The origin run plus every replay of it, oldest first. Any project member.
  // --------------------------------------------------------------------------
  async getHistory(
    projectId: string,
    suiteId: string,
    userId: string,
  ): Promise<TestSuiteSummary[]> {
    await this.access.assertAccess(projectId, userId);

    const suite = await this.prisma.testSuite.findFirst({
      where: { id: suiteId, projectId },
      select: { id: true, originSuiteId: true },
    });
    if (!suite) {
      throw new NotFoundException('Test suite not found');
    }
    const originId = suite.originSuiteId ?? suite.id;

    return this.prisma.testSuite.findMany({
      where: { projectId, OR: [{ id: originId }, { originSuiteId: originId }] },
      orderBy: { createdAt: 'asc' },
      select: SUMMARY_SELECT,
    });
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
      {
        endpointId: string | null;
        total: number;
        classes: Map<string, number>;
        // Exact-code tallies, so the UI can offer a "filter by 404" dropdown
        // listing only the codes this run actually produced.
        codes: Map<string, number>;
      }
    >();
    for (const l of logs) {
      const key = l.endpointId ?? '__unmatched__';
      let entry = acc.get(key);
      if (!entry) {
        entry = {
          endpointId: l.endpointId,
          total: 0,
          classes: new Map(),
          codes: new Map(),
        };
        acc.set(key, entry);
      }
      entry.total += 1;
      if (l.statusCode != null) {
        const code = String(l.statusCode);
        entry.codes.set(code, (entry.codes.get(code) ?? 0) + 1);
      }
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
        statusCodes: Object.fromEntries(e.codes),
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
    const statusCode = statusCodeFilter(opts.status);
    if (statusCode !== undefined) where.statusCode = statusCode;

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

  // --------------------------------------------------------------------------
  // runRequestLog — POST .../test-suites/:suiteId/request-logs/:logId/run
  // Live-sends one captured request against the target and returns the fresh
  // response synchronously. Ephemeral: nothing is persisted. Owner/admin/tester,
  // same bar as replay() — this makes a real outbound call that can have real
  // side effects on the target API.
  // --------------------------------------------------------------------------
  async runRequestLog(
    projectId: string,
    suiteId: string,
    logId: string,
    userId: string,
  ): Promise<RunRequestLogResult> {
    await this.access.assertAccess(projectId, userId, RUN_MUTATING_ROLES);

    const log = await this.prisma.requestLog.findFirst({
      where: {
        id: logId,
        testSuiteId: suiteId,
        testSuite: { projectId },
      },
      select: {
        method: true,
        url: true,
        requestHeaders: true,
        requestBody: true,
        requestTruncated: true,
      },
    });
    if (!log) {
      throw new NotFoundException('Request log not found');
    }
    if (log.requestTruncated) {
      // Same reasoning executeReplay uses to skip these rather than resend
      // them: the stored body is incomplete, so sending it would corrupt the
      // request rather than faithfully reproduce it.
      throw new BadRequestException(
        'The captured request body was truncated when it was stored and cannot be run faithfully.',
      );
    }

    const sent = await this.sendCapturedRequest(log);
    return {
      method: log.method,
      url: log.url,
      ranAt: new Date(),
      ...sent,
    };
  }

  /**
   * The dependency graph snapshotted for one run, with the RL agent's learned
   * weights on its edges. Its own endpoint rather than a field on the suite
   * detail: the payload is large and only one screen wants it — the same reason
   * request logs are served separately.
   */
  async findGraph(
    projectId: string,
    suiteId: string,
    userId: string,
  ): Promise<{ graph: DependencyGraph | null }> {
    await this.access.assertAccess(projectId, userId);

    const suite = await this.prisma.testSuite.findFirst({
      where: { id: suiteId, projectId },
      select: { dependencyGraph: true },
    });
    if (!suite) {
      throw new NotFoundException('Test suite not found');
    }
    return { graph: (suite.dependencyGraph as DependencyGraph | null) ?? null };
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

    // The graph as it stood for this run: semantic edges from the spec, plus the
    // Q-values the MARL loop put on them. Snapshotted here rather than read from
    // the project later, so the graph shown beside these results is the one that
    // produced them even after the spec moves on. Older engine builds don't emit
    // it, hence the guard.
    const engineGraph = result.dependencyGraph;
    const dependencyGraph = engineGraph?.static
      ? mergeGraph({
          staticGraph: engineGraph.static,
          learned: engineGraph.learned,
          operations: result.operations ?? [],
        })
      : null;

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
          // Cast for the same reason as in GraphService.persist: an interface
          // has no index signature, so it doesn't structurally match InputJson.
          ...(dependencyGraph
            ? {
                dependencyGraph:
                  dependencyGraph as unknown as Prisma.InputJsonObject,
              }
            : {}),
        },
      });
    });

    // Persist every captured request/response (best-effort; not fatal to the run).
    await this.persistRequestLogs(suiteId, jobId, endpointByKey);

    this.logger.log(
      `Suite ${suiteId} completed: ${passed}/${totalTestCases} requests passed, ${rows.length} endpoint results.`,
    );

    await this.notifyRunFinished(suiteId, 'completed');
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
      path: stripNulBytes(r.path) ?? r.path,
      url: stripNulBytes(r.url) ?? r.url,
      statusCode: r.statusCode ?? null,
      durationMs: r.durationMs ?? null,
      requestHeaders: (stripNulFromHeaders(r.requestHeaders) ??
        Prisma.JsonNull) as Prisma.InputJsonValue,
      requestBody: stripNulBytes(r.requestBody ?? null),
      requestTruncated: r.requestTruncated ?? false,
      responseHeaders: (stripNulFromHeaders(r.responseHeaders) ??
        Prisma.JsonNull) as Prisma.InputJsonValue,
      responseBody: stripNulBytes(r.responseBody ?? null),
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

  /**
   * Sends one captured request live against its recorded URL and reports the
   * fresh response. Shared by `executeReplay`'s sequential loop and
   * `runRequestLog`'s single ad-hoc send, so the fetch/header-filter/
   * truncation behavior stays identical between "replay a whole run" and
   * "run just this one request" instead of drifting apart.
   *
   * Never throws: a network failure or timeout comes back as `error` set
   * rather than a rejected promise, since both callers want to record/render
   * that outcome rather than abort (a replay continues its sequence; a
   * single run still owes the caller a 200 with the failure described).
   */
  private async sendCapturedRequest(log: {
    method: string;
    url: string;
    requestHeaders: unknown;
    requestBody: string | null;
  }): Promise<{
    statusCode: number | null;
    durationMs: number;
    responseHeaders: Record<string, string> | null;
    responseBody: string | null;
    responseTruncated: boolean;
    error: string | null;
  }> {
    const headers = filterReplayHeaders(log.requestHeaders);
    const canHaveBody = !['GET', 'HEAD'].includes(log.method.toUpperCase());
    const started = Date.now();
    let statusCode: number | null = null;
    let responseHeaders: Record<string, string> | null = null;
    let responseText: string | null = null;
    let responseTruncated = false;
    let error: string | null = null;

    try {
      const res = await fetch(log.url, {
        method: log.method,
        headers,
        body:
          canHaveBody && log.requestBody != null ? log.requestBody : undefined,
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      statusCode = res.status;
      responseHeaders = Object.fromEntries(res.headers.entries());
      const capped = truncateForStorage(await res.text());
      responseText = capped.text;
      responseTruncated = capped.truncated;
    } catch (err) {
      error = String(err);
    }

    return {
      statusCode,
      durationMs: Date.now() - started,
      responseHeaders,
      responseBody: responseText,
      responseTruncated,
      error,
    };
  }

  /**
   * Sequentially resends one origin run's captured RequestLog rows verbatim
   * against the target. No engine-service involvement — this is a
   * deterministic HTTP replay, not a fresh AI-generated run. Best-effort per
   * request: a network failure or a size-truncated original capture is
   * recorded and the replay continues rather than aborting the sequence.
   *
   * Two independent pass/fail views are produced, matching how a generated
   * run's results are read elsewhere in this service: the suite-level
   * counts are request-level (2xx = pass, matching `persistResults`, so the
   * history list's "passed/total" reads consistently across run types), while
   * per-endpoint `TestCase` rows use "no 5xx = pass" (matching the report/UI
   * heuristic in `endpointOutcome()`), since there's no AI judgment on this
   * pass to fall back on.
   */
  private async executeReplay(
    replaySuiteId: string,
    originId: string,
  ): Promise<void> {
    try {
      const logs = await this.prisma.requestLog.findMany({
        where: { testSuiteId: originId },
        orderBy: { seq: 'asc' },
        select: {
          endpointId: true,
          method: true,
          path: true,
          url: true,
          requestHeaders: true,
          requestBody: true,
          requestTruncated: true,
        },
      });

      const rows: Prisma.RequestLogCreateManyInput[] = [];
      const perEndpoint = new Map<string, Record<string, number>>();
      let totalSent = 0;
      let passedRequests = 0;

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const seq = i + 1;

        if (log.requestTruncated) {
          // The stored body is incomplete; sending it would corrupt the
          // request rather than faithfully replay it.
          rows.push({
            testSuiteId: replaySuiteId,
            endpointId: log.endpointId,
            seq,
            method: log.method,
            path: log.path,
            url: log.url,
            statusCode: null,
            durationMs: null,
            requestHeaders: log.requestHeaders ?? Prisma.JsonNull,
            requestBody: null,
            requestTruncated: true,
            responseHeaders: Prisma.JsonNull,
            responseBody:
              'Skipped: the original captured request body was truncated and cannot be replayed faithfully.',
            responseTruncated: false,
          });
          continue;
        }

        const sent = await this.sendCapturedRequest(log);
        if (sent.error) {
          this.logger.warn(
            `Replay ${replaySuiteId}: request ${seq} (${log.method} ${log.path}) failed: ${sent.error}`,
          );
        }

        totalSent += 1;
        if (
          sent.statusCode != null &&
          Math.floor(sent.statusCode / 100) === 2
        ) {
          passedRequests += 1;
        }

        rows.push({
          testSuiteId: replaySuiteId,
          endpointId: log.endpointId,
          seq,
          method: log.method,
          path: stripNulBytes(log.path) ?? log.path,
          url: stripNulBytes(log.url) ?? log.url,
          statusCode: sent.statusCode,
          durationMs: sent.durationMs,
          requestHeaders: log.requestHeaders ?? Prisma.JsonNull,
          requestBody: stripNulBytes(log.requestBody),
          requestTruncated: false,
          responseHeaders:
            stripNulFromHeaders(sent.responseHeaders) ?? Prisma.JsonNull,
          responseBody: stripNulBytes(sent.responseBody),
          responseTruncated: sent.responseTruncated,
        });

        if (log.endpointId) {
          const dist = perEndpoint.get(log.endpointId) ?? {};
          const key =
            sent.statusCode != null ? String(sent.statusCode) : 'none';
          dist[key] = (dist[key] ?? 0) + 1;
          perEndpoint.set(log.endpointId, dist);
        }
      }

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await this.prisma.requestLog.createMany({
          data: rows.slice(i, i + CHUNK),
        });
      }

      const caseRows: Prisma.TestCaseCreateManyInput[] = [];
      let endpointsPassed = 0;
      for (const [endpointId, dist] of perEndpoint) {
        const dominant = dominantStatusCode(dist);
        const casePassed = dominant != null && dominant < 500;
        if (casePassed) endpointsPassed += 1;
        caseRows.push({
          testSuiteId: replaySuiteId,
          endpointId,
          statusCode: dominant,
          responseBody: {
            statusCodes: dist,
            serverErrors: [],
          },
          passed: casePassed,
          failureExplanation: casePassed
            ? null
            : 'Replayed request(s) for this endpoint returned a 5xx response.',
        });
      }
      if (caseRows.length > 0) {
        await this.prisma.testCase.createMany({ data: caseRows });
      }

      await this.prisma.testSuite.update({
        where: { id: replaySuiteId },
        data: {
          status: SuiteStatus.completed,
          completedAt: new Date(),
          coveredEndpoints: perEndpoint.size,
          totalTestCases: totalSent,
          passedTestCases: passedRequests,
          failedTestCases: Math.max(totalSent - passedRequests, 0),
        },
      });

      this.logger.log(
        `Replay ${replaySuiteId} (origin ${originId}) completed: ` +
          `${endpointsPassed}/${caseRows.length} endpoints passed, ${totalSent}/${rows.length} requests sent.`,
      );

      await this.notifyRunFinished(replaySuiteId, 'completed');
    } catch (err) {
      this.logger.error(
        `Replay ${replaySuiteId} (origin ${originId}) failed: ${String(err)}`,
      );
      await this.markFailed(replaySuiteId, 'Replay failed unexpectedly');
    }
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
    await this.notifyRunFinished(suiteId, 'failed', message);
  }

  /**
   * Email whoever started the run that it has finished.
   *
   * Called from the background poller, which has no request to fail into, so
   * everything here is best-effort: an unhandled rejection would surface as an
   * unhandled promise rejection on the process instead.
   */
  private async notifyRunFinished(
    suiteId: string,
    outcome: 'completed' | 'failed',
    error?: string,
  ): Promise<void> {
    try {
      const suite = await this.prisma.testSuite.findUnique({
        where: { id: suiteId },
        select: {
          name: true,
          projectId: true,
          totalTestCases: true,
          passedTestCases: true,
          failedTestCases: true,
          project: { select: { name: true } },
          triggeredBy: {
            select: {
              email: true,
              username: true,
              notifyRunFinished: true,
            },
          },
        },
      });
      if (!suite) return;

      // Null once the triggering account has been deleted; the run itself
      // outlives them, but there is nobody left to tell.
      const recipient = suite.triggeredBy;
      if (!recipient || !recipient.notifyRunFinished) return;

      await this.email.sendRunFinished(recipient.email, {
        username: recipient.username,
        projectName: suite.project.name,
        // Suites are optionally named; fall back to something recognisable.
        suiteName: suite.name ?? 'Untitled run',
        outcome,
        projectId: suite.projectId,
        suiteId,
        stats:
          outcome === 'completed'
            ? {
                total: suite.totalTestCases,
                passed: suite.passedTestCases,
                failed: suite.failedTestCases,
              }
            : undefined,
        error,
      });
    } catch (err) {
      this.logger.warn(
        `Could not send the run notification for suite ${suiteId}: ${String(err)}`,
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

/** Rebuild a fetch-safe header object from a captured RequestLog snapshot. */
function filterReplayHeaders(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (REPLAY_DROP_HEADERS.has(key.toLowerCase())) continue;
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/** Cap a replayed response body the same way engine-service's proxy does. */
function truncateForStorage(text: string): {
  text: string;
  truncated: boolean;
} {
  if (text.length > MAX_REPLAY_BODY_CHARS) {
    return { text: text.slice(0, MAX_REPLAY_BODY_CHARS), truncated: true };
  }
  return { text, truncated: false };
}

/**
 * Postgres text/jsonb columns reject the NUL byte (0x00) outright, in any
 * encoding. It shows up in more than just binary response bodies: this is a
 * security fuzzer, and null-byte injection is a standard boundary-value
 * payload it deliberately sends in path/query parameters (probing for
 * null-byte-poisoning bugs in the target API) — so it can land in `path`,
 * `url`, or header values just as easily as a body. Retrying the insert
 * never helps since it's the same poison byte every attempt, so every
 * captured string has to be sanitized before it reaches Prisma.
 */
const NUL_BYTE = String.fromCharCode(0);

function stripNulBytes(text: string | null): string | null {
  return text === null ? null : text.split(NUL_BYTE).join('');
}

/** Same NUL-stripping as `stripNulBytes`, applied to every header value. */
function stripNulFromHeaders(
  headers: Record<string, string> | null,
): Record<string, string> | null {
  if (!headers) return headers;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = stripNulBytes(value) ?? value;
  }
  return out;
}
