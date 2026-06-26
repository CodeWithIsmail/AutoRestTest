import {
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

interface AuthenticatedRequest extends Request {
  user: { id: string };
}

@Controller('projects/:projectId/spec')
@UseGuards(JwtAuthGuard)
export class SpecsController {
  constructor(private readonly specsService: SpecsService) {}

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
}
