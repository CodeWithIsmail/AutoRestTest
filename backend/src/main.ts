import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a reverse proxy (Render, and any local tunnel) every request arrives
  // from the proxy's address. Without this the rate limiter on /auth sees one
  // IP for the whole internet and the per-caller limits become global ones.
  app.set('trust proxy', 1);

  // Allow the browser-based frontend (different origin/port) to call the API.
  // Auth is JWT Bearer in a header, so credentials/cookies are not required.
  const corsOrigin = process.env['CORS_ORIGIN'] ?? 'http://localhost:3001';
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Global DTO validation. Whitelist + forbidNonWhitelisted reject any
  // unknown fields in incoming payloads and auto-transforms the body
  // to instances of the corresponding DTO class.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  Logger.log(
    `AutoRestTest API listening on http://localhost:${port}`,
    'Bootstrap',
  );
}

void bootstrap();
