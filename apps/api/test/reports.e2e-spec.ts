import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@church/shared';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { AppModule } from '../src/app.module';
import { REPORTS } from '../src/modules/finance/reports.dto';
describe('Financial reports HTTP', () => {
  const schema = `report_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication;
  let db: PrismaClient;
  let token: string;
  let reader: string;
  let normal: string;
  let storageRoot: string;
  let memberId: string;
  let incomeId: string;
  let accountId: string;
  let categoryId: string;
  let supplierId: string;
  const base = { start: '2026-01-01', end: '2026-01-31' };
  const get = (report: string, auth = token, filters: object = {}) =>
    request(app.getHttpServer())
      .get('/api/v1/finance/reports')
      .auth(auth, { type: 'bearer' })
      .query({ ...base, report, ...filters });
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
      'FINANCE_CONTRIBUTION_READ',
      'FINANCE_DASHBOARD_READ',
    ]);
    normal = await user(['MEMBER_READ']);
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) {
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
    if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
  });

  beforeAll(async () => {
    const member = await db.member.create({ data: { name: 'João Silva' } });
    memberId = member.id;
    const account = await db.bankAccount.create({
      data: {
        bank: 'Banco',
        name: 'EUR',
        currency: 'EUR',
        openingBalance: '100.00',
      },
    });
    accountId = account.id;
    const usd = await db.bankAccount.create({
      data: {
        bank: 'Banco',
        name: 'USD',
        currency: 'USD',
        openingBalance: '0.00',
      },
    });
    const cat = await db.financialCategory.create({
      data: { name: 'Contribuições', kind: 'INCOME' },
    });
    categoryId = cat.id;
    const expcat = await db.financialCategory.create({
      data: { name: 'Energia', kind: 'EXPENSE' },
    });
    const supplier = await db.supplier.create({ data: { name: 'Fornecedor' } });
    supplierId = supplier.id;
    for (const [type, amount] of [
      ['TITHE', '5000.00'],
      ['OFFERING', '500.00'],
      ['DONATION', '200.00'],
    ] as const) {
      const income = await db.income.create({
        data: {
          accountId,
          categoryId,
          memberId,
          amount,
          date: new Date('2026-01-10'),
          description: 'João Silva',
          origin: 'Transferência',
          reference: 'REF-JOAO',
          costCenter: 'Sede',
          status: 'COMPLETED',
          contribution: { create: { memberId, type } },
        },
      });
      incomeId = income.id;
    }
    await db.income.create({
      data: {
        accountId: usd.id,
        categoryId,
        amount: '10.25',
        date: new Date('2026-01-10'),
        description: 'USD',
        origin: 'Manual',
        status: 'COMPLETED',
      },
    });
    await db.income.create({
      data: {
        accountId,
        categoryId,
        amount: '100.00',
        date: new Date('2025-12-10'),
        description: 'Anterior',
        origin: 'Manual',
        status: 'COMPLETED',
      },
    });
    await db.income.create({
      data: {
        accountId,
        categoryId,
        amount: '999.00',
        date: new Date('2026-01-10'),
        description: 'Pendente',
        origin: 'Manual',
        status: 'PENDING',
      },
    });
    await db.expense.create({
      data: {
        accountId,
        categoryId: expcat.id,
        supplierId,
        amount: '50.00',
        date: new Date('2025-12-31'),
        dueDate: new Date('2026-01-15'),
        paidAt: new Date('2026-01-15'),
        description: 'Pagamento de dezembro',
        costCenter: 'Sede',
        status: 'COMPLETED',
      },
    });
    await db.expense.create({
      data: {
        accountId,
        categoryId: expcat.id,
        supplierId,
        amount: '20.00',
        date: new Date('2026-01-20'),
        dueDate: new Date('2026-02-01'),
        paidAt: new Date('2026-02-01'),
        description: 'Pago em fevereiro',
        costCenter: 'Sede',
        status: 'COMPLETED',
      },
    });
    await db.bankImport.create({
      data: {
        accountId,
        filename: 'origem.csv',
        storageKey: 'fixture',
        format: 'CSV',
        mime: 'text/csv',
        size: 10,
        fileHash: 'abc',
        uploadedBy: (await db.user.findFirstOrThrow()).id,
        status: 'READY_FOR_REVIEW',
        transactions: {
          create: {
            date: new Date('2026-01-12'),
            amount: '12.00',
            direction: 'CREDIT',
            description: 'Banco João',
            reference: 'bank-ref',
            fingerprint: 'fixture',
            rowNumber: 2,
            status: 'PENDING_REVIEW',
          },
        },
      },
    });
  });
  it.each(REPORTS)('generates %s with source records', async (report) => {
    const res = await get(
      report,
      token,
      report === 'contribution-statement' ? { memberId } : {},
    ).expect(200);
    expect(res.body.report).toBe(report);
    expect(res.body.filters.start).toBe(base.start);
    if (report === 'tithes') expect(res.body.totals[0].income).toBe('5000.00');
    if (report === 'offerings')
      expect(res.body.totals[0].income).toBe('500.00');
    if (report === 'donations')
      expect(res.body.totals[0].income).toBe('200.00');
    if (report === 'contribution-statement') {
      expect(res.body.totals[0].income).toBe('5700.00');
      expect(res.body.rows[0].contributionId).toBeTruthy();
      expect(res.body.rows.every((r: { id: string }) => r.id)).toBe(true);
    }
    if (report === 'cash-flow') {
      expect(
        res.body.totals.find((t: { currency: string }) => t.currency === 'EUR')
          .expenses,
      ).toBe('50.00');
    }
    if (report === 'expenses') {
      expect(res.body.totals[0].expenses).toBe('20.00');
    }
    if (report === 'account-balances') {
      expect(
        res.body.balances.find(
          (b: { accountId: string }) => b.accountId === accountId,
        ),
      ).toMatchObject({ opening: '200.00', closing: '5850.00' });
    }
    if (report === 'unreconciled') {
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].bankImportId).toBeTruthy();
    }
    if (report === 'incomes') {
      expect(res.body.totals).toHaveLength(2);
      expect(res.body.rows[0].id).toBeTruthy();
    }
    for (const g of res.body.groups)
      expect(
        g.sourceIds.every((id: string) =>
          res.body.rows.some((r: { id: string }) => r.id === id),
        ),
      ).toBe(true);
  });
  it('applies period, account, category, member, supplier, center and status filters', async () => {
    const res = await get('member-contributions', token, {
      accountId,
      categoryId,
      memberId,
      costCenter: 'Sede',
      contributionType: 'OFFERING',
    }).expect(200);
    expect(res.body.count).toBe(1);
    expect(
      (await get('incomes', token, { status: 'PENDING' }).expect(200)).body
        .totals[0].income,
    ).toBe('999.00');
    expect(
      (
        await get('expenses', token, {
          supplierId,
          costCenter: 'Outro',
        }).expect(200)
      ).body.count,
    ).toBe(0);
    expect(
      (await get('incomes', token, { start: '2026-01-11' }).expect(200)).body
        .count,
    ).toBe(0);
    await get('incomes', token, { start: '2026-02-01' }).expect(400);
    await get('account-balances', token, { categoryId }).expect(400);
    await get('cash-flow', token, { status: 'PENDING' }).expect(400);
  });
  it('enforces financial read, member read and dedicated member export permissions', async () => {
    await get('incomes', normal).expect(403);
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: randomUUID() + '@reports.example',
        name: 'No member',
        password: 'Report-test-password-2026',
      })
      .expect(201);
    const role = await db.role.create({
      data: {
        name: randomUUID(),
        permissions: {
          create: {
            permissionId: (
              await db.permission.findUniqueOrThrow({
                where: { code: 'FINANCE_TRANSACTION_READ' },
              })
            ).id,
          },
        },
      },
    });
    await db.userRole.create({
      data: { userId: reg.body.id, roleId: role.id },
    });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: reg.body.email, password: 'Report-test-password-2026' })
      .expect(200);
    await get('tithes', login.body.accessToken).expect(403);
    for (const report of [
      'offerings',
      'donations',
      'member-contributions',
      'contribution-statement',
    ]) {
      await get(
        report,
        login.body.accessToken,
        report === 'contribution-statement' ? { memberId } : {},
      ).expect(403);
    }
    const masked = await get('incomes', login.body.accessToken).expect(200);
    expect(
      masked.body.rows.every(
        (r: { memberId: string | null; member: string; reference: string }) =>
          r.memberId === null && !r.member && !r.reference,
      ),
    ).toBe(true);
    await get('incomes', login.body.accessToken, { memberId }).expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/finance/reports/lookups')
      .auth(login.body.accessToken, { type: 'bearer' })
      .query({ kind: 'members' })
      .expect(403);
    for (const format of ['csv', 'xlsx', 'pdf'])
      await request(app.getHttpServer())
        .get('/api/v1/finance/reports/export')
        .auth(reader, { type: 'bearer' })
        .query({
          ...base,
          report: 'contribution-statement',
          memberId,
          churchName: 'Igreja exemplo',
          format,
        })
        .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/finance/reports/export')
      .auth(reader, { type: 'bearer' })
      .query({ ...base, report: 'incomes', memberId, format: 'csv' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/finance/reports/export')
      .auth(reader, { type: 'bearer' })
      .query({ ...base, report: 'unreconciled', format: 'csv' })
      .expect(403);
  });
  it('redacts member identity from general exports and neutralizes CSV formulas', async () => {
    const general = await request(app.getHttpServer())
      .get('/api/v1/finance/reports/export')
      .auth(reader, { type: 'bearer' })
      .query({ ...base, report: 'incomes', format: 'csv' })
      .expect(200);
    expect(general.text).not.toContain('João Silva');
    expect(general.text).not.toContain('REF-JOAO');
    await db.income.update({
      where: { id: incomeId },
      data: { reference: '=HYPERLINK("https://example.invalid")' },
    });
    const csv = await request(app.getHttpServer())
      .get('/api/v1/finance/reports/export')
      .auth(token, { type: 'bearer' })
      .query({
        ...base,
        report: 'contribution-statement',
        memberId,
        churchName: 'Igreja',
        format: 'csv',
      })
      .expect(200);
    expect(csv.text).toContain("'=HYPERLINK");
  });
  it.each(['csv', 'xlsx', 'pdf'])(
    'exports %s with totals, identity, original IDs and audit',
    async (format) => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/finance/reports/export')
        .auth(token, { type: 'bearer' })
        .query({
          ...base,
          report: 'contribution-statement',
          memberId,
          churchName: 'Igreja exemplo',
          observations: 'Conferir com contabilista',
          format,
        })
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(res.headers['cache-control']).toContain('no-store');
      if (format === 'csv') {
        expect(res.body.toString('utf8')).toContain('5700.00');
        expect(res.body.toString('utf8')).toContain(incomeId);
        expect(res.body.toString('utf8')).toContain('Igreja exemplo');
      }
      if (format === 'xlsx') {
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(res.body);
        expect(JSON.stringify(book.worksheets[0]!.getSheetValues())).toContain(
          '5700.00',
        );
      }
      if (format === 'pdf')
        expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
      const audit = await db.auditLog.findFirstOrThrow({
        where: {
          action: 'FINANCE_REPORT_EXPORT',
          entityId: 'contribution-statement',
          metadata: { path: ['format'], equals: format },
        },
      });
      expect(audit.metadata).toMatchObject({
        count: 3,
        report: 'contribution-statement',
        filters: { memberId },
      });
    },
  );
  it.each(REPORTS.filter((r) => r !== 'contribution-statement'))(
    'exports %s in CSV and XLSX',
    async (report) => {
      for (const format of ['csv', 'xlsx'])
        await request(app.getHttpServer())
          .get('/api/v1/finance/reports/export')
          .auth(token, { type: 'bearer' })
          .query({ ...base, report, format })
          .expect(200);
    },
  );
});
