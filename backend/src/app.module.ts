import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { SpecsModule } from './specs/specs.module';

@Module({
  imports: [
    // Loads .env and exposes it via process.env / ConfigService everywhere.
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // PrismaModule is marked @Global so its PrismaService is injectable
    // in every feature module without re-importing it.
    PrismaModule,

    // Feature modules
    AuthModule,
    ProjectsModule,
    SpecsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
