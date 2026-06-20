import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * Thin NestJS wrapper around the generated Prisma client.
 *
 * Prisma 7 requires a driver adapter at construction time (the legacy
 * implicit `datasource.url` flow is gone), so we instantiate a
 * `PrismaPg` adapter from the `DATABASE_URL` env var and pass it in.
 *
 * Implements OnModuleInit / OnModuleDestroy so the database connection is
 * established on bootstrap and gracefully closed on shutdown.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not defined. Add it to your .env file before starting the app.',
      );
    }
    super({
      adapter: new PrismaPg({ connectionString }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
