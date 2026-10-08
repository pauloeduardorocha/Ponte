import { PrivacyModule } from './modules/privacy/privacy.module';
import { AuditModule } from './modules/audit/audit.module';
import { auditMiddleware } from './modules/audit/audit-context';
import { MiddlewareConsumer, NestModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { PermissionGuard } from './modules/auth/permission.guard';
import { MembersModule } from './modules/members/members.module';
import { UsersModule } from './modules/users/users.module';
import { BankingModule } from './modules/banking/banking.module';
import { FinanceModule } from './modules/finance/finance.module';
import { LibraryModule } from './modules/library/library.module';
import { PrismaService } from './database/prisma.service';
import { PostgresThrottlerStorage } from './modules/auth/postgres-throttler.storage';
import { SafeExceptionFilter } from './common/safe-exception.filter';
import { CommunityModule } from './modules/community/community.controller';
import { OperationsModule } from './modules/operations/operations.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [PrismaService],
      useFactory: (db: PrismaService) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new PostgresThrottlerStorage(db),
      }),
    }),
    DatabaseModule,
    AuditModule,
    PrivacyModule,
    CommunityModule,
    OperationsModule,
    HealthModule,
    AuthModule,
    MembersModule,
    UsersModule,
    LibraryModule,
    FinanceModule,
    BankingModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: SafeExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(auditMiddleware).forRoutes('*');
  }
}
