import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient, Prisma } from '@prisma/client';
import { PERMISSIONS } from '@church/shared';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
describe('Finance HTTP with isolated PostgreSQL', () => {
  const schema = `finance_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication;
  let db: PrismaClient;
  let token: string;
  let reader: string;
  let normal: string;
  let community: string;
  let storageRoot: string;
  const post = (path: string, body: object, auth = token) =>
    request(app.getHttpServer())
      .post('/api/v1/finance' + path)
      .auth(auth, { type: 'bearer' })
      .send(body);
  const patch = (path: string, body: object, auth = token) =>
    request(app.getHttpServer())
      .patch('/api/v1/finance' + path)
      .auth(auth, { type: 'bearer' })
      .send(body);
  const get = (path: string, auth = token) =>
    request(app.getHttpServer())
      .get('/api/v1/finance' + path)
      .auth(auth, { type: 'bearer' });
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error('TEST_DATABASE_URL is required for finance HTTP tests');
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
    process.env.JWT_REFRESH_SECRET = randomBytes(48).toString('hex');
    storageRoot = await mkdtemp(join(tmpdir(), 'finance-http-'));
    process.env.PRIVATE_STORAGE_PATH = storageRoot;
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
    async function user(codes: string[]) {
      const email = `${randomUUID()}@finance.example`,
        password = 'Finance-test-password-2026';
      const reg = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password, name: 'Finance test' })
        .expect(201);
      if (codes.length) {
        await db.permission.createMany({
          data: codes.map((code) => ({ code })),
          skipDuplicates: true,
        });
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
          data: { userId: reg.body.id as string, roleId: role.id },
        });
      }
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      return login.body.accessToken as string;
    }
    token = await user(PERMISSIONS.filter((p) => p.startsWith('FINANCE_')));
    reader = await user([
      'FINANCE_TRANSACTION_READ',
      'FINANCE_TRANSACTION_UPDATE',
      'FINANCE_DASHBOARD_READ',
    ]);
    normal = await user(['MEMBER_READ']);
    community = await user([
      'MEMBER_READ',
      'VISITOR_READ',
      'VISITOR_WRITE',
      'EVENT_READ',
      'EVENT_WRITE',
    ]);
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) {
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });
  async function fixture(currency = 'EUR') {
    const account = (
      await post('/accounts', {
        name: randomUUID(),
        bank: 'Banco',
        currency,
        openingBalance: '100.00',
      }).expect(201)
    ).body as { id: string };
    const incomeCategory = await db.financialCategory.findFirstOrThrow({
      where: { kind: 'INCOME', parentId: { not: null } },
    });
    const expenseCategory = await db.financialCategory.findFirstOrThrow({
      where: { kind: 'EXPENSE', parentId: { not: null } },
    });
    return {
      accountId: account.id,
      incomeCategoryId: incomeCategory.id,
      expenseCategoryId: expenseCategory.id,
    };
  }
  it('filters monthly dashboard totals by account and prevents private description searches', async () => {
    const f = await fixture();
    const date = new Date().toISOString().slice(0, 10);
    const month = date.slice(0, 7);
    await post('/incomes', {
      amount: '23.45',
      date,
      categoryId: f.incomeCategoryId,
      accountId: f.accountId,
      description: 'Current month fixture',
      origin: 'Manual',
      status: 'COMPLETED',
    }).expect(201);
    await post('/expenses', {
      amount: '5.45',
      date,
      dueDate: date,
      paidAt: date,
      categoryId: f.expenseCategoryId,
      accountId: f.accountId,
      description: 'Current expense',
      status: 'COMPLETED',
    }).expect(201);
    const result = await get(
      `/dashboard?month=${month}&accountId=${f.accountId}`,
    ).expect(200);
    expect(result.body.balances).toHaveLength(1);
    expect(result.body.balances[0]).toMatchObject({
      currency: 'EUR',
      income: '23.45',
      expenses: '5.45',
      balance: '118',
    });
    expect(
      result.body.trend.some(
        (r: { month: string; income: string }) =>
          r.month === month && r.income === '23.45',
      ),
    ).toBe(true);
    expect(
      result.body.latestTransactions.every(
        (r: { currency: string }) => r.currency === 'EUR',
      ),
    ).toBe(true);
    await get('/dashboard?month=2026-13').expect(400);
    await get('/incomes?search=confidential', reader).expect(403);
  });
  it('audits visitor/event changes and limits administrative dashboard data to granted domains', async () => {
    const endpoint = (path: string) =>
      request(app.getHttpServer())
        .get('/api/v1/community' + path)
        .auth(community, { type: 'bearer' });
    const visitor = await request(app.getHttpServer())
      .post('/api/v1/community/visitors')
      .auth(community, { type: 'bearer' })
      .send({ name: 'Visitor dashboard fixture', visitedAt: '2026-10-07' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/community/events')
      .auth(community, { type: 'bearer' })
      .send({
        name: 'Event dashboard fixture',
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        location: 'Hall',
      })
      .expect(201);
    const list = await endpoint(
      '/visitors?search=dashboard&status=NEW&pageSize=1',
    ).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.total).toBe(1);
    await request(app.getHttpServer())
      .patch('/api/v1/community/visitors/' + visitor.body.id)
      .auth(community, { type: 'bearer' })
      .send({ status: 'CONTACTED' })
      .expect(200);
    expect(
      await db.auditLog.count({
        where: {
          entity: 'Visitor',
          entityId: visitor.body.id as string,
          userId: { not: null },
        },
      }),
    ).toBeGreaterThanOrEqual(2);
    const scoped = await request(app.getHttpServer())
      .get('/api/v1/community/dashboard')
      .auth(normal, { type: 'bearer' })
      .expect(200);
    expect(scoped.body.members).toBeDefined();
    expect(scoped.body.visitors).toBeUndefined();
    expect(scoped.body.upcomingEvents).toBeUndefined();
    await request(app.getHttpServer())
      .get('/api/v1/community/visitors')
      .auth(normal, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/community/events')
      .auth(normal, { type: 'bearer' })
      .send({})
      .expect(403);
    const full = await endpoint('/dashboard').expect(200);
    expect(full.body.events).toBe(1);
    expect(full.body.upcomingEvents[0].name).toBe('Event dashboard fixture');
  });
  it('provisions example hierarchy and prevents cycles and mixed types', async () => {
    const items = (await get('/categories?pageSize=100').expect(200)).body
      .items as {
      id: string;
      name: string;
      kind: string;
      parentId: string | null;
    }[];
    const root = items.find((i) => i.name === 'Receitas')!,
      child = items.find((i) => i.name === 'Dízimos')!;
    expect(child.parentId).toBe(root.id);
    await patch('/categories/' + root.id, { parentId: child.id }).expect(400);
    await patch('/categories/' + child.id, { kind: 'EXPENSE' }).expect(400);
    await post('/categories', {
      name: 'Inválida',
      kind: 'EXPENSE',
      parentId: root.id,
    }).expect(400);
  });
  it('stores exact money, validates payment status and rejects banking credentials', async () => {
    const f = await fixture();
    await post('/accounts', {
      name: 'Banco',
      bank: 'Banco',
      currency: 'EUR',
      openingBalance: '0',
      password: 'secret',
    }).expect(400);
    const base = {
      amount: '0.10',
      date: '2026-10-01',
      categoryId: f.incomeCategoryId,
      accountId: f.accountId,
      description: 'Receita',
      origin: 'Manual',
      status: 'COMPLETED',
    };
    await post('/incomes', { ...base, amount: 0.1 }).expect(400);
    await post('/incomes', { ...base, amount: '0' }).expect(400);
    const income = await post('/incomes', base).expect(201);
    expect(
      new Prisma.Decimal(income.body.amount as string).equals('0.10'),
    ).toBe(true);
    await post('/expenses', {
      amount: '0.05',
      date: '2026-10-01',
      dueDate: '2026-10-02',
      categoryId: f.expenseCategoryId,
      accountId: f.accountId,
      description: 'Luz',
      status: 'COMPLETED',
    }).expect(400);
    await post('/expenses', {
      amount: '0.05',
      date: '2026-10-01',
      dueDate: '2026-10-02',
      paidAt: '2026-10-02',
      categoryId: f.expenseCategoryId,
      accountId: f.accountId,
      description: 'Luz',
      status: 'COMPLETED',
    }).expect(201);
    await patch('/accounts/' + f.accountId, { currency: 'BRL' }).expect(400);
    const dashboard = await get('/dashboard').expect(200);
    expect(
      dashboard.body.balances.some(
        (b: { currency: string; balance: string }) =>
          b.currency === 'EUR' && new Prisma.Decimal(b.balance).gte('100.05'),
      ),
    ).toBe(true);
    expect(
      await db.auditLog.count({
        where: { entityId: income.body.id as string },
      }),
    ).toBeGreaterThan(0);
  });
  it('tracks a contribution through its bank file and protects all member details', async () => {
    const f = await fixture();
    const member = await db.member.create({
      data: { name: 'Pessoa confidencial' },
    });
    const bankImport = await db.bankImport.create({
      data: {
        accountId: f.accountId,
        storageKey: randomUUID(),
        filename: 'extrato-bancario.csv',
      },
    });
    const bank = await db.bankTransaction.create({
      data: {
        importId: bankImport.id,
        amount: '25',
        date: new Date('2026-10-04'),
        reference: 'Origem 123',
      },
    });
    const income = await db.income.create({
      data: {
        amount: '25',
        date: new Date('2026-10-04'),
        categoryId: f.incomeCategoryId,
        accountId: f.accountId,
        description: 'Pessoa confidencial dízimo',
        origin: 'Banco confidencial',
        memberId: member.id,
        bankTransactionId: bank.id,
        status: 'COMPLETED',
      },
    });
    const contribution = await post('/contributions', {
      incomeId: income.id,
      memberId: member.id,
      type: 'TITHE',
    }).expect(201);
    await post('/contributions', {
      incomeId: income.id,
      memberId: member.id,
      type: 'TITHE',
    }).expect(409);
    const list = await get('/contributions').expect(200);
    expect(list.body.items[0].income.bankTransaction.import.filename).toBe(
      'extrato-bancario.csv',
    );
    await get('/contributions', reader).expect(403);
    await get('/contributions', normal).expect(403);
    await get('/incomes', normal).expect(403);
    const limited = await get('/incomes', reader).expect(200);
    const i = limited.body.items.find(
      (r: { id: string }) => r.id === income.id,
    );
    expect(i.memberId).toBeUndefined();
    expect(i.origin).toBeUndefined();
    expect(i.description).toBe('Receita restrita');
    const dashboard = await get('/dashboard', reader).expect(200);
    expect(JSON.stringify(dashboard.body)).not.toContain('Pessoa confidencial');
    expect(dashboard.body.balances[0].tithes).toBeUndefined();
    await patch(
      '/incomes/' + income.id,
      { description: 'alteração' },
      reader,
    ).expect(403);
    const otherMember = await db.member.create({ data: { name: 'Outro' } });
    await patch('/contributions/' + contribution.body.id, {
      memberId: otherMember.id,
    }).expect(400);
  });
  it('uploads and downloads private expense files with permissions and content validation', async () => {
    const f = await fixture();
    const expense = (
      await post('/expenses', {
        amount: '30',
        date: '2026-10-04',
        dueDate: '2026-10-10',
        accountId: f.accountId,
        categoryId: f.expenseCategoryId,
        description: 'Documento privado',
      }).expect(201)
    ).body as { id: string };
    const upload = (auth: string, filename: string, buffer: Buffer) =>
      request(app.getHttpServer())
        .post(`/api/v1/finance/expenses/${expense.id}/attachments`)
        .auth(auth, { type: 'bearer' })
        .attach('file', buffer, { filename, contentType: 'application/pdf' });
    await upload(normal, 'documento.pdf', Buffer.from('%PDF-1.7')).expect(403);
    await upload(token, 'documento.exe', Buffer.from('%PDF-1.7')).expect(400);
    await upload(token, 'documento.pdf', Buffer.from('invalid')).expect(400);
    const file = await upload(
      token,
      'documento.pdf',
      Buffer.from('%PDF-1.7 private'),
    ).expect(201);
    expect(file.body.storageKey).toBeUndefined();
    await get('/attachments/' + file.body.id + '/download', normal).expect(403);
    const result = await get(
      '/attachments/' + file.body.id + '/download',
    ).expect(200);
    expect(result.headers['content-disposition']).toContain('attachment');
    expect(result.headers['cache-control']).toContain('no-store');
    expect(result.body.toString()).toBe('%PDF-1.7 private');
    await get('/attachments/' + randomUUID() + '/download').expect(404);
  });
  it('rolls financial writes back if the audit fails', async () => {
    const f = await fixture();
    const prisma = app.get(PrismaService);
    const original = prisma.$transaction.bind(prisma);
    const spy = jest.spyOn(prisma, '$transaction').mockImplementation((async (
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      original(async (tx) => {
        const audit = jest
          .spyOn(tx.auditLog, 'create')
          .mockRejectedValue(new Error('audit failure'));
        try {
          return await callback(tx);
        } finally {
          audit.mockRestore();
        }
      })) as typeof prisma.$transaction);
    const before = await db.income.count();
    try {
      await post('/incomes', {
        amount: '1',
        date: '2026-10-04',
        categoryId: f.incomeCategoryId,
        accountId: f.accountId,
        description: 'Rollback',
        origin: 'Manual',
      }).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(await db.income.count()).toBe(before);
  });
});
