import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, SuiteStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
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

@Injectable()
export class TestSuitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
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
}
