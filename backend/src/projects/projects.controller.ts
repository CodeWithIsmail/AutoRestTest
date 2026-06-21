import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

interface AuthenticatedRequest extends Request {
  // JwtStrategy.validate returns a User-shaped object; we only need the id.
  user: { id: string };
}

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  /**
   * POST /projects
   * Creates a new project with the authenticated user as owner.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(req.user.id, dto);
  }

  /**
   * GET /projects
   * Returns every project the authenticated user owns or is a member of.
   */
  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.projectsService.findAllForUser(req.user.id);
  }

  /**
   * GET /projects/:id
   * Returns full project details including owner and members.
   */
  @Get(':id')
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.projectsService.findOne(id, req.user.id);
  }

  /**
   * PATCH /projects/:id
   * Updates name and/or description. Owner-only.
   */
  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, req.user.id, dto);
  }

  /**
   * DELETE /projects/:id
   * Deletes the project (and cascades to members). Owner-only.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.projectsService.remove(id, req.user.id);
  }
}
