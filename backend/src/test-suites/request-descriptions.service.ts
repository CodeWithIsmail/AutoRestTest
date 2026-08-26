import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../../generated/prisma/client';
import { ProjectAccessService } from '../common/project-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../reports/llm.service';

/** Same roles that may trigger a run may also spend LLM budget describing one. */
const DESCRIBE_ROLES: Role[] = [Role.admin, Role.tester];

export interface DescribeRequestsResult {
  /** Requests captured by the run. */
  total: number;
  /** Requests that now carry a description, including ones already done. */
  described: number;
  /** Still undescribed — call again to continue. Zero means finished. */
  remaining: number;
  /** How many rows this particular invocation wrote. */
  writtenNow: number;
  /** False when the LLM is unreachable/unconfigured and nothing was written. */
  usedLlm: boolean;
}

/**
 * Writes a plain-language description onto each captured request, on demand.
 *
 * This is deliberately a post-processing step with no bearing on testing: the
 * engine runs exactly as before, and nothing here touches a run in flight. A
 * user presses "Explain Requests" after a run finishes and the stored
 * request/response pairs are handed to the LLM in small batches.
 *
 * Work is capped per invocation (a wall-clock budget, plus `maxPerCall` as a
 * ceiling on rows fetched) rather than run to completion, because a large suite
 * takes minutes to describe and no HTTP request should be held open that long.
 * The caller polls: each response reports `remaining`, and the client simply
 * calls again until it reaches zero. That also makes the pass resumable — an
 * interrupted describe just leaves rows null for the next go.
 *
 * Rate limiting is not done here: the LLM's requests-per-minute ceiling is a
 * property of the credentials, configured per scope on /admin/llm-settings and
 * enforced inside LlmService, so this pass and "Explain failures" share one
 * budget instead of each inventing their own pacing.
 */
@Injectable()
export class RequestDescriptionsService {
  private readonly logger = new Logger(RequestDescriptionsService.name);

  /**
   * Requests per LLM call. Small on purpose: the binding constraint is the
   * provider's daily request cap, and 4 per call keeps a 1,500-request suite
   * inside a 500/day free tier.
   */
  private readonly batchSize: number;
  /** Upper bound on rows pulled per HTTP invocation. */
  private readonly maxPerCall: number;
  /** Wall-clock budget for one HTTP invocation, after which it returns early. */
  private readonly maxSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly llm: LlmService,
    config: ConfigService,
  ) {
    this.batchSize = intFromEnv(config, 'LLM_DESCRIBE_BATCH_SIZE', 4, 1, 40);
    this.maxPerCall = intFromEnv(
      config,
      'LLM_DESCRIBE_MAX_PER_CALL',
      200,
      1,
      2000,
    );
    this.maxSeconds = intFromEnv(
      config,
      'LLM_DESCRIBE_MAX_SECONDS',
      45,
      5,
      300,
    );
  }

  async describeSuite(
    projectId: string,
    suiteId: string,
    userId: string,
  ): Promise<DescribeRequestsResult> {
    await this.access.assertAccess(projectId, userId, DESCRIBE_ROLES);

    const suite = await this.prisma.testSuite.findFirst({
      where: { id: suiteId, projectId },
      select: { id: true },
    });
    if (!suite) throw new NotFoundException('Test run not found');

    // Fails fast with a clear message when no key is configured, rather than
    // silently writing nothing.
    await this.llm.assertUsable();

    const pending = await this.prisma.requestLog.findMany({
      where: { testSuiteId: suiteId, description: null },
      orderBy: { seq: 'asc' },
      take: this.maxPerCall,
      select: {
        id: true,
        method: true,
        path: true,
        url: true,
        requestBody: true,
        statusCode: true,
        responseBody: true,
      },
    });

    let writtenNow = 0;
    let anySucceeded = pending.length === 0;
    const deadline = Date.now() + this.maxSeconds * 1000;

    for (let i = 0; i < pending.length; i += this.batchSize) {
      // Rate limiting means a batch can take seconds, so the guard against
      // holding an HTTP request open too long has to be the clock rather than
      // a request count — the same count means wildly different durations at
      // 13 rpm and at 40. Whatever is left simply comes back as `remaining`.
      if (Date.now() >= deadline) break;

      const batch = pending.slice(i, i + this.batchSize);
      const described = await this.llm.describeRequests(batch);
      if (described.size === 0) {
        // A whole batch coming back empty means the provider is failing, not
        // that these four requests were unusually hard. Stop rather than burn
        // the rest of the quota on calls that will fail the same way.
        this.logger.warn(
          `describe: empty result for suite ${suiteId} batch ${i / this.batchSize + 1}, stopping`,
        );
        break;
      }
      anySucceeded = true;

      await this.prisma.$transaction(
        [...described].map(([id, description]) =>
          this.prisma.requestLog.update({
            where: { id },
            data: { description },
          }),
        ),
      );
      writtenNow += described.size;
    }

    const [total, remaining] = await this.prisma.$transaction([
      this.prisma.requestLog.count({ where: { testSuiteId: suiteId } }),
      this.prisma.requestLog.count({
        where: { testSuiteId: suiteId, description: null },
      }),
    ]);

    return {
      total,
      described: total - remaining,
      remaining,
      writtenNow,
      usedLlm: anySucceeded && !this.llm.isMock,
    };
  }
}

function intFromEnv(
  config: ConfigService,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = parseInt(config.get<string>(key) ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
