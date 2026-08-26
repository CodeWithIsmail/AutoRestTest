import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GraphStatus, Prisma, Role } from '../../generated/prisma/client';
import { ProjectAccessService } from '../common/project-access.service';
import { EngineService } from '../engine/engine.service';
import { PrismaService } from '../prisma/prisma.service';
import type { DependencyGraph } from './graph-merge';
import { mergeGraph, upgradeStoredGraph } from './graph-merge';

/** Building a graph changes project state, so it needs write access. */
const BUILD_ROLES = [Role.admin, Role.tester];

// Graph construction is embedding-based, not LLM-based: seconds of work behind
// a one-off gensim model load. 3s x 200 gives ten minutes, comfortably past a
// cold model load while still bounded.
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 200;

export interface GraphState {
  status: GraphStatus;
  graph: DependencyGraph | null;
  error: string | null;
  completedAt: Date | null;
}

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly engine: EngineService,
  ) {}

  /**
   * The project's spec-derived graph. Returns a `pending` placeholder rather
   * than 404 when none has been built, so the UI has one shape to render and
   * can show its "build this" call to action.
   */
  async get(projectId: string, userId: string): Promise<GraphState> {
    await this.access.assertAccess(projectId, userId);

    const row = await this.prisma.dependencyGraph.findUnique({
      where: { projectId },
      select: {
        status: true,
        graph: true,
        error: true,
        completedAt: true,
      },
    });

    if (!row) {
      return {
        status: GraphStatus.pending,
        graph: null,
        error: null,
        completedAt: null,
      };
    }
    return {
      status: row.status,
      graph: upgradeStoredGraph(row.graph),
      error: row.error,
      completedAt: row.completedAt,
    };
  }

  /** Kick off a build for the project's current spec. */
  async build(projectId: string, userId: string): Promise<GraphState> {
    await this.access.assertAccess(projectId, userId, BUILD_ROLES);

    const spec = await this.prisma.apiSpecification.findUnique({
      where: { projectId },
      select: { fileContent: true },
    });
    if (!spec) {
      throw new NotFoundException(
        'This project has no API specification to build a graph from',
      );
    }

    const existing = await this.prisma.dependencyGraph.findUnique({
      where: { projectId },
      select: { status: true },
    });
    if (existing?.status === GraphStatus.running) {
      throw new BadRequestException('A graph build is already in progress');
    }

    const job = await this.engine.startGraph(spec.fileContent);

    // Upsert rather than create: one row per project, reused across rebuilds.
    // The previous graph is cleared so a stale one can't be shown as if it were
    // the result of the build now running.
    await this.prisma.dependencyGraph.upsert({
      where: { projectId },
      create: {
        projectId,
        status: GraphStatus.running,
        jobId: job.jobId,
      },
      update: {
        status: GraphStatus.running,
        jobId: job.jobId,
        // DbNull, not null: Prisma reserves plain `null` on a Json column for
        // the JSON value `null` and requires the sentinel to mean SQL NULL.
        graph: Prisma.DbNull,
        error: null,
        completedAt: null,
      },
    });

    this.beginPolling(projectId, job.jobId);

    return {
      status: GraphStatus.running,
      graph: null,
      error: null,
      completedAt: null,
    };
  }

  // --------------------------------------------------------------------------
  // Background polling — in-process, not awaited by the request.
  // --------------------------------------------------------------------------
  private beginPolling(projectId: string, jobId: string): void {
    const tick = (attempt: number): void => {
      setTimeout(() => {
        void this.poll(projectId, jobId, attempt, tick);
      }, POLL_INTERVAL_MS);
    };
    tick(0);
  }

  private async poll(
    projectId: string,
    jobId: string,
    attempt: number,
    tick: (attempt: number) => void,
  ): Promise<void> {
    try {
      const status = await this.engine.getGraphStatus(jobId);
      if (status.status === 'completed') {
        const staticGraph = await this.engine.getGraphResult(jobId);
        await this.persist(projectId, mergeGraph({ staticGraph }));
        return;
      }
      if (status.status === 'failed') {
        await this.markFailed(projectId, status.error ?? 'Graph build failed');
        return;
      }
    } catch (err) {
      this.logger.warn(
        `Polling graph for project ${projectId} (attempt ${attempt}) failed: ${String(err)}`,
      );
    }

    if (attempt + 1 >= MAX_POLL_ATTEMPTS) {
      await this.markFailed(projectId, 'Graph build timed out');
      return;
    }
    tick(attempt + 1);
  }

  private async persist(
    projectId: string,
    graph: DependencyGraph,
  ): Promise<void> {
    try {
      await this.prisma.dependencyGraph.updateMany({
        where: { projectId },
        data: {
          status: GraphStatus.ready,
          // Prisma's InputJsonValue needs an index signature, which a declared
          // interface does not have; the value is plain JSON by construction.
          graph: graph as unknown as Prisma.InputJsonObject,
          error: null,
          completedAt: new Date(),
        },
      });
      this.logger.log(
        `Graph ready for project ${projectId}: ` +
          `${graph.stats.operations} operations, ${graph.stats.dependencies} dependencies`,
      );
    } catch (err) {
      this.logger.error(
        `Could not store graph for ${projectId}: ${String(err)}`,
      );
    }
  }

  private async markFailed(projectId: string, message: string): Promise<void> {
    this.logger.error(
      `Graph build for project ${projectId} failed: ${message}`,
    );
    try {
      await this.prisma.dependencyGraph.updateMany({
        where: { projectId },
        data: {
          status: GraphStatus.failed,
          error: message,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(
        `Could not mark graph for ${projectId} failed: ${String(err)}`,
      );
    }
  }
}
