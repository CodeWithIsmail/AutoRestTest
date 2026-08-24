import { Global, Module } from '@nestjs/common';
import { LlmSettingsController } from './llm-settings.controller';
import { LlmSettingsService } from './llm-settings.service';

/**
 * Global so EngineService and the Reports LlmService can inject
 * LlmSettingsService without re-importing — mirrors EngineModule/CommonModule.
 */
@Global()
@Module({
  controllers: [LlmSettingsController],
  providers: [LlmSettingsService],
  exports: [LlmSettingsService],
})
export class LlmSettingsModule {}
