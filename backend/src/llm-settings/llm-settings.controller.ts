import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { LlmScope } from '../../generated/prisma/client';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateLlmSettingsDto } from './dto/update-llm-settings.dto';
import { LlmSettingsService } from './llm-settings.service';

const SCOPES: string[] = Object.values(LlmScope);

/**
 * Admin-only: live-editable LLM tuning knobs, so the model/RPM/etc for each
 * of the platform's three LLM surfaces can change without a redeploy. See
 * LlmSettingsService for what "no override set" resolves to per scope.
 */
@Controller('admin/llm-settings')
@UseGuards(JwtAuthGuard, AdminGuard)
export class LlmSettingsController {
  constructor(private readonly settings: LlmSettingsService) {}

  @Get()
  async list() {
    return this.settings.listAll();
  }

  @Patch(':scope')
  async update(
    @Param('scope') scope: string,
    @Body() dto: UpdateLlmSettingsDto,
  ) {
    if (!SCOPES.includes(scope)) {
      throw new BadRequestException(
        `Unknown scope: ${scope}. Expected one of ${SCOPES.join(', ')}`,
      );
    }
    return this.settings.upsert(scope as LlmScope, dto);
  }
}
