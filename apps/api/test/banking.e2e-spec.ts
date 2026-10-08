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
import ExcelJS from 'exceljs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { auditMiddleware } from '../src/modules/audit/audit-context';
describe('Banking HTTP with isolated PostgreSQL', () => {
  const schema = `banking_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication;
  let db: PrismaClient;
  let token: string;
  let reader: string;
  let normal: string;
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
    app.use(auditMiddleware);
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
      'FINANCE_TRANSACTION_UPDATE',
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
  const csv =
    'Data;Descrição;Montante;Referência;Identificador bancário;Moeda\n07/10/2026;João Silva dizimo;25,10;REF1;BANK1;EUR\n07/10/2026;Energia;-10,20;REF2;BANK2;EUR';
  const upload = (
    accountId: string,
    content: Buffer,
    name = 'extrato.csv',
    mime = 'text/csv',
    auth = token,
  ) =>
    request(app.getHttpServer())
      .post('/api/v1/finance/banking/imports')
      .auth(auth, { type: 'bearer' })
      .field('accountId', accountId)
      .attach('file', content, { filename: name, contentType: mime });
  const rows = async (importId: string) =>
    (await get('/banking/transactions?importId=' + importId).expect(200)).body
      .items as {
      id: string;
      direction: string;
      status: string;
      memberId: string | null;
    }[];
  it('imports private invoices, suggests, associates explicitly and preserves links through reconciliation/undo', async () => {
    const f = await fixture();
    const imported = (await upload(f.accountId, Buffer.from(csv)).expect(201))
      .body;
    expect(imported.period).toEqual({ start: '2026-10-07', end: '2026-10-07' });
    const movements = await rows(imported.id);
    const debit = movements.find((t) => t.direction === 'DEBIT')!;
    const credit = movements.find((t) => t.direction === 'CREDIT')!;
    const doc = {
      issuerName: 'Energia',
      issuerTaxId: '123456789',
      recipientTaxId: '987654321',
      number: randomUUID(),
      date: '2026-10-07',
      amount: '10.20',
      currency: 'EUR',
      documentUrl: 'https://faturas.portaldasfinancas.gov.pt/detalhe?id=99',
    };
    const batch = {
      schemaVersion: 1,
      source: 'E_FATURA',
      capturedAt: '2026-10-07T10:00:00Z',
      invoices: [doc],
    };
    const send = (auth = token, value: unknown = batch) =>
      request(app.getHttpServer())
        .post('/api/v1/finance/invoices/imports')
        .auth(auth, { type: 'bearer' })
        .attach('file', Buffer.from(JSON.stringify(value)), {
          filename: 'faturas.json',
          contentType: 'application/json',
        });
    await send(normal).expect(403);
    await get('/invoices', normal).expect(403);
    const before = await db.expense.count();
    const result = await send().expect(201);
    expect(result.body.inserted).toBe(1);
    expect((await send().expect(201)).body.duplicates).toBe(1);
    expect(await db.expense.count()).toBe(before);
    const suggestions = (
      await get('/invoices/suggestions/' + debit.id).expect(200)
    ).body;
    const invoice = suggestions.find(
      (i: { number: string }) => i.number === doc.number,
    );
    expect(invoice).toMatchObject({ score: 85, bankTransactionId: null });
    await post('/invoices/' + invoice.id + '/association', {
      transactionId: credit.id,
    }).expect(400);
    await post('/invoices/' + invoice.id + '/association', {
      transactionId: debit.id,
    }).expect(201);
    await post('/banking/classify', {
      ids: [credit.id],
      classification: 'IGNORE',
    }).expect(409);
    await post('/banking/classify', {
      ids: [debit.id],
      classification: 'EXPENSE',
      categoryId: f.expenseCategoryId,
    }).expect(201);
    await post('/banking/imports/' + imported.id + '/confirm', {}).expect(201);
    await post('/banking/reconcile', { ids: [debit.id] }).expect(409);
    const trace = await get(
      '/banking/transactions?transactionId=' + debit.id,
    ).expect(200);
    expect(trace.body.items[0].invoices[0]).toMatchObject({
      id: invoice.id,
      documentUrl: doc.documentUrl,
      importId: result.body.id,
    });
    expect(trace.body.items[0].reconciliations[0].expense).toBeTruthy();
    await post('/banking/undo', {
      ids: [debit.id],
      reason: 'Invoice trace test',
    }).expect(201);
    expect(
      (await get('/banking/transactions?transactionId=' + debit.id).expect(200))
        .body.items[0].invoices[0].id,
    ).toBe(invoice.id);
    await get(
      '/invoices/imports/' + result.body.id + '/download',
      normal,
    ).expect(403);
    const original = await get(
      '/invoices/imports/' + result.body.id + '/download',
    ).expect(200);
    expect(original.headers['cache-control']).toContain('no-store');
    expect(JSON.parse(original.body.toString()).invoices[0].number).toBe(
      doc.number,
    );
    const audit = await db.auditLog.findFirst({
      where: {
        entity: 'FinancialInvoice',
        entityId: invoice.id,
        action: 'DATA_FinancialInvoice_UPDATE',
      },
    });
    expect(audit?.userId).toBeTruthy();
    await post('/invoices/' + invoice.id + '/association', {
      transactionId: credit.id,
    }).expect(409);
    await request(app.getHttpServer())
      .delete('/api/v1/finance/invoices/' + invoice.id + '/association')
      .auth(normal, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/api/v1/finance/invoices/' + invoice.id + '/association')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(
      (
        await db.financialInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
        })
      ).bankTransactionId,
    ).toBeNull();
    const removal = await db.auditLog.findFirst({
      where: {
        entity: 'FinancialInvoice',
        entityId: invoice.id,
        action: 'DATA_FinancialInvoice_UPDATE',
        newValues: { path: ['bankTransactionId'], equals: Prisma.JsonNull },
      },
    });
    expect(removal?.oldValues).toMatchObject({ bankTransactionId: debit.id });
    await send(token, {
      ...batch,
      invoices: [{ ...doc, documentUrl: 'https://evil.example/file' }],
    }).expect(400);
    expect(
      await db.invoiceImport.count({ where: { id: result.body.id } }),
    ).toBe(1);
  });
  it('registers CSV automatically, suggests members and preserves bank origin while categorizing', async () => {
    const f = await fixture();
    const member = await db.member.create({ data: { name: 'João Silva' } });
    const before = await db.income.count();
    const imported = (await upload(f.accountId, Buffer.from(csv)).expect(201))
      .body as { id: string; status: string };
    expect(imported.status).toBe('CONFIRMED');
    expect(await db.income.count()).toBe(before + 1);
    const transactions = await rows(imported.id);
    const credit = transactions.find((t) => t.direction === 'CREDIT')!,
      debit = transactions.find((t) => t.direction === 'DEBIT')!;
    expect(credit.memberId).toBeNull();
    await post('/banking/imports/' + imported.id + '/confirm', {}).expect(201);
    const suggestions = await get(
      '/banking/transactions/' + credit.id + '/suggestions',
    ).expect(200);
    expect(suggestions.body[0]).toMatchObject({
      id: member.id,
      confidence: 95,
    });
    await post('/banking/classify', {
      ids: [credit.id],
      classification: 'INCOME',
      categoryId: f.incomeCategoryId,
      memberId: member.id,
      contributionType: 'TITHE',
    }).expect(201);
    await post('/banking/classify', {
      ids: [debit.id],
      classification: 'EXPENSE',
      categoryId: f.expenseCategoryId,
    }).expect(201);
    await post('/banking/reconcile', { ids: [credit.id] }).expect(409);
    await post('/banking/imports/' + imported.id + '/confirm', {}).expect(201);
    expect(await db.income.count()).toBe(before + 1);
    await post('/banking/reconcile', { ids: [credit.id, debit.id] }).expect(
      409,
    );
    const income = await db.income.findFirstOrThrow({
      where: { bankTransactionId: credit.id },
      include: { contribution: true },
    });
    expect(income.amount.equals('25.10')).toBe(true);
    expect(income.contribution?.memberId).toBe(member.id);
    const classified = await db.bankTransaction.findUniqueOrThrow({
      where: { id: credit.id },
    });
    expect(classified.associatedBy).toBeTruthy();
    expect(classified.associatedBy).toBe(classified.classifiedBy);
    const expense = await db.expense.findFirstOrThrow({
      where: { bankTransactionId: debit.id },
    });
    expect(expense.status).toBe('COMPLETED');
    await patch('/incomes/' + income.id, {
      categoryId: '00000000-0000-4000-8000-000000000001',
    }).expect(200);
    await patch('/expenses/' + expense.id, {
      categoryId: '00000000-0000-4000-8000-000000000002',
    }).expect(200);
    expect(
      (await db.bankTransaction.findUniqueOrThrow({ where: { id: credit.id } }))
        .categoryId,
    ).toBe('00000000-0000-4000-8000-000000000001');
    expect(
      (await db.bankTransaction.findUniqueOrThrow({ where: { id: debit.id } }))
        .categoryId,
    ).toBe('00000000-0000-4000-8000-000000000002');
    expect(await db.income.count()).toBe(before + 1);

    await patch('/incomes/' + income.id, { amount: '20' }).expect(409);
    await post('/banking/reconcile', { ids: [credit.id] }).expect(409);
    const trace = await get(
      '/banking/transactions?transactionId=' + credit.id,
    ).expect(200);
    expect(trace.body.items[0].reconciliations[0].income.contribution.id).toBe(
      income.contribution!.id,
    );
    const download = await get(
      '/banking/imports/' + imported.id + '/download',
    ).expect(200);
    expect(download.body.toString()).toBe(csv);
    expect(download.headers['content-disposition']).toContain('attachment');
    await post('/banking/undo', {
      ids: [credit.id, debit.id],
      reason: 'Correção de classificação',
    }).expect(201);
    expect(
      (await db.income.findUniqueOrThrow({ where: { id: income.id } })).status,
    ).toBe('CANCELLED');
    expect(
      (await db.expense.findUniqueOrThrow({ where: { id: expense.id } }))
        .paidAt,
    ).toBeNull();
    expect(
      await db.contribution.findUnique({
        where: { id: income.contribution!.id },
      }),
    ).toBeTruthy();
    await post('/banking/reconcile', { ids: [credit.id] }).expect(201);
    expect(
      await db.income.count({ where: { bankTransactionId: credit.id } }),
    ).toBe(2);
    expect(
      await db.bankReconciliation.count({
        where: { bankTransactionId: credit.id, active: true },
      }),
    ).toBe(1);
  });
  it('ignores identified duplicates and repeated files, while ambiguous matches require review', async () => {
    const f = await fixture();
    const data =
      'date,description,amount,reference,bankIdentifier\n2026-10-07,Uma descrição,20.00,R1,B1\n2026-10-07,Outra descrição,20.00,R1,B1';
    const imported = (await upload(f.accountId, Buffer.from(data)).expect(201))
      .body;
    const items = await rows(imported.id);
    expect(items.map((t) => t.status).sort()).toEqual([
      'RECONCILED',
      'REJECTED',
    ]);
    expect(await db.income.count({ where: { accountId: f.accountId } })).toBe(
      1,
    );
    const repeat = (await upload(f.accountId, Buffer.from(data)).expect(201))
      .body;
    expect((await rows(repeat.id)).every((t) => t.status === 'REJECTED')).toBe(
      true,
    );
    await post('/banking/classify', {
      ids: [(await rows(repeat.id))[0]!.id],
      classification: 'INCOME',
      acceptDuplicate: true,
    }).expect(409);
    expect(await db.income.count({ where: { accountId: f.accountId } })).toBe(
      1,
    );
    const ambiguous = (
      await upload(
        f.accountId,
        Buffer.from('date,description,amount\n2026-10-07,Pagamento,20.00'),
      ).expect(201)
    ).body;
    const duplicate = (await rows(ambiguous.id))[0]!;
    expect(duplicate.status).toBe('POSSIBLE_DUPLICATE');
    await post('/banking/classify', {
      ids: [duplicate.id],
      classification: 'INCOME',
    }).expect(409);
    await post('/banking/classify', {
      ids: [duplicate.id],
      classification: 'INCOME',
      acceptDuplicate: true,
    }).expect(201);
    expect(await db.income.count({ where: { accountId: f.accountId } })).toBe(
      2,
    );
  });
  it('detects existing manual records and links them without creating another ledger entry', async () => {
    const f = await fixture();
    const manual = (
      await post('/incomes', {
        amount: '5.00',
        date: '2026-10-07',
        accountId: f.accountId,
        categoryId: f.incomeCategoryId,
        description: 'Receita manual',
        origin: 'Manual',
        status: 'COMPLETED',
      }).expect(201)
    ).body;
    const imported = (
      await upload(
        f.accountId,
        Buffer.from(
          'date,description,amount\n2026-10-07,Receita no extrato,5.00',
        ),
      ).expect(201)
    ).body;
    const movement = (await rows(imported.id))[0]!;
    expect(movement.status).toBe('POSSIBLE_DUPLICATE');
    expect(imported.summary).toEqual({ registered: 0, ignored: 0, pending: 1 });
    expect(await db.income.count({ where: { accountId: f.accountId } })).toBe(
      1,
    );
    await post(
      '/banking/transactions/' + movement.id + '/link',
      { incomeId: manual.id },
      normal,
    ).expect(403);
    const results = await Promise.all([
      post('/banking/transactions/' + movement.id + '/link', {
        incomeId: manual.id,
      }),
      post('/banking/transactions/' + movement.id + '/link', {
        incomeId: manual.id,
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const linked = await db.income.findUniqueOrThrow({
      where: { id: manual.id },
    });
    expect(linked.bankTransactionId).toBe(movement.id);
    expect(linked.categoryId).toBe(f.incomeCategoryId);
    expect(await db.income.count({ where: { accountId: f.accountId } })).toBe(
      1,
    );
    expect((await rows(imported.id))[0]!.status).toBe('RECONCILED');
  });
  it('imports Millennium XLSX introductions and alternate columns, plus OFX', async () => {
    const f = await fixture();
    for (const withBalance of [true, false]) {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Sheet1');
      sheet.addRow(['Millennium bcp']);
      sheet.addRow(['Conta', '', '123456 - EUR']);
      for (let i = 3; i <= 7; i++) sheet.addRow(['']);
      sheet.addRow([
        'Data Lançamento',
        'Data Valor',
        'Descrição',
        'Montante',
        ...(withBalance ? ['Saldo Contabilistico'] : []),
        'Moeda',
        'Notas',
        'Tratado',
      ]);
      sheet.addRow([
        '07/10/2026',
        '06/10/2026',
        'Contribuinte Exemplo',
        12.35,
        ...(withBalance ? [200] : []),
        'EUR',
        '',
        'Não',
      ]);
      const result = await upload(
        f.accountId,
        Buffer.from(await book.xlsx.writeBuffer()),
        'millennium.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ).expect(201);
      expect(result.body.status).toBe('CONFIRMED');
      expect(await rows(result.body.id as string)).toHaveLength(1);
    }
    const ofx =
      'OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTRS><CURDEF>EUR<ACCTID>123456<BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261007120000<TRNAMT>-9.99<FITID>OFX123<NAME>Energia</STMTTRN></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>';
    const result = await upload(
      f.accountId,
      Buffer.from(ofx),
      'extrato.ofx',
      'application/x-ofx',
    ).expect(201);
    const t = await db.bankTransaction.findFirstOrThrow({
      where: { importId: result.body.id as string },
    });
    expect(t.direction).toBe('DEBIT');
    expect(t.amount.toFixed(2)).toBe('9.99');
    expect(t.bankIdentifier).toBe('OFX123');
    expect(t.date.toISOString().slice(0, 10)).toBe('2026-10-07');
  });
  it('rejects invalid files and accounts, records failed parsing and enforces financial privacy', async () => {
    const f = await fixture();
    await upload(
      f.accountId,
      Buffer.from(csv),
      'extrato.csv',
      'text/csv',
      normal,
    ).expect(403);
    await get('/banking/imports', reader).expect(403);
    await upload(
      f.accountId,
      Buffer.from(csv),
      'malware.exe',
      'application/octet-stream',
    ).expect(400);
    const bad = await upload(
      f.accountId,
      Buffer.from('date,description,amount\n2026-02-30,Invalid,10'),
    ).expect(201);
    expect(bad.body.status).toBe('FAILED');
    expect(bad.body.error).toContain('Linha 2');
    expect(
      await db.bankTransaction.count({
        where: { importId: bad.body.id as string },
      }),
    ).toBe(0);
    await post('/banking/imports/' + bad.body.id + '/confirm', {}).expect(409);
    await patch('/accounts/' + f.accountId, { account: '999' }).expect(200);
    const mismatch = await upload(
      f.accountId,
      Buffer.from(
        'date,description,amount,account\n2026-10-07,Outra conta,10.00,123',
      ),
    ).expect(201);
    expect(mismatch.body.status).toBe('FAILED');
    expect(mismatch.body.error).toContain('conta bancária diferente');
  });
  it('links existing ledgers, prevents concurrent reconciliation and keeps manual entries when undoing', async () => {
    const f = await fixture();
    const imported = (
      await upload(
        f.accountId,
        Buffer.from(
          'date,description,amount,reference\n2026-10-07,Manual,5.00,M1',
        ),
      ).expect(201)
    ).body as { id: string };
    const t = (await rows(imported.id))[0]!;
    await post('/banking/classify', {
      ids: [t.id],
      classification: 'INCOME',
      categoryId: f.incomeCategoryId,
    }).expect(201);
    await post('/banking/imports/' + imported.id + '/confirm', {}).expect(201);
    await post('/banking/undo', {
      ids: [t.id],
      reason: 'Legacy existing-ledger compatibility',
    }).expect(201);
    const income = (
      await post('/incomes', {
        amount: '5',
        date: '2026-10-07',
        accountId: f.accountId,
        categoryId: f.incomeCategoryId,
        description: 'Manual',
        origin: 'Manual',
        status: 'COMPLETED',
      }).expect(201)
    ).body as { id: string };
    const results = await Promise.all([
      post('/banking/reconcile', { ids: [t.id], incomeId: income.id }),
      post('/banking/reconcile', { ids: [t.id], incomeId: income.id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    await post('/banking/undo', { ids: [t.id], reason: 'Desvincular' }).expect(
      201,
    );
    const restored = await db.income.findUniqueOrThrow({
      where: { id: income.id },
    });
    expect(restored.status).toBe('COMPLETED');
    expect(restored.bankTransactionId).toBeNull();
    expect(
      await db.bankReconciliation.count({
        where: { incomeId: income.id, active: false },
      }),
    ).toBe(1);
  });
  it('rolls batch classification back if any selected row is invalid', async () => {
    const f = await fixture();
    const i = (await upload(f.accountId, Buffer.from(csv)).expect(201))
      .body as { id: string };
    const transactions = await rows(i.id);
    await post('/banking/classify', {
      ids: transactions.map((t) => t.id),
      classification: 'INCOME',
      categoryId: f.incomeCategoryId,
    }).expect(400);
    expect((await rows(i.id)).every((t) => t.status === 'RECONCILED')).toBe(
      true,
    );
    const prisma = app.get(PrismaService),
      original = prisma.$transaction.bind(prisma);
    const spy = jest.spyOn(prisma, '$transaction').mockImplementation((async (
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) =>
      original(async (tx) => {
        const audit = jest
          .spyOn(tx.auditLog, 'create')
          .mockRejectedValue(new Error('bank audit failure'));
        try {
          return await callback(tx);
        } finally {
          audit.mockRestore();
        }
      })) as typeof prisma.$transaction);
    try {
      await post('/banking/classify', {
        ids: [transactions.find((t) => t.direction === 'CREDIT')!.id],
        classification: 'INCOME',
        categoryId: f.incomeCategoryId,
      }).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect((await rows(i.id)).every((t) => t.status === 'RECONCILED')).toBe(
      true,
    );
  });
});
