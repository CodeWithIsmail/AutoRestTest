import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { EndpointsModule } from './endpoints/endpoints.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { SpecsModule } from './specs/specs.module';
import { TestSuitesModule } from './test-suites/test-suites.module';

@Module({
  imports: [
    // Loads .env and exposes it via process.env / ConfigService everywhere.
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // PrismaModule is marked @Global so its PrismaService is injectable
    // in every feature module without re-importing it.
    PrismaModule,

    // CommonModule is @Global so its shared services (e.g. ProjectAccessService)
    // are injectable in every feature module without re-importing.
    CommonModule,

    // Feature modules
    AuthModule,
    ProjectsModule,
    SpecsModule,
    EndpointsModule,
    TestSuitesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
