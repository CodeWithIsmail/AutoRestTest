import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/**
 * Feature module for the Project workspace container.
 *
 * AuthModule is imported so we can reuse the existing `JwtAuthGuard`
 * (which lives in `../auth/guards`) without redefining it.
 *
 * PrismaService is available globally via the @Global PrismaModule, so
 * no Prisma import is needed here.
 */
@Module({
  imports: [AuthModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
