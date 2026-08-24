import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { CommonModule } from './common/common.module';
import { EmailModule } from './email/email.module';
import { EndpointsModule } from './endpoints/endpoints.module';
import { EngineModule } from './engine/engine.module';
import { GraphModule } from './graph/graph.module';
import { LlmSettingsModule } from './llm-settings/llm-settings.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { ReportsModule } from './reports/reports.module';
import { SpecsModule } from './specs/specs.module';
import { TestSuitesModule } from './test-suites/test-suites.module';
import { UsersModule } from './users/users.module';

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

    // EngineModule is @Global so the engine-service client is injectable anywhere.
    EngineModule,

    // EmailModule is @Global so the mailer is injectable anywhere.
    EmailModule,

    // LlmSettingsModule is @Global so the live LLM-settings store is
    // injectable anywhere (EngineService, Reports' LlmService).
    LlmSettingsModule,

    // Rate-limit storage. Note there is NO APP_GUARD here: ThrottlerGuard is
    // applied per-controller (auth, users) instead. A global limit would also
    // cover the run-status and graph endpoints the frontend polls every three
    // seconds, and any limit strict enough to matter for logins would break
    // that polling for a user with two tabs open.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),

    // Feature modules
    AuthModule,
    UsersModule,
    ProjectsModule,
    SpecsModule,
    EndpointsModule,
    GraphModule,
    TestSuitesModule,
    ReportsModule,
    CollaborationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
