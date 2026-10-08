import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok' as const,
        services: { api: 'up' as const, database: 'up' as const },
      };
    } catch {
      this.logger.error('Database health check failed');

      return {
        status: 'degraded' as const,
        services: { api: 'up' as const, database: 'down' as const },
      };
    }
  }
}
