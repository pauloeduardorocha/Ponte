import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@church/shared';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { PostgresThrottlerStorage } from '../src/modules/auth/postgres-throttler.storage';

describe('Security and audit HTTP (isolated PostgreSQL)', () => {
  const schema = `security_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication;
  let db: PrismaClient;
  let admin: { id: string; token: string; email: string };
  let member: { id: string; token: string; email: string };
  let profileId: string;
  const password = 'Security-test-password-2026';
  async function user(codes: string[] = []) {
    const email = `${randomUUID()}@security.example`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, name: 'Security test' })
      .expect(201);
    if (codes.length) {
      const permissions = await db.permission.findMany({
        where: { code: { in: codes } },
      });
      const role = await db.role.create({
        data: {
          name: randomUUID(),
          permissions: {
            create: permissions.map((p) => ({ permissionId: p.id })),
          },
        },
      });
      await db.userRole.create({
        data: { userId: reg.body.id, roleId: role.id },
      });
    }
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return {
      id: reg.body.id as string,
      token: login.body.accessToken as string,
      email,
    };
  }
  const get = (path: string, token = admin.token) =>
    request(app.getHttpServer())
      .get('/api/v1' + path)
      .auth(token, { type: 'bearer' });
  const post = (path: string, data: object, token = admin.token) =>
    request(app.getHttpServer())
      .post('/api/v1' + path)
      .auth(token, { type: 'bearer' })
      .send(data);
  const patch = (path: string, data: object, token = admin.token) =>
    request(app.getHttpServer())
      .patch('/api/v1' + path)
      .auth(token, { type: 'bearer' })
      .send(data);
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error('TEST_DATABASE_URL required');
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
    process.env.JWT_REFRESH_SECRET = randomBytes(48).toString('hex');
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: process.env, stdio: 'pipe' },
    );
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: async () => ({
          totalHits: 1,
          timeToExpire: 60000,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();
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
    await db.permission.createMany({
      data: PERMISSIONS.map((code) => ({ code })),
      skipDuplicates: true,
    });
    admin = await user([...PERMISSIONS]);
    member = await user();
    profileId = (
      await db.member.create({
        data: { name: 'Private member', email: 'private@member.example' },
      })
    ).id;
    await db.user.update({
      where: { id: member.id },
      data: { memberId: profileId },
    });
  }, 60000);
  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });
  it('records actor, before/after and real request context atomically', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/members/${profileId}`)
      .auth(admin.token, { type: 'bearer' })
      .set('User-Agent', 'Security test agent')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ name: 'Rectified member' })
      .expect(200);
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: 'DATA_Member_UPDATE', entityId: profileId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.userId).toBe(admin.id);
    expect(log.oldValues).toMatchObject({ name: 'Private member' });
    expect(log.newValues).toMatchObject({ name: 'Rectified member' });
    expect(log.userAgent).toBe('Security test agent');
    expect(log.ip).toBeTruthy();
    expect(log.ip).not.toBe('203.0.113.7');
  });
  it('never stores password hashes or tokens in audit snapshots', async () => {
    const logs = await db.auditLog.findMany({
      where: { entity: 'User', entityId: member.id },
    });
    expect(logs.length).toBeGreaterThan(0);
    const text = JSON.stringify(logs);
    expect(text).not.toMatch(
      /password_hash|passwordHash|\$argon2|accessToken|refreshToken|token_hash/,
    );
    expect(text).not.toContain(password);
  });
  it('makes audit records immutable even through direct database writes', async () => {
    const log = await db.auditLog.findFirstOrThrow();
    await expect(
      db.auditLog.update({ where: { id: log.id }, data: { action: 'TAMPER' } }),
    ).rejects.toThrow();
    await expect(
      db.auditLog.delete({ where: { id: log.id } }),
    ).rejects.toThrow();
    await get('/audit', member.token).expect(403);
    await get('/audit').expect(200);
    await get(`/audit/${randomUUID()}`).expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/audit/${log.id}`)
      .auth(admin.token, { type: 'bearer' })
      .expect(404);
  });
  it('prevents member IDOR and rejects impersonation in privacy requests', async () => {
    await get('/members', member.token).expect(403);
    await get(`/members/${profileId}`, member.token).expect(403);
    await get(`/privacy/members/${profileId}/export`, member.token).expect(403);
    const mine = await get('/privacy/me', member.token).expect(200);
    expect(mine.body.id).toBe(profileId);
    await post(
      '/privacy/me/requests',
      {
        kind: 'RECTIFICATION',
        details: 'Correct my phone number',
        memberId: randomUUID(),
      },
      member.token,
    ).expect(400);
    const req = await post(
      '/privacy/me/requests',
      { kind: 'RECTIFICATION', details: 'Correct my phone number' },
      member.token,
    ).expect(201);
    expect(req.body.memberId).toBe(profileId);
  });
  it('exports only verified own data and requires specific financial export permissions', async () => {
    const res = await get('/privacy/me/export', member.token).expect(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.text).toContain(profileId);
    expect(res.text).not.toContain(admin.email);
    await get('/privacy/me/export?includeFinancial=true', member.token).expect(
      403,
    );
    await get(
      '/privacy/me/export?memberId=' + randomUUID(),
      member.token,
    ).expect(400);
    expect(
      await db.auditLog.count({
        where: { action: 'PRIVACY_EXPORT', userId: member.id },
      }),
    ).toBe(1);
  });
  it('records versioned consent and explicit withdrawal', async () => {
    await post(
      '/privacy/me/consents',
      { purpose: 'Newsletter', policyVersion: 'v1', granted: true },
      member.token,
    ).expect(201);
    await post(
      '/privacy/me/consents',
      { purpose: 'Newsletter', policyVersion: 'v1', granted: false },
      member.token,
    ).expect(201);
    const consents = await db.memberConsent.findMany({
      where: { memberId: profileId },
      orderBy: { createdAt: 'asc' },
    });
    expect(consents.map((c) => c.granted)).toEqual([true, false]);
    expect(consents.every((c) => c.recordedBy === member.id)).toBe(true);
  });
  it('blocks account brute force independently of the IP rate limiter', async () => {
    const target = await user();
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: target.email, password: 'Wrong-password-123' })
        .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: target.email, password })
      .expect(401);
    expect(
      await db.auditLog.count({
        where: { action: 'AUTH_LOGIN_FAILED', userId: target.id },
      }),
    ).toBe(10);
    expect(
      await db.auditLog.count({ where: { action: 'AUTH_LOGIN_BLOCKED' } }),
    ).toBeGreaterThan(0);
  }, 30000);
  it('blocks role escalation and revokes sessions after changing permissions', async () => {
    await patch(
      `/users/${member.id}/roles`,
      { roleIds: [] },
      member.token,
    ).expect(403);
    await patch(`/users/${admin.id}/roles`, { roleIds: [] }).expect(409);
    const limited = await user(['PERMISSION_MANAGE']);
    const powerful = await db.role.findFirstOrThrow({
      where: { permissions: { some: { permission: { code: 'AUDIT_READ' } } } },
    });
    await patch(
      `/users/${member.id}/roles`,
      { roleIds: [powerful.id] },
      limited.token,
    ).expect(403);
    const target = await user();
    await patch(`/users/${target.id}/roles`, { roleIds: [] }).expect(200);
    await get('/auth/me', target.token).expect(401);
    expect(
      await db.auditLog.count({
        where: { action: 'DATA_UserRole_DELETE', userId: admin.id },
      }),
    ).toBeGreaterThan(0);
  });
  it('shares rate limits across instances and enforces concurrent increments', async () => {
    const one = new PostgresThrottlerStorage(app.get(PrismaService));
    const two = new PostgresThrottlerStorage(app.get(PrismaService));
    const key = randomUUID();
    const rows = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        (i % 2 ? one : two).increment(key, 60000, 5, 60000, 'security'),
      ),
    );
    expect(rows.filter((r) => r.isBlocked)).toHaveLength(3);
    expect(
      (await two.increment(key, 60000, 5, 60000, 'security')).isBlocked,
    ).toBe(true);
  });
  it('preserves the last active super administrator', async () => {
    const target = await user();
    const role = await db.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      create: { name: 'SUPER_ADMIN' },
      update: {},
    });
    await db.userRole.create({ data: { userId: target.id, roleId: role.id } });
    await patch(`/users/${target.id}/roles`, { roleIds: [] }).expect(409);
    await patch(`/users/${target.id}/status`, { status: 'DISABLED' }).expect(
      409,
    );
  });
  it('preserves sources and financial integrity against direct database tampering', async () => {
    const account = await db.bankAccount.create({
      data: { bank: 'Test', name: 'Security bank', currency: 'EUR' },
    });
    const category = await db.financialCategory.findFirstOrThrow({
      where: { kind: 'INCOME' },
    });
    const imported = await db.bankImport.create({
      data: {
        accountId: account.id,
        filename: 'source.csv',
        storageKey: randomUUID(),
        uploadedBy: admin.id,
        status: 'CONFIRMED',
      },
    });
    const bank = await db.bankTransaction.create({
      data: {
        importId: imported.id,
        date: new Date('2026-10-07'),
        amount: '10.10',
        reference: 'SEC-1',
        description: 'Sensitive name in bank statement',
        direction: 'CREDIT',
        categoryId: category.id,
        classification: 'INCOME',
        status: 'CLASSIFIED',
      },
    });
    await expect(
      db.bankTransaction.update({
        where: { id: bank.id },
        data: { amount: '20' },
      }),
    ).rejects.toThrow();
    await expect(
      db.bankTransaction.update({
        where: { id: bank.id },
        data: { memberId: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      db.bankImport.update({
        where: { id: imported.id },
        data: { filename: 'replacement.csv' },
      }),
    ).rejects.toThrow();
    const ledger = await db.$transaction(async (tx) => {
      const income = await tx.income.create({
        data: {
          amount: '10.10',
          date: bank.date,
          accountId: account.id,
          categoryId: category.id,
          bankTransactionId: bank.id,
          description: bank.description,
          origin: 'Bank import',
          status: 'COMPLETED',
        },
      });
      await tx.bankTransaction.update({
        where: { id: bank.id },
        data: { status: 'RECONCILED' },
      });
      await tx.bankReconciliation.create({
        data: {
          bankTransactionId: bank.id,
          incomeId: income.id,
          createdLedger: true,
          reconciledBy: admin.id,
        },
      });
      return income;
    });
    await expect(
      db.income.update({ where: { id: ledger.id }, data: { amount: '11' } }),
    ).rejects.toThrow();
    await expect(
      db.income.update({
        where: { id: ledger.id },
        data: { bankTransactionId: null },
      }),
    ).rejects.toThrow();
    await expect(
      db.income.delete({ where: { id: ledger.id } }),
    ).rejects.toThrow();
    await expect(
      db.bankReconciliation.deleteMany({ where: { incomeId: ledger.id } }),
    ).rejects.toThrow();
    await expect(
      db.bankImport.delete({ where: { id: imported.id } }),
    ).rejects.toThrow();
    const reader = await user(['FINANCE_TRANSACTION_READ']);
    const response = await get('/finance/incomes', reader.token).expect(200);
    expect(JSON.stringify(response.body)).not.toContain(bank.description);
    await get(
      '/finance/banking/imports/' + imported.id + '/download',
      reader.token,
    ).expect(403);
    await get(
      '/finance/attachments/' + randomUUID() + '/download',
      member.token,
    ).expect(403);
    const audit = await db.auditLog.findFirstOrThrow({
      where: {
        entity: 'Income',
        entityId: ledger.id,
        action: 'DATA_Income_INSERT',
      },
    });
    expect(audit.newValues).toMatchObject({ amount: '10.10' });
  });
  it('requires retention policy and respects legal hold before anonymizing', async () => {
    const visitor = await db.visitor.create({
      data: {
        name: 'Operational privacy copy',
        firstName: 'Operational',
        lastName: 'privacy',
        visitedAt: new Date('2026-10-01'),
        memberId: profileId,
        email: 'erase@privacy.example',
        notes: 'Erase copy',
      },
    });
    const follow = await db.followUp.create({
      data: {
        visitorId: visitor.id,
        assignedToUserId: admin.id,
        notes: 'Personal follow-up',
      },
    });
    await db.followUpInteraction.create({
      data: {
        followUpId: follow.id,
        type: 'PHONE',
        interactionDate: new Date(),
        performedByUserId: admin.id,
        notes: 'Personal conversation',
      },
    });
    const req = await post(
      '/privacy/me/requests',
      { kind: 'ANONYMIZATION', details: 'Please anonymize my profile' },
      member.token,
    ).expect(201);
    const body = { requestId: req.body.id };
    await post(`/privacy/members/${profileId}/anonymize`, body).expect(409);
    await post('/privacy/retention', {
      dataClass: 'MEMBER_PROFILE',
      minimumMonths: 0,
      legalBasis: 'Approved test retention policy',
    }).expect(201);
    await patch(`/privacy/members/${profileId}/legal-hold`, {
      legalHold: true,
    }).expect(200);
    await post(`/privacy/members/${profileId}/anonymize`, body).expect(409);
    await patch(`/privacy/members/${profileId}/legal-hold`, {
      legalHold: false,
    }).expect(200);
    await post(`/privacy/members/${profileId}/anonymize`, body).expect(201);
    const profile = await db.member.findUniqueOrThrow({
      where: { id: profileId },
    });
    expect(profile.email).toBeNull();
    const scrubbed = await db.visitor.findUniqueOrThrow({
      where: { id: visitor.id },
    });
    expect(scrubbed.email).toBeNull();
    expect(scrubbed.notes).toBeNull();
    expect(scrubbed.memberId).toBe(profileId);
    expect(
      (await db.followUp.findUniqueOrThrow({ where: { id: follow.id } })).notes,
    ).toBeNull();
    expect(
      (
        await db.followUpInteraction.findFirstOrThrow({
          where: { followUpId: follow.id },
        })
      ).notes,
    ).toBe('Registro anonimizado');
    expect(profile.anonymizedAt).not.toBeNull();
    await get('/auth/me', member.token).expect(401);
    await patch(`/members/${profileId}`, {
      name: 'Reidentified profile',
    }).expect(409);
  });
  it('retains contribution evidence when an anonymization request has financial history', async () => {
    const target = await user();
    const profile = await db.member.create({
      data: { name: 'Financial privacy member' },
    });
    await db.user.update({
      where: { id: target.id },
      data: { memberId: profile.id },
    });
    const account = await db.bankAccount.findFirstOrThrow();
    const category = await db.financialCategory.findFirstOrThrow({
      where: { kind: 'INCOME' },
    });
    const income = await db.income.create({
      data: {
        amount: '50.10',
        date: new Date('2026-10-07'),
        description: 'Contribution',
        origin: 'Manual',
        memberId: profile.id,
        categoryId: category.id,
        accountId: account.id,
        status: 'COMPLETED',
      },
    });
    await db.contribution.create({
      data: { incomeId: income.id, memberId: profile.id, type: 'TITHE' },
    });
    await expect(
      db.contribution.update({
        where: { incomeId: income.id },
        data: { memberId: profileId },
      }),
    ).rejects.toThrow();
    const req = await post(
      '/privacy/me/requests',
      { kind: 'ANONYMIZATION', details: 'Request profile anonymization' },
      target.token,
    ).expect(201);
    await post(`/privacy/members/${profile.id}/anonymize`, {
      requestId: req.body.id,
    }).expect(409);
    expect(
      (
        await db.income.findUniqueOrThrow({ where: { id: income.id } })
      ).amount.toFixed(2),
    ).toBe('50.10');
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: profile.id } }))
        .anonymizedAt,
    ).toBeNull();
  });
});
