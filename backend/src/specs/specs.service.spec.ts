import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAccessService } from '../common/project-access.service';
import { SpecsService } from './specs.service';

// A minimal but valid OpenAPI 3.0 document used across the happy-path tests.
// Two operations: GET /ping and GET /users.
const VALID_OAS3_YAML = `openapi: 3.0.0
info:
  title: Sample API
  version: 1.0.0
paths:
  /ping:
    get:
      responses:
        '200':
          description: OK
  /users:
    get:
      responses:
        '200':
          description: OK
`;

const OWNER_ID = 'owner-1';
const PROJECT_ID = 'project-1';

function makeFile(
  content: string,
  originalname = 'spec.yaml',
): Express.Multer.File {
  const buffer = Buffer.from(content, 'utf-8');
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype: 'application/yaml',
    size: buffer.length,
    buffer,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
  };
}

describe('SpecsService', () => {
  let service: SpecsService;
  let prisma: {
    apiSpecification: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    endpoint: {
      deleteMany: jest.Mock;
      createMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let access: { assertAccess: jest.Mock };

  beforeEach(() => {
    prisma = {
      apiSpecification: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      endpoint: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn(),
      },
      // Run the callback against the same mock object (tx === prisma here).
      $transaction: jest.fn((cb: (tx: typeof prisma) => unknown) => cb(prisma)),
    };
    access = { assertAccess: jest.fn().mockResolvedValue(undefined) };
    service = new SpecsService(
      prisma as unknown as PrismaService,
      access as unknown as ProjectAccessService,
    );
  });

  describe('upload', () => {
    it('stores a valid OAS3 spec and syncs its endpoints atomically', async () => {
      prisma.apiSpecification.upsert.mockResolvedValue({
        id: 'spec-1',
        fileName: 'spec.yaml',
        generatedByAI: false,
        uploadedAt: new Date('2026-06-26T00:00:00Z'),
      });

      const result = await service.upload(
        PROJECT_ID,
        OWNER_ID,
        makeFile(VALID_OAS3_YAML),
      );

      expect(result.openapiVersion).toBe('3.0.0');
      expect(result.title).toBe('Sample API');
      expect(result.endpointCount).toBe(2);

      // Requires owner/admin to mutate.
      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, OWNER_ID, [
        Role.admin,
      ]);

      // Spec save + endpoint replacement happen in one transaction.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.endpoint.deleteMany).toHaveBeenCalledWith({
        where: { projectId: PROJECT_ID },
      });
      expect(prisma.endpoint.createMany).toHaveBeenCalledTimes(1);
      const createCalls = prisma.endpoint.createMany.mock.calls as Array<
        [{ data: Array<{ addedManually: boolean }> }]
      >;
      const createArg = createCalls[0][0];
      expect(createArg.data).toHaveLength(2);
      expect(createArg.data[0].addedManually).toBe(false);
    });

    it('propagates the access check failure (e.g. viewer cannot upload)', async () => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(
        service.upload(PROJECT_ID, OWNER_ID, makeFile(VALID_OAS3_YAML)),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a Swagger 2.0 document', async () => {
      const swagger2 =
        'swagger: "2.0"\ninfo:\n  title: Old\n  version: 1.0\npaths: {}\n';

      await expect(
        service.upload(PROJECT_ID, OWNER_ID, makeFile(swagger2)),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects malformed YAML', async () => {
      const bad = 'openapi: 3.0.0\n  : : not valid : :\n   bad indent';

      await expect(
        service.upload(PROJECT_ID, OWNER_ID, makeFile(bad)),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unsupported file extension', async () => {
      await expect(
        service.upload(
          PROJECT_ID,
          OWNER_ID,
          makeFile(VALID_OAS3_YAML, 'spec.txt'),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when no file is provided', async () => {
      await expect(
        service.upload(PROJECT_ID, OWNER_ID, undefined),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findForProject', () => {
    it('returns the stored spec with the live endpoint count', async () => {
      prisma.apiSpecification.findUnique.mockResolvedValue({
        id: 'spec-1',
        fileName: 'spec.yaml',
        fileContent: VALID_OAS3_YAML,
        generatedByAI: false,
        uploadedAt: new Date(),
      });
      prisma.endpoint.count.mockResolvedValue(2);

      const result = await service.findForProject(PROJECT_ID, OWNER_ID);

      expect(result.fileContent).toContain('openapi: 3.0.0');
      expect(result.title).toBe('Sample API');
      expect(result.endpointCount).toBe(2);
      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, OWNER_ID);
    });

    it('404s when no spec is stored', async () => {
      prisma.apiSpecification.findUnique.mockResolvedValue(null);

      await expect(
        service.findForProject(PROJECT_ID, OWNER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates an access-denied error', async () => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(
        service.findForProject(PROJECT_ID, OWNER_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('deletes the spec for an authorized user', async () => {
      prisma.apiSpecification.delete.mockResolvedValue({});

      await expect(service.remove(PROJECT_ID, OWNER_ID)).resolves.toEqual({
        message: 'API specification deleted successfully',
      });
      expect(access.assertAccess).toHaveBeenCalledWith(PROJECT_ID, OWNER_ID, [
        Role.admin,
      ]);
    });

    it('404s when there is no spec to delete', async () => {
      prisma.apiSpecification.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('not found', {
          code: 'P2025',
          clientVersion: 'test',
        }),
      );

      await expect(service.remove(PROJECT_ID, OWNER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propagates an access-denied error', async () => {
      access.assertAccess.mockRejectedValue(new ForbiddenException());

      await expect(service.remove(PROJECT_ID, OWNER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
