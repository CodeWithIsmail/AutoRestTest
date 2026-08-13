import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { convertObj } from 'swagger2openapi';
import { Role, SpecGenStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import {
  EngineGenerationResult,
  EngineService,
} from '../engine/engine.service';
import { SpecsService, SpecSummary } from './specs.service';
import { GenerateSpecDto } from './dto/generate-spec.dto';

/** Max accepted source archive (50 MB) — matches OOPS_MAX_ZIP_BYTES. */
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

const POLL_INTERVAL_MS = 5000;
// ~4 hours. Generation is LLM-bound and legitimately slow; the test-suite
// poller's 75-minute ceiling would abandon runs that are still healthy.
const MAX_POLL_ATTEMPTS = 2880;

/** Directories excluded by default — vendored trees dominate cost and time. */
const DEFAULT_IGNORE_PATHS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  'venv',
  '.venv',
  '__pycache__',
];

/** The generation job as returned to the client. */
export interface SpecGenerationView {
  id: string;
  status: SpecGenStatus;
  sourceName: string;
  step: string | null;
  stepIndex: number;
  stepTotal: number;
  /** Present only once the job has completed and is awaiting review. */
  generatedSpec: string | null;
  operationCount: number;
  warnings: string[];
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

const VIEW_SELECT = {
  id: true,
  status: true,
  sourceName: true,
  step: true,
  stepIndex: true,
  stepTotal: true,
  generatedSpec: true,
  warnings: true,
  error: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
} as const;

@Injectable()
export class SpecGenerationService {
  private readonly logger = new Logger(SpecGenerationService.name);

  /**
   * Generation ids with a live in-process poller. The timers themselves live
   * only in this process, so this set is what lets `ensurePolling` re-attach
   * after a backend restart instead of leaving a row stuck at `running`.
   */
  private readonly polling = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly engine: EngineService,
    private readonly specs: SpecsService,
  ) {}

  // --------------------------------------------------------------------------
  // start — POST /projects/:projectId/spec/generate
  // Owner or admin only. Queues a generation from an uploaded source archive.
  // --------------------------------------------------------------------------
  async start(
    projectId: string,
    userId: string,
    file: Express.Multer.File | undefined,
    dto: GenerateSpecDto,
  ): Promise<SpecGenerationView> {
    await this.access.assertAccess(projectId, userId, [Role.admin]);

    if (!file) {
      throw new BadRequestException(
        'No source archive was uploaded (field "file")',
      );
    }
    if (file.size > MAX_ARCHIVE_BYTES) {
      throw new BadRequestException(
        `Source archive exceeds the ${MAX_ARCHIVE_BYTES / (1024 * 1024)} MB size limit`,
      );
    }
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException(
        'Upload your source code as a .zip archive',
      );
    }

    const existing = await this.prisma.specGeneration.findUnique({
      where: { projectId },
      select: { status: true },
    });
    if (existing?.status === SpecGenStatus.running) {
      throw new ConflictException(
        'A specification is already being generated for this project',
      );
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });

    const job = await this.engine.startGeneration(file, {
      title: dto.title?.trim() || project?.name || 'Generated API',
      version: dto.version?.trim() || '1.0.0',
      ignorePath: this.ignorePaths(dto.ignorePath),
    });

    // Upsert rather than create: one generation per project, and a fresh
    // attempt must clear the previous run's result, progress, and error.
    const row = await this.prisma.specGeneration.upsert({
      where: { projectId },
      create: {
        projectId,
        jobId: job.jobId,
        status: SpecGenStatus.running,
        sourceName: file.originalname,
        stepTotal: job.stepTotal || 9,
        warnings: job.warnings ?? [],
        startedAt: new Date(),
      },
      update: {
        jobId: job.jobId,
        status: SpecGenStatus.running,
        sourceName: file.originalname,
        step: null,
        stepIndex: 0,
        stepTotal: job.stepTotal || 9,
        generatedSpec: null,
        warnings: job.warnings ?? [],
        error: null,
        startedAt: new Date(),
        completedAt: null,
      },
      select: VIEW_SELECT,
    });

    this.beginPolling(row.id, job.jobId);
    return this.toView(row);
  }

  // --------------------------------------------------------------------------
  // findForProject — GET /projects/:projectId/spec/generate
  // Any project member. 404 when the project has never run a generation.
  // --------------------------------------------------------------------------
  async findForProject(
    projectId: string,
    userId: string,
  ): Promise<SpecGenerationView> {
    await this.access.assertAccess(projectId, userId);

    const row = await this.prisma.specGeneration.findUnique({
      where: { projectId },
      select: { ...VIEW_SELECT, jobId: true },
    });
    if (!row) {
      throw new NotFoundException(
        'No specification generation for this project',
      );
    }

    // A backend restart drops the in-process timers; re-attach on read so a
    // long-running generation resumes being tracked instead of hanging forever.
    const { jobId, ...view } = row;
    this.ensurePolling(row.id, jobId, row.status);

    return this.toView(view);
  }

  // --------------------------------------------------------------------------
  // apply — POST /projects/:projectId/spec/generate/apply
  // Owner or admin only. Promotes the reviewed document to the project's spec.
  // --------------------------------------------------------------------------
  async apply(projectId: string, userId: string): Promise<SpecSummary> {
    await this.access.assertAccess(projectId, userId, [Role.admin]);

    const row = await this.prisma.specGeneration.findUnique({
      where: { projectId },
      select: { id: true, status: true, sourceName: true, generatedSpec: true },
    });
    if (!row) {
      throw new NotFoundException(
        'No specification generation for this project',
      );
    }
    if (row.status !== SpecGenStatus.completed || !row.generatedSpec) {
      throw new ConflictException(
        `Generation is ${row.status}; there is no specification to apply yet`,
      );
    }

    // Reuses the upload path's validation and endpoint re-sync wholesale, so a
    // generated spec is held to exactly the same standard as an uploaded one.
    const fileName = this.specFileName(row.sourceName);
    const saved = await this.specs.persistSpec(
      projectId,
      fileName,
      row.generatedSpec,
      true,
    );

    await this.prisma.specGeneration.delete({ where: { projectId } });
    this.polling.delete(row.id);

    return saved;
  }

  // --------------------------------------------------------------------------
  // discard — DELETE /projects/:projectId/spec/generate
  // Owner or admin only. Drops the generation without touching the spec.
  // --------------------------------------------------------------------------
  async discard(
    projectId: string,
    userId: string,
  ): Promise<{ message: string }> {
    await this.access.assertAccess(projectId, userId, [Role.admin]);

    const row = await this.prisma.specGeneration.findUnique({
      where: { projectId },
      select: { id: true, jobId: true },
    });
    if (!row) {
      throw new NotFoundException(
        'No specification generation for this project',
      );
    }

    await this.prisma.specGeneration.delete({ where: { projectId } });
    this.polling.delete(row.id);
    if (row.jobId) {
      await this.engine.deleteGeneration(row.jobId);
    }

    return { message: 'Specification generation discarded' };
  }

  // --------------------------------------------------------------------------
  // private helpers
  // --------------------------------------------------------------------------

  private ignorePaths(raw: string | undefined): string[] {
    const supplied = (raw ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    return Array.from(new Set([...DEFAULT_IGNORE_PATHS, ...supplied]));
  }

  /** "my-api.zip" -> "my-api.generated.json" for the stored spec's fileName. */
  private specFileName(sourceName: string): string {
    const base = sourceName.replace(/\.zip$/i, '') || 'generated';
    return `${base}.generated.json`;
  }

  private beginPolling(rowId: string, jobId: string): void {
    this.polling.add(rowId);
    const tick = (attempt: number): void => {
      setTimeout(() => {
        void this.poll(rowId, jobId, attempt, tick);
      }, POLL_INTERVAL_MS);
    };
    tick(0);
  }

  private ensurePolling(
    rowId: string,
    jobId: string | null,
    status: SpecGenStatus,
  ): void {
    if (status !== SpecGenStatus.running || !jobId) return;
    if (this.polling.has(rowId)) return;
    this.logger.log(`Re-attaching poller for generation ${rowId}`);
    this.beginPolling(rowId, jobId);
  }

  private async poll(
    rowId: string,
    jobId: string,
    attempt: number,
    tick: (attempt: number) => void,
  ): Promise<void> {
    // A generation the user discarded (or applied) stops being polled.
    if (!this.polling.has(rowId)) return;

    try {
      const status = await this.engine.getGenerationStatus(jobId);

      if (status.step || status.stepIndex) {
        await this.prisma.specGeneration.updateMany({
          where: { id: rowId, status: SpecGenStatus.running },
          data: {
            step: status.stepLabel ?? status.step,
            stepIndex: status.stepIndex ?? 0,
            stepTotal: status.stepTotal || 9,
          },
        });
      }

      if (status.status === 'completed') {
        const result = await this.engine.getGenerationResult(jobId);
        await this.persistResult(rowId, result);
        this.polling.delete(rowId);
        return;
      }
      if (status.status === 'failed') {
        await this.markFailed(rowId, status.error ?? 'Spec generation failed');
        return;
      }
    } catch (err) {
      this.logger.warn(
        `Polling generation ${rowId} (attempt ${attempt}) failed: ${String(err)}`,
      );
    }

    if (attempt + 1 >= MAX_POLL_ATTEMPTS) {
      await this.markFailed(rowId, 'Spec generation timed out');
      return;
    }
    tick(attempt + 1);
  }

  private async persistResult(
    rowId: string,
    result: EngineGenerationResult,
  ): Promise<void> {
    try {
      const { document, warnings } = await this.toOpenApi3(result);
      await this.prisma.specGeneration.update({
        where: { id: rowId },
        data: {
          status: SpecGenStatus.completed,
          generatedSpec: JSON.stringify(document, null, 2),
          warnings: [...(result.warnings ?? []), ...warnings],
          stepIndex: 9,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      await this.markFailed(
        rowId,
        err instanceof Error
          ? err.message
          : 'Could not read the generated spec',
      );
    }
  }

  /**
   * Normalize the engine's output to an OpenAPI 3 document.
   *
   * OOPS upgrades its own Swagger 2.0 payload with swagger-codegen, but that
   * step needs a JRE. When it could not run we convert here instead, so a
   * missing Java install degrades schema fidelity rather than losing the run.
   */
  private async toOpenApi3(result: EngineGenerationResult): Promise<{
    document: Record<string, unknown>;
    warnings: string[];
  }> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.openapi);
    } catch {
      throw new Error('The generated specification was not valid JSON');
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('The generated specification was empty');
    }

    const document = parsed as Record<string, unknown>;
    const isSwagger2 =
      result.format === 'swagger2' ||
      (typeof document.swagger === 'string' && !document.openapi);

    if (!isSwagger2) {
      return { document, warnings: [] };
    }

    try {
      const converted = await convertObj(document, {
        patch: true,
        warnOnly: true,
      });
      return {
        document: converted.openapi,
        warnings: [
          'Converted from Swagger 2.0 because no Java runtime was available. ' +
            'Install a JRE (Temurin 17+) on the engine host for higher-fidelity schemas.',
        ],
      };
    } catch (err) {
      throw new Error(
        `Could not convert the generated Swagger 2.0 document to OpenAPI 3: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
  }

  private async markFailed(rowId: string, message: string): Promise<void> {
    this.polling.delete(rowId);
    await this.prisma.specGeneration.updateMany({
      where: { id: rowId },
      data: {
        status: SpecGenStatus.failed,
        error: message.slice(0, 2000),
        completedAt: new Date(),
      },
    });
  }

  private toView(row: {
    id: string;
    status: SpecGenStatus;
    sourceName: string;
    step: string | null;
    stepIndex: number;
    stepTotal: number;
    generatedSpec: string | null;
    warnings: string[];
    error: string | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  }): SpecGenerationView {
    return {
      ...row,
      operationCount: this.countOperations(row.generatedSpec),
    };
  }

  private countOperations(spec: string | null): number {
    if (!spec) return 0;
    const methods = new Set([
      'get',
      'put',
      'post',
      'delete',
      'options',
      'head',
      'patch',
      'trace',
    ]);
    try {
      const parsed = JSON.parse(spec) as { paths?: Record<string, unknown> };
      return Object.values(parsed.paths ?? {}).reduce<number>(
        (total, item) =>
          total +
          (item && typeof item === 'object'
            ? Object.keys(item).filter((k) => methods.has(k.toLowerCase()))
                .length
            : 0),
        0,
      );
    } catch {
      return 0;
    }
  }
}
