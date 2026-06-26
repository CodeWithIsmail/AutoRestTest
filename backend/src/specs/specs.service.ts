import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import SwaggerParser from '@apidevtools/swagger-parser';
import * as yaml from 'js-yaml';
import { Prisma, Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Max accepted upload size for a spec file (5 MB). */
const MAX_SPEC_BYTES = 5 * 1024 * 1024;

/** Allowed file extensions for an uploaded spec. */
const ALLOWED_EXTENSIONS = ['.yaml', '.yml', '.json'];

/**
 * Metadata view of a stored spec — returned by upload and used as the base for
 * the detail view. Never includes the raw file content on its own.
 */
export interface SpecSummary {
  id: string;
  fileName: string;
  generatedByAI: boolean;
  uploadedAt: Date;
  openapiVersion: string;
  title: string;
  endpointCount: number;
}

/** Full spec view (GET) — summary plus the raw file content. */
export interface SpecDetail extends SpecSummary {
  fileContent: string;
}

/** Shape of the parsed OpenAPI document we read fields from. */
interface ParsedOpenApi {
  openapi?: unknown;
  swagger?: unknown;
  info?: { title?: unknown };
  paths?: Record<string, unknown>;
}

@Injectable()
export class SpecsService {
  constructor(private readonly prisma: PrismaService) {}

  // --------------------------------------------------------------------------
  // upload — POST /projects/:projectId/spec
  // Owner or admin only. Replaces any existing spec for the project.
  // --------------------------------------------------------------------------
  async upload(
    projectId: string,
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<SpecSummary> {
    await this.assertProjectAccess(projectId, userId, [Role.admin]);

    if (!file) {
      throw new BadRequestException('No spec file was uploaded (field "file")');
    }

    if (file.size > MAX_SPEC_BYTES) {
      throw new BadRequestException('Spec file exceeds the 5 MB size limit');
    }

    const ext = this.extensionOf(file.originalname);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Unsupported file type "${ext}". Upload a .yaml, .yml, or .json OpenAPI spec`,
      );
    }

    const raw = file.buffer.toString('utf-8');
    const parsed = this.parse(raw);
    const meta = await this.validateOpenApi3(parsed);

    const saved = await this.prisma.apiSpecification.upsert({
      where: { projectId },
      create: {
        projectId,
        fileName: file.originalname,
        fileContent: raw,
        generatedByAI: false,
      },
      update: {
        fileName: file.originalname,
        fileContent: raw,
        generatedByAI: false,
        uploadedAt: new Date(),
      },
      select: {
        id: true,
        fileName: true,
        generatedByAI: true,
        uploadedAt: true,
      },
    });

    return {
      ...saved,
      openapiVersion: meta.version,
      title: meta.title,
      endpointCount: meta.endpointCount,
    };
  }

  // --------------------------------------------------------------------------
  // findForProject — GET /projects/:projectId/spec
  // Any project member (incl. viewer) may read.
  // --------------------------------------------------------------------------
  async findForProject(projectId: string, userId: string): Promise<SpecDetail> {
    await this.assertProjectAccess(projectId, userId);

    const spec = await this.prisma.apiSpecification.findUnique({
      where: { projectId },
      select: {
        id: true,
        fileName: true,
        fileContent: true,
        generatedByAI: true,
        uploadedAt: true,
      },
    });

    if (!spec) {
      throw new NotFoundException(
        'No API specification uploaded for this project',
      );
    }

    // Re-derive display metadata from the stored content. Parsing here keeps a
    // single source of truth (the file) without storing duplicated columns.
    const parsed = this.parse(spec.fileContent);
    const meta = this.summarize(parsed);

    return {
      id: spec.id,
      fileName: spec.fileName,
      fileContent: spec.fileContent,
      generatedByAI: spec.generatedByAI,
      uploadedAt: spec.uploadedAt,
      openapiVersion: meta.version,
      title: meta.title,
      endpointCount: meta.endpointCount,
    };
  }

  // --------------------------------------------------------------------------
  // remove — DELETE /projects/:projectId/spec
  // Owner or admin only.
  // --------------------------------------------------------------------------
  async remove(
    projectId: string,
    userId: string,
  ): Promise<{ message: string }> {
    await this.assertProjectAccess(projectId, userId, [Role.admin]);

    try {
      await this.prisma.apiSpecification.delete({
        where: { projectId },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new NotFoundException(
          'No API specification uploaded for this project',
        );
      }
      throw err;
    }

    return { message: 'API specification deleted successfully' };
  }

  // --------------------------------------------------------------------------
  // private helpers
  // --------------------------------------------------------------------------

  /**
   * Ensure the user can act on the project. When `mutatingRoles` is provided,
   * the caller must be the owner OR a member holding one of those roles;
   * otherwise any owner/member (incl. viewer) passes. Throws 404 if the
   * project is missing, 403 if access is denied.
   */
  private async assertProjectAccess(
    projectId: string,
    userId: string,
    mutatingRoles?: Role[],
  ): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        ownerId: true,
        members: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isOwner = project.ownerId === userId;
    const membership = project.members[0];

    if (!isOwner && !membership) {
      throw new ForbiddenException('You do not have access to this project');
    }

    if (mutatingRoles && !isOwner) {
      if (!membership || !mutatingRoles.includes(membership.role)) {
        throw new ForbiddenException(
          'You do not have permission to manage the specification for this project',
        );
      }
    }
  }

  /** Lowercased file extension including the dot, e.g. ".yaml". */
  private extensionOf(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
  }

  /** Parse raw text as JSON or YAML into an object, or throw 400. */
  private parse(raw: string): ParsedOpenApi {
    if (!raw.trim()) {
      throw new BadRequestException('The uploaded spec file is empty');
    }

    let doc: unknown;
    try {
      // js-yaml parses JSON too (JSON is a subset of YAML), so one path covers both.
      doc = yaml.load(raw);
    } catch {
      throw new BadRequestException(
        'The spec file could not be parsed as YAML or JSON',
      );
    }

    if (!doc || typeof doc !== 'object') {
      throw new BadRequestException(
        'The spec file is not a valid OpenAPI document',
      );
    }

    return doc;
  }

  /**
   * Validate the parsed document is OpenAPI 3.0/3.1 and structurally sound,
   * then return its display metadata. Rejects Swagger 2.0 explicitly.
   */
  private async validateOpenApi3(parsed: ParsedOpenApi): Promise<{
    version: string;
    title: string;
    endpointCount: number;
  }> {
    if (typeof parsed.swagger === 'string' && !parsed.openapi) {
      throw new BadRequestException(
        'Swagger 2.0 specs are not supported. Convert to OpenAPI 3.0 and re-upload',
      );
    }

    const version = typeof parsed.openapi === 'string' ? parsed.openapi : '';
    if (!version.startsWith('3.')) {
      throw new BadRequestException(
        'The file must declare an OpenAPI 3.x version (`openapi: 3.0.x` or `3.1.x`)',
      );
    }

    try {
      // validate() dereferences $refs and checks the document against the spec.
      // Clone first because the parser mutates the object it receives.
      await SwaggerParser.validate(structuredClone(parsed) as never);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      throw new BadRequestException(`Invalid OpenAPI specification: ${reason}`);
    }

    return this.summarize(parsed);
  }

  /** Extract title / version / endpoint count from a parsed document. */
  private summarize(parsed: ParsedOpenApi): {
    version: string;
    title: string;
    endpointCount: number;
  } {
    const version = typeof parsed.openapi === 'string' ? parsed.openapi : '';
    const title =
      parsed.info && typeof parsed.info.title === 'string'
        ? parsed.info.title
        : 'Untitled API';
    const endpointCount = parsed.paths ? Object.keys(parsed.paths).length : 0;

    return { version, title, endpointCount };
  }
}
