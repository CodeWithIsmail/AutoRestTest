import { Global, Module } from '@nestjs/common';
import { EngineService } from './engine.service';

/**
 * Provides the engine-service HTTP client globally so any feature module can
 * drive test runs without re-importing.
 */
@Global()
@Module({
  providers: [EngineService],
  exports: [EngineService],
})
export class EngineModule {}
