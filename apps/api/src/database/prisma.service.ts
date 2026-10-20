import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { assertRestrictedDatabase } from './database-security';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    if (process.env.NODE_ENV === 'production') {
      try {
        await this.$connect();
        await assertRestrictedDatabase(this);
      } catch {
        await this.$disconnect().catch(() => undefined);
        throw new Error(
          'Production database security check failed. Configure a restricted application login.',
        );
      }
    } else {
      await this.$connect();
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
