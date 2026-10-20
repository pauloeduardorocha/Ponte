import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { assertRestrictedDatabase } from '../src/database/database-security';

// Opt in only when a disposable database is explicitly configured.
const securityIntegration = [
  'DB_SECURITY_TEST_ADMIN_URL',
  'DB_SECURITY_TEST_RUNTIME_URL',
  'DB_SECURITY_TEST_HOST',
  'DB_SECURITY_PRODUCTION_HOST',
].some((name) => process.env[name])
  ? describe
  : describe.skip;

// Explicit disposable branch only. This suite must never target production.
securityIntegration('Restricted database login (isolated PostgreSQL)', () => {
  let admin: PrismaClient;
  let runtime: PrismaClient;
  let app: INestApplication;
  let accessToken: string;
  const email = `security-${randomUUID()}@example.invalid`;
  const password = randomBytes(36).toString('base64url');

  beforeAll(async () => {
    const adminUrl = process.env.DB_SECURITY_TEST_ADMIN_URL;
    const runtimeUrl = process.env.DB_SECURITY_TEST_RUNTIME_URL;
    const host = process.env.DB_SECURITY_TEST_HOST;
    const productionHost = process.env.DB_SECURITY_PRODUCTION_HOST;
    if (
      !host ||
      !productionHost ||
      !adminUrl ||
      !runtimeUrl ||
      new URL(adminUrl).hostname !== host ||
      new URL(runtimeUrl).hostname !== host ||
      host === productionHost ||
      host.replace('-pooler.', '.') === productionHost.replace('-pooler.', '.')
    ) {
      throw new Error(
        'Supply the explicit disposable security branch connections',
      );
    }
    process.env.DATABASE_URL = runtimeUrl;
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('base64url');
    process.env.JWT_REFRESH_SECRET = randomBytes(48).toString('base64url');
    process.env.CORS_ORIGIN = 'https://security.example.invalid';
    admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
    runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl } } });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  }, 60000);

  afterAll(async () => {
    await app?.close();
    await runtime?.$disconnect();
    await admin?.$disconnect();
  });

  it('accepts the runtime login and rejects the migration owner', async () => {
    await expect(assertRestrictedDatabase(runtime)).resolves.toBeUndefined();
    await expect(assertRestrictedDatabase(admin)).rejects.toThrow(
      'restricted database login',
    );
  });

  it.each([
    'UPDATE public.audit_logs SET action=action WHERE false',
    'DELETE FROM public.audit_logs WHERE false',
    'TRUNCATE public.audit_logs',
    'ALTER TABLE public.audit_logs DISABLE TRIGGER audit_immutable',
    'CREATE TABLE public.security_forbidden_probe (id integer)',
    'CREATE TEMP TABLE security_forbidden_probe (id integer)',
    'SELECT * FROM public._prisma_migrations LIMIT 0',
    'SET ROLE neondb_owner',
    'CREATE ROLE security_forbidden_probe',
  ])('denies privileged SQL: %s', async (sql) => {
    let denied = false;
    try {
      await runtime.$transaction(async (tx) => {
        try {
          await tx.$executeRawUnsafe(sql);
        } catch (error) {
          if (
            error instanceof Error &&
            'meta' in error &&
            (error.meta as { code?: string })?.code === '42501'
          )
            denied = true;
          else throw error;
        }
        // Even an accidentally permitted statement must not persist.
        throw new Error('ROLLBACK_SECURITY_PROBE');
      });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== 'ROLLBACK_SECURITY_PROBE'
      )
        throw error;
    }
    expect(denied).toBe(true);
  });

  it('registers an account and commits the identity/audit triggers using runtime privileges', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Synthetic security probe', email, password })
      .expect(201);
    const user = await runtime.user.findUniqueOrThrow({ where: { email } });
    expect(user.memberId).toBeTruthy();
    const audit = await runtime.auditLog.findFirstOrThrow({
      where: { entity: 'User', entityId: user.id, action: 'DATA_User_INSERT' },
    });
    expect(JSON.stringify(audit)).not.toContain(user.passwordHash);
  });

  it('logs in, reads the current session and enforces permissions with the restricted login', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    accessToken = login.body.accessToken;
    expect(accessToken).toBeTruthy();
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(accessToken, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/audit')
      .auth(accessToken, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer()).get('/api/v1/members').expect(401);
  });

  it('keeps the real database health check working', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body).toBeDefined();
  });
});
