import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Prisma, PrismaClient } from '@prisma/client';
import { PERMISSIONS } from '@church/shared';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DAY_MS } from '../src/modules/library/library.policy';

// Mandatory integration suite: missing database configuration is a failure, not a skip.
describe('Library HTTP (isolated real PostgreSQL)', () => {
  const schema = `library_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication;
  let db: PrismaClient;
  let token: string;
  let normal: string;
  let reader: string;
  let actor: string;
  let auditStart: Date;
  const countAudits = (args: Prisma.AuditLogCountArgs) =>
    db.auditLog.count({
      ...args,
      where: { ...args.where, createdAt: { gte: auditStart } },
    });
  const defaults = {
    defaultLoanDays: 14,
    maxBooks: 3,
    maxRenewals: 2,
    graceDays: 0,
    dailyFine: '0.10',
    blockOverdue: true,
    holdDays: 2,
    reservationDays: 30,
  };

  const get = (path: string, auth = token) =>
    request(app.getHttpServer())
      .get(`/api/v1/library${path}`)
      .auth(auth, { type: 'bearer' });
  const post = (path: string, body: object = {}, auth = token) =>
    request(app.getHttpServer())
      .post(`/api/v1/library${path}`)
      .auth(auth, { type: 'bearer' })
      .send(body);
  const patch = (path: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/v1/library${path}`)
      .auth(token, { type: 'bearer' })
      .send(body);
  const member = (status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE') =>
    db.member.create({ data: { name: `Library ${randomUUID()}`, status } });
  async function bookCopy() {
    const book = (
      await post('/books', {
        title: 'Livro teste',
        author: 'Autora teste',
        category: 'Testes',
        isbn: randomUUID().slice(0, 32),
      }).expect(201)
    ).body as { id: string };
    const copy = (
      await post(`/books/${book.id}/copies`, {
        assetCode: randomUUID(),
        location: 'Estante 1',
      }).expect(201)
    ).body as { id: string; status: string };
    return { book, copy };
  }
  async function loanFixture(graceDays = 0) {
    await patch('/settings', { ...defaults, graceDays }).expect(200);
    const { book, copy } = await bookCopy();
    const m = await member();
    const loan = (
      await post('/loans', { memberId: m.id, bookCopyId: copy.id }).expect(201)
    ).body as { id: string; dueAt: string; createdBy: string };
    return { book, copy, m, loan };
  }
  async function age(id: string, days: number) {
    const due = new Date();
    due.setUTCDate(due.getUTCDate() - days);
    due.setUTCHours(12, 0, 0, 0);
    await db.loan.update({ where: { id }, data: { dueAt: due } });
  }
  async function fineFixture() {
    const f = await loanFixture();
    await age(f.loan.id, 4);
    await post(`/loans/${f.loan.id}/return`).expect(201);
    return {
      ...f,
      fine: await db.fine.findUniqueOrThrow({ where: { loanId: f.loan.id } }),
    };
  }

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL)
      throw new Error(
        'TEST_DATABASE_URL is required for library HTTP integration tests',
      );
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.JWT_ACCESS_SECRET = randomBytes(48).toString('hex');
    process.env.JWT_REFRESH_SECRET = randomBytes(48).toString('hex');
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: process.env, stdio: 'pipe' },
    );
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const mod = await Test.createTestingModule({ imports: [AppModule] })
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
    app = mod.createNestApplication();
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
      const email = `${randomUUID()}@library.example`;
      const password = 'Library-test-password-2026';
      const registered = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password, name: 'Library operator' })
        .expect(201);
      const id = registered.body.id as string;
      if (codes.length) {
        for (const code of codes)
          await db.permission.upsert({
            where: { code },
            create: { code },
            update: {},
          });
        const permissions = await db.permission.findMany({
          where: { code: { in: codes } },
        });
        const role = await db.role.create({
          data: {
            name: randomUUID(),
            permissions: {
              create: permissions.map((permission) => ({
                permissionId: permission.id,
              })),
            },
          },
        });
        await db.userRole.create({ data: { userId: id, roleId: role.id } });
      }
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      return { id, token: login.body.accessToken as string };
    }
    const operator = await user(
      PERMISSIONS.filter((code) => code.startsWith('LIBRARY_')),
    );
    token = operator.token;
    actor = operator.id;
    normal = (await user(['MEMBER_READ'])).token;
    reader = (await user(['LIBRARY_LOAN_READ'])).token;
  }, 60000);

  beforeEach(async () => {
    // This client is scoped only to this suite's randomly named schema.
    await db.finePayment.deleteMany();
    await db.fineAdjustment.deleteMany();
    await db.fine.deleteMany();
    await db.reservation.deleteMany();
    await db.loan.deleteMany();
    await db.bookCopy.deleteMany();
    await db.book.deleteMany();
    await db.member.deleteMany();

    await db.librarySettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...defaults },
      update: defaults,
    });
    auditStart = new Date();
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });

  it('stores full catalog/copy metadata, filters/paginates and protects existing history', async () => {
    const b = await post('/books', {
      title: 'Título completo',
      subtitle: 'Subtítulo',
      author: 'Uma autora',
      isbn: 'ISBN-test',
      publisher: 'Editora',
      edition: '2',
      year: 2026,
      language: 'pt',
      description: 'Descrição',
      pages: 123,
      cover: 'https://example.com/cover.png',
      category: 'História',
      keywords: ['ponte'],
    }).expect(201);
    const c = await post(`/books/${b.body.id}/copies`, {
      assetCode: 'A-1',
      barcode: 'BC-1',
      qrCode: 'QR-1',
      condition: 'NEW',
      location: 'Sala 1',
      acquiredAt: '2026-01-01T00:00:00Z',
      notes: 'Nova',
    }).expect(201);
    expect(c.body.status).toBe('AVAILABLE');
    const list = await get(
      '/books?search=ponte&author=autora&category=Hist%C3%B3ria&available=true&pageSize=1',
    ).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({
      quantity: 1,
      available: 1,
      pages: 123,
      subtitle: 'Subtítulo',
    });
    await patch(`/books/${b.body.id}`, { title: 'Editado' }).expect(200);
    await post('/books', {
      title: 'Duplicado',
      author: 'Outra',
      isbn: 'ISBN-test',
    }).expect(409);
    await request(app.getHttpServer())
      .delete(`/api/v1/library/books/${b.body.id}`)
      .auth(token, { type: 'bearer' })
      .expect(409);
    await get(`/books/${randomUUID()}`).expect(404);
    await post('/books', { title: '', author: 'Autora', unknown: true }).expect(
      400,
    );
    await get('/books?pageSize=101').expect(400);
    await post('/books', { title: 'Válido', author: '  ' }).expect(400);
    await patch(`/books/${b.body.id}`, { language: null }).expect(400);
    await patch(`/books/${b.body.id}`, { keywords: null }).expect(400);
    await patch(`/copies/${c.body.id}`, {
      condition: null,
      justification: 'Inválido',
    }).expect(400);
    await patch(`/books/${b.body.id}`, { subtitle: null, isbn: null }).expect(
      200,
    );
    expect(
      (await get(`/books/${b.body.id}`).expect(200)).body.subtitle,
    ).toBeNull();
  });

  it('allows exactly one concurrent loan per copy and returns exactly once with audit', async () => {
    const { copy } = await bookCopy();
    const a = await member();
    const b = await member();
    const responses = await Promise.all(
      [a, b].map((m) =>
        post('/loans', { memberId: m.id, bookCopyId: copy.id }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const loan = responses.find((r) => r.status === 201)!.body as {
      id: string;
      createdBy: string;
    };
    expect(loan.createdBy).toBe(actor);
    expect(await db.loan.count()).toBe(1);
    await patch(`/copies/${copy.id}`, {
      status: 'MAINTENANCE',
      justification: 'Conserto',
    }).expect(409);
    const returned = await post(`/loans/${loan.id}/return`).expect(201);
    expect(returned.body).toMatchObject({
      status: 'RETURNED',
      returnedBy: actor,
    });
    await post(`/loans/${loan.id}/return`).expect(409);
    expect(
      (await db.bookCopy.findUniqueOrThrow({ where: { id: copy.id } })).status,
    ).toBe('AVAILABLE');
    expect(
      await countAudits({
        where: { entityId: loan.id, action: 'LIBRARY_RETURN' },
      }),
    ).toBe(1);
  });

  it('serializes concurrent member limits across different copies', async () => {
    await patch('/settings', { ...defaults, maxBooks: 1 }).expect(200);
    const m = await member();
    const a = await bookCopy();
    const b = await bookCopy();
    const responses = await Promise.all(
      [a, b].map((f) =>
        post('/loans', { memberId: m.id, bookCopyId: f.copy.id }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('rolls back payment and balance if the transactional audit fails', async () => {
    const { fine } = await fineFixture();
    await db.$executeRaw`ALTER TABLE audit_logs ADD CONSTRAINT library_test_audit_failure CHECK (action <> 'LIBRARY_FINE_PAYMENT')`;
    try {
      await post(`/fines/${fine.id}/payments`, {
        amount: '0.10',
        idempotencyKey: randomUUID(),
      }).expect(500);
      expect(await db.finePayment.count()).toBe(0);
      expect(
        (
          await db.fine.findUniqueOrThrow({ where: { id: fine.id } })
        ).paidAmount.toFixed(2),
      ).toBe('0.00');
      expect(
        await countAudits({ where: { action: 'LIBRARY_FINE_PAYMENT' } }),
      ).toBe(0);
    } finally {
      await db.$executeRaw`ALTER TABLE audit_logs DROP CONSTRAINT library_test_audit_failure`;
    }
  });

  it('blocks maintenance/lost/disposed, inactive members and records copy history', async () => {
    const { copy } = await bookCopy();
    const m = await member();
    for (const status of ['MAINTENANCE', 'LOST', 'DISPOSED']) {
      await patch(`/copies/${copy.id}`, {
        status,
        justification: 'Estado verificado',
      }).expect(200);
      await post('/loans', { memberId: m.id, bookCopyId: copy.id }).expect(409);
    }
    await patch(`/copies/${copy.id}`, {
      status: 'AVAILABLE',
      justification: 'Recuperado',
    }).expect(200);
    const inactive = await member('INACTIVE');
    await post('/loans', { memberId: inactive.id, bookCopyId: copy.id }).expect(
      409,
    );
    const history = await get(`/copies/${copy.id}/history`).expect(200);
    expect(
      history.body.events.filter(
        (e: { action: string }) => e.action === 'LIBRARY_COPY_UPDATE',
      ),
    ).toHaveLength(4);
    await patch(`/copies/${copy.id}`, {
      status: 'LOANED',
      justification: 'Forçar',
    }).expect(400);
  });

  it('snapshots grace/rate, accrues once per UTC day, blocks overdue and freezes on return', async () => {
    const f = await loanFixture(2);
    await age(f.loan.id, 2);
    expect((await get('/loans').expect(200)).body.items[0].status).toBe(
      'ACTIVE',
    );
    expect(await db.fine.count()).toBe(0);
    await age(f.loan.id, 4);
    await patch('/settings', {
      ...defaults,
      graceDays: 10,
      dailyFine: '99.00',
    }).expect(200);
    await get('/loans').expect(200);
    let fine = await db.fine.findUniqueOrThrow({
      where: { loanId: f.loan.id },
    });
    expect(fine.amount.toFixed(2)).toBe('0.20');
    await get('/fines').expect(200);
    expect(
      await countAudits({ where: { action: 'LIBRARY_FINE_ACCRUE' } }),
    ).toBe(1);
    const second = await bookCopy();
    await post('/loans', {
      memberId: f.m.id,
      bookCopyId: second.copy.id,
    }).expect(409);
    await post(`/loans/${f.loan.id}/renew`).expect(409);
    await post(`/loans/${f.loan.id}/return`).expect(201);
    await age(f.loan.id, 20);
    await get('/fines').expect(200);
    fine = await db.fine.findUniqueOrThrow({ where: { loanId: f.loan.id } });
    expect(fine.amount.toFixed(2)).toBe('0.20');
  });

  it('allows borrowing overdue when the setting explicitly disables blocking', async () => {
    const f = await loanFixture();
    await age(f.loan.id, 1);
    await patch('/settings', { ...defaults, blockOverdue: false }).expect(200);
    const second = await bookCopy();
    await post('/loans', {
      memberId: f.m.id,
      bookCopyId: second.copy.id,
    }).expect(201);
  });

  it('renews from current due date, enforces limits and waiting reservation priority', async () => {
    const f = await loanFixture();
    const renewed = await post(`/loans/${f.loan.id}/renew`).expect(201);
    expect(
      new Date(renewed.body.dueAt as string).getTime() -
        new Date(f.loan.dueAt).getTime(),
    ).toBe(14 * DAY_MS);
    await post(`/loans/${f.loan.id}/renew`).expect(201);
    await post(`/loans/${f.loan.id}/renew`).expect(409);
    const second = await loanFixture();
    const waiter = await member();
    await post('/reservations', {
      bookId: second.book.id,
      memberId: waiter.id,
    }).expect(201);
    await post(`/loans/${second.loan.id}/renew`).expect(409);
    await post(`/loans/${second.loan.id}/return`).expect(201);
    await post(`/loans/${second.loan.id}/renew`).expect(409);
  });

  it('handles partial payments, idempotent double-payment and concurrent balance limits', async () => {
    const { fine } = await fineFixture();
    const key = randomUUID();
    const results = await Promise.all(
      [1, 2].map(() =>
        post(`/fines/${fine.id}/payments`, {
          amount: '0.10',
          idempotencyKey: key,
        }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0]!.body.id).toBe(results[1]!.body.id);
    expect(await db.finePayment.count()).toBe(1);
    expect(
      (
        await db.fine.findUniqueOrThrow({ where: { id: fine.id } })
      ).paidAmount.toFixed(2),
    ).toBe('0.10');
    await post(`/fines/${fine.id}/payments`, {
      amount: '0.11',
      idempotencyKey: key,
    }).expect(409);
    await post(`/fines/${fine.id}/payments`, {
      amount: '-1',
      idempotencyKey: randomUUID(),
    }).expect(400);
    const attempts = await Promise.all(
      [1, 2].map(() =>
        post(`/fines/${fine.id}/payments`, {
          amount: '0.30',
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    expect(attempts.map((r) => r.status).sort()).toEqual([201, 409]);
    const paid = await db.fine.findUniqueOrThrow({ where: { id: fine.id } });
    expect(paid.status).toBe('PAID');
    expect(paid.paidAmount.toFixed(2)).toBe('0.40');
    expect(
      await countAudits({
        where: { entityId: fine.id, action: 'LIBRARY_FINE_PAYMENT' },
      }),
    ).toBe(2);
  });

  it('requires justification, discounts only balance and preserves paid money on forgiveness/cancellation', async () => {
    const { fine } = await fineFixture();
    await post(`/fines/${fine.id}/payments`, {
      amount: '0.10',
      idempotencyKey: randomUUID(),
    }).expect(201);
    await post(`/fines/${fine.id}/adjustments`, {
      kind: 'DISCOUNT',
      amount: '0.10',
      justification: ' ',
    }).expect(400);
    await post(`/fines/${fine.id}/adjustments`, {
      kind: 'DISCOUNT',
      amount: '0.31',
      justification: 'Excesso',
    }).expect(400);
    await post(`/fines/${fine.id}/adjustments`, {
      kind: 'DISCOUNT',
      amount: '0.10',
      justification: 'Acordo',
    }).expect(201);
    const forgiven = await post(`/fines/${fine.id}/adjustments`, {
      kind: 'FORGIVE',
      justification: 'Aprovado',
    }).expect(201);
    expect(forgiven.body).toMatchObject({
      status: 'FORGIVEN',
      paidAmount: '0.1',
      discount: '0.3',
    });
    expect(forgiven.body.adjustments).toHaveLength(2);
    await post(`/fines/${fine.id}/payments`, {
      amount: '0.01',
      idempotencyKey: randomUUID(),
    }).expect(409);
    await post(`/fines/${fine.id}/adjustments`, {
      kind: 'CANCEL',
      justification: 'Outra',
    }).expect(409);
    const second = await fineFixture();
    await post(`/fines/${second.fine.id}/adjustments`, {
      kind: 'CANCEL',
      justification: 'Erro de operação',
    }).expect(201);
    expect(
      (await db.fine.findUniqueOrThrow({ where: { id: second.fine.id } }))
        .status,
    ).toBe('CANCELLED');
    expect(
      await countAudits({ where: { action: 'LIBRARY_FINE_ADJUST' } }),
    ).toBe(3);
  });

  it('reopens a paid active fine as days accrue but never reopens forgiven/cancelled fines', async () => {
    const f = await loanFixture();
    await age(f.loan.id, 1);
    await get('/fines').expect(200);
    const fine = await db.fine.findUniqueOrThrow({
      where: { loanId: f.loan.id },
    });
    await post(`/fines/${fine.id}/payments`, {
      amount: '0.10',
      idempotencyKey: randomUUID(),
    }).expect(201);
    await age(f.loan.id, 2);
    await get('/fines').expect(200);
    expect(
      (await db.fine.findUniqueOrThrow({ where: { id: fine.id } })).status,
    ).toBe('OPEN');
    await post(`/fines/${fine.id}/adjustments`, {
      kind: 'FORGIVE',
      justification: 'Exceção integral',
    }).expect(201);
    await age(f.loan.id, 8);
    await get('/fines').expect(200);
    expect(
      (
        await db.fine.findUniqueOrThrow({ where: { id: fine.id } })
      ).amount.toFixed(2),
    ).toBe('0.20');
  });

  it('promotes FIFO on return/cancel/expiry and only the held member may borrow', async () => {
    const f = await loanFixture();
    const a = await member();
    const b = await member();
    const c = await member();
    const reservations: { id: string }[] = [];
    for (const m of [a, b, c]) {
      reservations.push(
        (
          await post('/reservations', {
            memberId: m.id,
            bookId: f.book.id,
          }).expect(201)
        ).body as { id: string },
      );
    }
    await post('/reservations', { memberId: a.id, bookId: f.book.id }).expect(
      409,
    );
    await post(`/loans/${f.loan.id}/return`).expect(201);
    expect(
      (
        await db.reservation.findUniqueOrThrow({
          where: { id: reservations[0]!.id },
        })
      ).status,
    ).toBe('READY');
    await post('/loans', { memberId: b.id, bookCopyId: f.copy.id }).expect(409);
    await patch(`/copies/${f.copy.id}`, {
      status: 'MAINTENANCE',
      justification: 'Conserto',
    }).expect(409);
    await post(`/reservations/${reservations[0]!.id}/cancel`).expect(201);
    expect(
      (
        await db.reservation.findUniqueOrThrow({
          where: { id: reservations[1]!.id },
        })
      ).status,
    ).toBe('READY');
    await db.reservation.update({
      where: { id: reservations[1]!.id },
      data: { holdUntil: new Date(Date.now() - 1000) },
    });
    await get('/reservations').expect(200);
    expect(
      (
        await db.reservation.findUniqueOrThrow({
          where: { id: reservations[1]!.id },
        })
      ).status,
    ).toBe('EXPIRED');
    expect(
      (
        await db.reservation.findUniqueOrThrow({
          where: { id: reservations[2]!.id },
        })
      ).status,
    ).toBe('READY');
    await post('/loans', { memberId: c.id, bookCopyId: f.copy.id }).expect(201);
    expect(
      (
        await db.reservation.findUniqueOrThrow({
          where: { id: reservations[2]!.id },
        })
      ).status,
    ).toBe('FULFILLED');
    await post(`/reservations/${reservations[2]!.id}/cancel`).expect(409);
  });

  it('expires waiting reservations and allocates newly acquired/recovered copies', async () => {
    const f = await loanFixture();
    const a = await member();
    const b = await member();
    const expired = await post('/reservations', {
      memberId: a.id,
      bookId: f.book.id,
    }).expect(201);
    const waiting = await post('/reservations', {
      memberId: b.id,
      bookId: f.book.id,
    }).expect(201);
    await db.reservation.update({
      where: { id: expired.body.id as string },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const newCopy = await post(`/books/${f.book.id}/copies`, {
      assetCode: randomUUID(),
      location: 'Estante 2',
    }).expect(201);
    expect(newCopy.body.status).toBe('RESERVED');
    const ready = await db.reservation.findUniqueOrThrow({
      where: { id: waiting.body.id as string },
    });
    expect(ready.memberId).toBe(b.id);
    expect(
      (
        await db.reservation.findUniqueOrThrow({
          where: { id: expired.body.id as string },
        })
      ).status,
    ).toBe('EXPIRED');
    const inactive = await member('INACTIVE');
    await post('/reservations', {
      memberId: inactive.id,
      bookId: f.book.id,
    }).expect(409);
  });

  it('records lost/cancelled loans and releases only cancelled copies', async () => {
    const f = await loanFixture();
    await post(`/loans/${f.loan.id}/close`, {
      status: 'LOST',
      justification: 'Extraviado',
    }).expect(201);
    expect(
      (await db.bookCopy.findUniqueOrThrow({ where: { id: f.copy.id } }))
        .status,
    ).toBe('LOST');
    const second = await loanFixture();
    await post(`/loans/${second.loan.id}/close`, {
      status: 'CANCELLED',
      justification: 'Cadastro incorreto',
    }).expect(201);
    expect(
      (await db.bookCopy.findUniqueOrThrow({ where: { id: second.copy.id } }))
        .status,
    ).toBe('AVAILABLE');
  });

  it('requires separate permissions and prevents MEMBER_READ horizontal history exposure', async () => {
    const f = await fineFixture();
    for (const path of [
      '/books',
      '/copies',
      '/loans',
      '/fines',
      '/reservations',
      '/settings',
      '/dashboard',
      '/members',
      `/members/${f.m.id}/history`,
      `/copies/${f.copy.id}/history`,
    ])
      await get(path, normal).expect(403);
    await post(
      '/loans',
      { memberId: f.m.id, bookCopyId: f.copy.id },
      normal,
    ).expect(403);
    await post(`/loans/${f.loan.id}/return`, {}, normal).expect(403);
    await post(`/loans/${f.loan.id}/renew`, {}, normal).expect(403);
    await post(
      `/fines/${f.fine.id}/payments`,
      { amount: '0.10', idempotencyKey: randomUUID() },
      normal,
    ).expect(403);
    await post(
      `/fines/${f.fine.id}/adjustments`,
      { kind: 'FORGIVE', justification: 'Bypass' },
      normal,
    ).expect(403);
    const list = await get('/loans', reader).expect(200);
    expect(list.body.items[0].fine).toBeUndefined();
    await get(`/members/${f.m.id}/history`, reader).expect(403);
    const history = await get(`/members/${f.m.id}/history`).expect(200);
    expect(history.body.loans[0].fine.id).toBe(f.fine.id);
    const members = await get('/members').expect(200);
    expect(members.body.items[0].email).toBeUndefined();
    await request(app.getHttpServer()).get('/api/v1/library/books').expect(401);
  });

  it('returns exact dashboard aggregates and validates settings changes', async () => {
    const f = await loanFixture();
    await age(f.loan.id, 3);
    const other = await bookCopy();
    await post('/loans', {
      memberId: (await member()).id,
      bookCopyId: other.copy.id,
    }).expect(201);
    await post(`/loans/${f.loan.id}/return`).expect(201);
    const d = await get('/dashboard').expect(200);
    expect(d.body).toMatchObject({
      totalBooks: 2,
      totalCopies: 2,
      available: 1,
      loaned: 1,
      overdue: 0,
      pendingFines: '0.30',
    });
    expect(d.body.mostBorrowed).toHaveLength(2);
    await patch('/settings', { ...defaults, dailyFine: 1 }).expect(400);
    await patch('/settings', { ...defaults, maxBooks: 0 }).expect(400);
    await patch('/settings', { ...defaults, dailyFine: '0.001' }).expect(400);
    await patch('/settings', { ...defaults, maxRenewals: 0 }).expect(200);
    expect(
      await countAudits({ where: { action: 'LIBRARY_SETTINGS_UPDATE' } }),
    ).toBe(2);
  });

  it('reads defaults and deletes only books without attached records', async () => {
    const settings = await get('/settings').expect(200);
    expect(settings.body).toMatchObject({
      defaultLoanDays: 14,
      maxBooks: 3,
      dailyFine: '0.1',
    });
    const book = await post('/books', {
      title: 'Sem exemplares',
      author: 'Equipe',
    }).expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/library/books/${book.body.id}`)
      .auth(token, { type: 'bearer' })
      .expect(204);
    await get(`/books/${book.body.id}`).expect(404);
    expect(
      await countAudits({ where: { action: 'LIBRARY_BOOK_DELETE' } }),
    ).toBe(1);
    const { copy } = await bookCopy();
    await post('/loans', {
      memberId: randomUUID(),
      bookCopyId: copy.id,
    }).expect(404);
  });

  it('rejects renewal for inactive members or other overdue loans and double closure', async () => {
    const first = await loanFixture();
    const second = await bookCopy();
    const secondLoan = await post('/loans', {
      memberId: first.m.id,
      bookCopyId: second.copy.id,
    }).expect(201);
    await age(first.loan.id, 1);
    await post(`/loans/${secondLoan.body.id}/renew`).expect(409);
    await post(`/loans/${first.loan.id}/return`).expect(201);
    await db.member.update({
      where: { id: first.m.id },
      data: { status: 'INACTIVE' },
    });
    await post(`/loans/${secondLoan.body.id}/renew`).expect(409);
    await post(`/loans/${secondLoan.body.id}/close`, {
      status: 'CANCELLED',
      justification: 'Duplicação',
    }).expect(201);
    await post(`/loans/${secondLoan.body.id}/close`, {
      status: 'CANCELLED',
      justification: 'Repetição',
    }).expect(409);
  });

  it('supports full balance discounts and rejects missing values or amounts on forgiveness', async () => {
    const { fine } = await fineFixture();
    await post(`/fines/${fine.id}/adjustments`, {
      kind: 'DISCOUNT',
      justification: 'Sem valor',
    }).expect(400);
    await post(`/fines/${fine.id}/adjustments`, {
      kind: 'FORGIVE',
      amount: '0.10',
      justification: 'Valor proibido',
    }).expect(400);
    const discount = await post(`/fines/${fine.id}/adjustments`, {
      kind: 'DISCOUNT',
      amount: '0.40',
      justification: 'Abatimento integral',
    }).expect(201);
    expect(discount.body.status).toBe('PAID');
    expect(discount.body.discount).toBe('0.4');
    await post(`/fines/${randomUUID()}/payments`, {
      amount: '0.10',
      idempotencyKey: randomUUID(),
    }).expect(404);
  });

  it('filters copy, loan, fine and reservation pages by member/book/status without exposing other records', async () => {
    const first = await fineFixture();
    const second = await bookCopy();
    await post('/reservations', {
      memberId: first.m.id,
      bookId: first.book.id,
    }).expect(201);
    const copies = await get(
      `/copies?bookId=${first.book.id}&status=RESERVED&search=Estante&pageSize=1`,
    ).expect(200);
    expect(copies.body.total).toBe(1);
    const loans = await get(
      `/loans?memberId=${first.m.id}&bookId=${first.book.id}&status=RETURNED`,
    ).expect(200);
    expect(loans.body.total).toBe(1);
    const fines = await get(
      `/fines?memberId=${first.m.id}&bookId=${second.book.id}`,
    ).expect(200);
    expect(fines.body.total).toBe(0);
    const reservations = await get(
      `/reservations?memberId=${first.m.id}&bookId=${first.book.id}`,
    ).expect(200);
    expect(reservations.body.total).toBe(1);
    const unavailable = await get('/books?available=false').expect(200);
    expect(unavailable.body.total).toBe(1);
    const members = await get(
      `/members?search=${encodeURIComponent(first.m.name)}`,
    ).expect(200);
    expect(members.body.total).toBe(1);
  });
});
