import { Module } from '@nestjs/common';
import { SpecsController } from './specs.controller';
import { SpecsService } from './specs.service';
import { SpecGenerationService } from './spec-generation.service';

@Module({
  controllers: [SpecsController],
  providers: [SpecsService, SpecGenerationService],
})
export class SpecsModule {}
