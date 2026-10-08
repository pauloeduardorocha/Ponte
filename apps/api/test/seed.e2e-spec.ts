import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as argon2 from 'argon2';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CsvStatementParser,
  transactionFingerprint,
} from '../src/modules/banking/statement.parsers';

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration('Development seed (isolated PostgreSQL schema)', () => {
  const schema = `seed_test_${randomUUID().replaceAll('-', '')}`;
  const password = 'Development-demo-test-only-2026';
  let db: PrismaClient;
  let env: NodeJS.ProcessEnv;

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set('schema', schema);
    env = {
      ...process.env,
      DATABASE_URL: url.toString(),
      NODE_ENV: 'development',
      SEED_DEMO: 'true',
      SEED_DEMO_PASSWORD: password,
    };
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env, stdio: 'pipe' },
    );
  }, 30000);

  afterAll(async () => {
    // Only the randomly named schema created by this test is removed.
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  });

  function seed(overrides: NodeJS.ProcessEnv = {}) {
    return execFileSync(
      process.execPath,
      [
        require.resolve('ts-node/dist/bin.js'),
        '--project',
        'tsconfig.json',
        'prisma/seed.ts',
      ],
      { env: { ...env, ...overrides }, stdio: 'pipe' },
    );
  }

  it('is idempotent, preserves edited data/passwords and assigns least-privilege roles', async () => {
    seed();
    const first = await db.user.findMany({ orderBy: { email: 'asc' } });
    expect(first).toHaveLength(5);
    expect(await db.member.count()).toBe(3);
    expect(await db.loan.count()).toBe(2);
    expect(await db.smallGroup.count()).toBe(1);
    expect(await db.smallGroupMember.count()).toBe(2);
    expect(await db.ministry.count()).toBe(1);
    expect(await db.ministryMember.count()).toBe(2);
    expect(await db.followUp.count()).toBe(1);
    expect(await db.followUpInteraction.count()).toBe(1);
    expect(await db.volunteerSchedule.count()).toBe(1);
    expect(await db.volunteerAssignment.count()).toBe(1);
    expect(await db.attendance.count()).toBe(1);
    expect(await db.notificationTemplate.count()).toBe(1);
    expect(await db.fine.count()).toBe(1);
    expect(await db.bankAccount.count()).toBe(1);
    expect(await db.income.count()).toBe(4);
    expect(await db.expense.count()).toBe(2);
    expect(await db.contribution.count()).toBe(3);
    expect(await db.bankTransaction.count()).toBe(150);
    expect(await db.financialCategory.count()).toBe(13);
    const imported = await db.bankImport.findFirstOrThrow();
    const parsed = await new CsvStatementParser().parse({
      originalname: imported.filename,
      mimetype: 'text/csv',
      size: imported.size!,
      buffer: readFileSync(
        resolve(
          env.PRIVATE_STORAGE_PATH ?? './private-storage',
          imported.storageKey,
        ),
      ),
    });
    expect(parsed).toHaveLength(150);
    const movements = await db.bankTransaction.findMany({
      where: { importId: imported.id },
      orderBy: { rowNumber: 'asc' },
    });
    expect(
      parsed.map((r) => transactionFingerprint(imported.accountId, r)),
    ).toEqual(movements.map((r) => r.fingerprint));
    const admin = await db.user.findUniqueOrThrow({
      where: { email: 'admin@ponte.example' },
    });
    expect(await argon2.verify(admin.passwordHash, password)).toBe(true);
    const member = await db.member.findFirstOrThrow();
    await db.member.update({
      where: { id: member.id },
      data: { notes: 'Preserve existing edit' },
    });
    const demoIncome = await db.income.findUniqueOrThrow({
      where: { id: 'd0000007-0000-4000-8000-000000000001' },
    });
    await db.financialCategory.update({
      where: { id: demoIncome.categoryId },
      data: { name: 'Preserve renamed category' },
    });
    seed({ SEED_DEMO_PASSWORD: 'Changed-seed-password-is-not-applied' });
    expect(await db.financialCategory.count()).toBe(13);
    expect(
      (
        await db.financialCategory.findUniqueOrThrow({
          where: { id: demoIncome.categoryId },
        })
      ).name,
    ).toBe('Preserve renamed category');
    const second = await db.user.findMany({ orderBy: { email: 'asc' } });
    expect(second.map((user) => [user.id, user.passwordHash])).toEqual(
      first.map((user) => [user.id, user.passwordHash]),
    );
    expect(await db.member.count()).toBe(3);
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: member.id } })).notes,
    ).toBe('Preserve existing edit');
    const role = await db.role.findUniqueOrThrow({
      where: { name: 'MEMBER' },
      include: { permissions: true },
    });
    expect(role.permissions).toHaveLength(0);
    const secretary = await db.role.findUniqueOrThrow({
      where: { name: 'SECRETARY' },
      include: { permissions: { include: { permission: true } } },
    });
    expect(
      secretary.permissions.map(({ permission }) => permission.code).sort(),
    ).toEqual(['MEMBER_CREATE', 'MEMBER_READ', 'MEMBER_UPDATE']);
  }, 30000);

  it('refuses production, non-opt-in and missing/weak passwords', () => {
    expect(() => seed({ NODE_ENV: 'production' })).toThrow();
    expect(() => seed({ SEED_DEMO: 'false' })).toThrow();
    expect(() => seed({ SEED_DEMO_PASSWORD: '' })).toThrow();
    expect(() => seed({ SEED_DEMO_PASSWORD: 'short' })).toThrow();
  }, 30000);
});
