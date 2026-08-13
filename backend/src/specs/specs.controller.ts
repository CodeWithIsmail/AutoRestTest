import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SpecsService } from './specs.service';
import {
  MAX_ARCHIVE_BYTES,
  SpecGenerationService,
} from './spec-generation.service';
import { GenerateSpecDto } from './dto/generate-spec.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('projects/:projectId/spec')
@UseGuards(JwtAuthGuard)
export class SpecsController {
  constructor(
    private readonly specsService: SpecsService,
    private readonly generationService: SpecGenerationService,
  ) {}

  /**
   * POST /projects/:projectId/spec
   * Uploads (or replaces) the project's OpenAPI 3.0 spec. Owner/admin only.
   * Expects a multipart form with the file in the `file` field.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.specsService.upload(projectId, req.user.id, file);
  }

  /**
   * GET /projects/:projectId/spec
   * Returns the stored spec (metadata + raw content). Any project member.
   */
  @Get()
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.specsService.findForProject(projectId, req.user.id);
  }

  /**
   * DELETE /projects/:projectId/spec
   * Removes the project's spec. Owner/admin only.
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.specsService.remove(projectId, req.user.id);
  }

  // ---------------------------------------------------------------------------
  // Generate a spec from an uploaded codebase. The result is held for review
  // and only becomes the project's spec once the user applies it.
  // ---------------------------------------------------------------------------

  /**
   * POST /projects/:projectId/spec/generate
   * Queues a generation from a .zip of the API's source. Owner/admin only.
   */
  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ARCHIVE_BYTES } }),
  )
  async startGeneration(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: GenerateSpecDto,
  ) {
    return this.generationService.start(projectId, req.user.id, file, dto);
  }

  /**
   * GET /projects/:projectId/spec/generate
   * Current generation job, including progress. Any project member.
   */
  @Get('generate')
  async findGeneration(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.generationService.findForProject(projectId, req.user.id);
  }

  /**
   * POST /projects/:projectId/spec/generate/apply
   * Promotes the reviewed document to the project's spec. Owner/admin only.
   */
  @Post('generate/apply')
  @HttpCode(HttpStatus.CREATED)
  async applyGeneration(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.generationService.apply(projectId, req.user.id);
  }

  /**
   * DELETE /projects/:projectId/spec/generate
   * Discards the generation, leaving any existing spec untouched. Owner/admin.
   */
  @Delete('generate')
  @HttpCode(HttpStatus.OK)
  async discardGeneration(
    @Req() req: AuthenticatedRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.generationService.discard(projectId, req.user.id);
  }
}
