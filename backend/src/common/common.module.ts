import { Global, Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';

/**
 * Global module for cross-cutting services shared by feature modules.
 * Marked @Global so providers like ProjectAccessService are injectable
 * everywhere without re-importing (mirrors PrismaModule).
 */
@Global()
@Module({
  providers: [ProjectAccessService],
  exports: [ProjectAccessService],
})
export class CommonModule {}
