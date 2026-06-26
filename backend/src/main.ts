import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

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
