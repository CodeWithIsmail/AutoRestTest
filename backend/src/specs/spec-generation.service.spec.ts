import { ConflictException, NotFoundException } from '@nestjs/common';
import { SpecGenStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { EngineService } from '../engine/engine.service';
import { SpecsService } from './specs.service';
import { SpecGenerationService } from './spec-generation.service';

const PROJECT_ID = 'project-1';
const USER_ID = 'owner-1';
const ROW_ID = 'gen-1';

const OAS3_DOC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Generated API', version: '1.0.0' },
  paths: {
    '/items': { get: {}, post: {} },
    '/items/{id}': { get: {} },
  },
});

const SWAGGER2_DOC = JSON.stringify({
  swagger: '2.0',
  info: { title: 'Legacy API', version: '1.0.0' },
  paths: {
    '/items': {
      get: { responses: { '200': { description: 'OK' } } },
    },
  },
});

function makeArchive(name = 'source.zip', size = 1024): Express.Multer.File {
  const buffer = Buffer.alloc(size);
  return {
    fieldname: 'file',
    originalname: name,
    encoding: '7bit',
    mimetype: 'application/zip',
    size,
    buffer,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
  };
}

describe('SpecGenerationService', () => {
  let service: SpecGenerationService;
  let prisma: {
    specGeneration: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    project: { findUnique: jest.Mock };
  };
  let access: { assertAccess: jest.Mock };
  let engine: {
    startGeneration: jest.Mock;
    getGenerationStatus: jest.Mock;
    getGenerationResult: jest.Mock;
    deleteGeneration: jest.Mock;
  };
  let specs: { persistSpec: jest.Mock };

  beforeEach(() => {
    // start() kicks off a self-rescheduling setTimeout poller. Faking timers
    // keeps those from firing (and recursing forever) during the tests; the
    // polling behaviour itself is exercised by calling poll() directly below.
    jest.useFakeTimers();

    prisma = {
      specGeneration: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      project: { findUnique: jest.fn().mockResolvedValue({ name: 'My API' }) },
    };
    access = { assertAccess: jest.fn().mockResolvedValue(undefined) };
    engine = {
      startGeneration: jest.fn(),
      getGenerationStatus: jest.fn(),
      getGenerationResult: jest.fn(),
      deleteGeneration: jest.fn().mockResolvedValue(undefined),
    };
    specs = { persistSpec: jest.fn() };

    service = new SpecGenerationService(
      prisma as unknown as PrismaService,
      access as unknown as ProjectAccessService,
      engine as unknown as EngineService,
      specs as unknown as SpecsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  // --- start ---------------------------------------------------------------

  describe('start', () => {
    beforeEach(() => {
      prisma.specGeneration.findUnique.mockResolvedValue(null);
      engine.startGeneration.mockResolvedValue({
        jobId: 'job-1',
        status: 'pending',
        error: null,
        warnings: [],
        stepTotal: 9,
      });
      prisma.specGeneration.upsert.mockResolvedValue({
        id: ROW_ID,
        status: SpecGenStatus.running,
        sourceName: 'source.zip',
        step: null,
        stepIndex: 0,
        stepTotal: 9,
        generatedSpec: null,
        warnings: [],
        error: null,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
      });
    });

    it('rejects a missing archive', async () => {
      await expect(
        service.start(PROJECT_ID, USER_ID, undefined, {}),
      ).rejects.toThrow('No source archive was uploaded (field "file")');
    });

    it('rejects a non-zip upload', async () => {
      await expect(
        service.start(PROJECT_ID, USER_ID, makeArchive('src.tar.gz'), {}),
      ).rejects.toThrow('Upload your source code as a .zip archive');
    });

    it('rejects an oversized archive', async () => {
      const big = makeArchive('source.zip', 1);
      big.size = 60 * 1024 * 1024;
      await expect(service.start(PROJECT_ID, USER_ID, big, {})).rejects.toThrow(
        'exceeds the 50 MB size limit',
      );
    });

    it('409s when a generation is already running', async () => {
      prisma.specGeneration.findUnique.mockResolvedValue({
        status: SpecGenStatus.running,
      });
      await expect(
        service.start(PROJECT_ID, USER_ID, makeArchive(), {}),
      ).rejects.toThrow(ConflictException);
      expect(engine.startGeneration).not.toHaveBeenCalled();
    });

    it('falls back to the project name when no title is given', async () => {
      await service.start(PROJECT_ID, USER_ID, makeArchive(), {});
      expect(engine.startGeneration).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ title: 'My API', version: '1.0.0' }),
      );
    });

    it('merges user-supplied excludes with the vendored-directory defaults', async () => {
      await service.start(PROJECT_ID, USER_ID, makeArchive(), {
        ignorePath: 'target, .next',
      });
      const [, opts] = engine.startGeneration.mock.calls[0] as [
        unknown,
        { ignorePath: string[] },
      ];
      expect(opts.ignorePath).toEqual(expect.arrayContaining(['node_modules']));
      expect(opts.ignorePath).toEqual(expect.arrayContaining(['target']));
      expect(opts.ignorePath).toEqual(expect.arrayContaining(['.next']));
      // No duplicates even if the user repeats a default.
      expect(new Set(opts.ignorePath).size).toBe(opts.ignorePath.length);
    });

    it('checks admin access before doing anything', async () => {
      await service.start(PROJECT_ID, USER_ID, makeArchive(), {});
      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, USER_ID, [
        'admin',
      ]);
    });
  });

  // --- apply ---------------------------------------------------------------

  describe('apply', () => {
    it('404s when there is no generation', async () => {
      prisma.specGeneration.findUnique.mockResolvedValue(null);
      await expect(service.apply(PROJECT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409s while the generation is still running', async () => {
      prisma.specGeneration.findUnique.mockResolvedValue({
        id: ROW_ID,
        status: SpecGenStatus.running,
        sourceName: 'source.zip',
        generatedSpec: null,
      });
      await expect(service.apply(PROJECT_ID, USER_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(specs.persistSpec).not.toHaveBeenCalled();
    });

    it('persists the reviewed spec with generatedByAI set and clears the job', async () => {
      prisma.specGeneration.findUnique.mockResolvedValue({
        id: ROW_ID,
        status: SpecGenStatus.completed,
        sourceName: 'my-api.zip',
        generatedSpec: OAS3_DOC,
      });
      specs.persistSpec.mockResolvedValue({ id: 'spec-1' });

      await service.apply(PROJECT_ID, USER_ID);

      expect(specs.persistSpec).toHaveBeenCalledWith(
        PROJECT_ID,
        'my-api.generated.json',
        OAS3_DOC,
        true,
      );
      expect(prisma.specGeneration.delete).toHaveBeenCalledWith({
        where: { projectId: PROJECT_ID },
      });
    });
  });

  // --- discard -------------------------------------------------------------

  describe('discard', () => {
    it('deletes the row and tells the engine to clean up', async () => {
      prisma.specGeneration.findUnique.mockResolvedValue({
        id: ROW_ID,
        jobId: 'job-1',
      });
      await service.discard(PROJECT_ID, USER_ID);
      expect(prisma.specGeneration.delete).toHaveBeenCalled();
      expect(engine.deleteGeneration).toHaveBeenCalledWith('job-1');
    });

    it('404s when there is nothing to discard', async () => {
      prisma.specGeneration.findUnique.mockResolvedValue(null);
      await expect(service.discard(PROJECT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // --- findForProject ------------------------------------------------------

  describe('findForProject', () => {
    it('does not leak the engine job id to the client', async () => {
      prisma.specGeneration.findUnique.mockResolvedValue({
        id: ROW_ID,
        jobId: 'job-1',
        status: SpecGenStatus.completed,
        sourceName: 'source.zip',
        step: 'Finalising the specification',
        stepIndex: 9,
        stepTotal: 9,
        generatedSpec: OAS3_DOC,
        warnings: [],
        error: null,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const view = await service.findForProject(PROJECT_ID, USER_ID);

      expect(view).not.toHaveProperty('jobId');
      // Three operations across two paths in OAS3_DOC.
      expect(view.operationCount).toBe(3);
    });

    it('404s when the project has never run a generation', async () => {
      prisma.specGeneration.findUnique.mockResolvedValue(null);
      await expect(service.findForProject(PROJECT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // --- result handling -----------------------------------------------------
  // persistResult is private but is the whole point of the polling loop, so it
  // is exercised through the poll path via a completed engine status.

  describe('result persistence', () => {
    async function pollOnce(result: {
      openapi: string;
      format: 'oas3' | 'swagger2';
      operationCount: number;
      warnings: string[];
    }): Promise<Record<string, unknown>> {
      engine.getGenerationStatus.mockResolvedValue({
        jobId: 'job-1',
        status: 'completed',
        error: null,
        warnings: [],
        step: null,
        stepLabel: null,
        stepIndex: 0,
        stepTotal: 9,
      });
      engine.getGenerationResult.mockResolvedValue(result);

      // poll() is private but it is the entire point of the polling loop, so
      // it is driven directly rather than through a 5-second timer.
      const internals = service as unknown as {
        poll: (
          rowId: string,
          jobId: string,
          attempt: number,
          tick: (n: number) => void,
        ) => Promise<void>;
        polling: Set<string>;
      };
      internals.polling.add(ROW_ID);
      await internals.poll(ROW_ID, 'job-1', 0, () => undefined);

      const calls = prisma.specGeneration.update.mock.calls as [
        Record<string, unknown>,
      ][];
      return calls[0]?.[0] ?? {};
    }

    it('stores an OAS 3 document as-is', async () => {
      const call = await pollOnce({
        openapi: OAS3_DOC,
        format: 'oas3',
        operationCount: 3,
        warnings: [],
      });
      const data = call.data as { status: string; generatedSpec: string };
      expect(data.status).toBe(SpecGenStatus.completed);
      const doc = JSON.parse(data.generatedSpec) as { openapi?: string };
      expect(doc.openapi).toBe('3.0.3');
    });

    it('converts a Swagger 2.0 fallback to OpenAPI 3 and warns about it', async () => {
      const call = await pollOnce({
        openapi: SWAGGER2_DOC,
        format: 'swagger2',
        operationCount: 1,
        warnings: ['No Java runtime found'],
      });
      const data = call.data as { generatedSpec: string; warnings: string[] };
      const doc = JSON.parse(data.generatedSpec) as {
        openapi?: string;
        swagger?: string;
      };
      expect(doc.openapi).toMatch(/^3\./);
      expect(doc.swagger).toBeUndefined();
      expect(data.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('Swagger 2.0')]),
      );
    });

    it('marks the job failed when the document is unparseable', async () => {
      await pollOnce({
        openapi: 'not json at all',
        format: 'oas3',
        operationCount: 0,
        warnings: [],
      });
      const calls = prisma.specGeneration.updateMany.mock.calls as [
        { data: { status: string; error: string } },
      ][];
      expect(calls[0][0].data.status).toBe(SpecGenStatus.failed);
      expect(calls[0][0].data.error).toContain('not valid JSON');
    });
  });
});
