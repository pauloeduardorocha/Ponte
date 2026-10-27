import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { CurrentUser } from '@church/shared';
import type { Notification } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DatabaseModule } from '../../database/database.module';
import { PrismaService } from '../../database/prisma.service';
import { PermissionGuard } from '../auth/permission.guard';
import { OperationsModule } from './operations.controller';
import { notificationDeliveryMock } from '../../../test/fixtures/notification-delivery-mock';

const memberId = '63b80123-eefa-4f48-a877-6cfdcdd4b724';
const visitorId = '73b80123-eefa-4f48-a877-6cfdcdd4b724';
const secondMemberId = '83b80123-eefa-4f48-a877-6cfdcdd4b724';
const payload = {
  channel: 'EMAIL',
  subject: 'Aviso',
  content: 'Olá <script>alert(1)</script> & amigos\nSegunda linha',
};

describe('Email notifications HTTP flow (real providers, mocked Bird and database)', () => {
  let app: INestApplication;
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let user: CurrentUser;
  const records = new Map<string, Notification>();
  const db = {
    notificationDelivery: notificationDeliveryMock(),
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn() },
    member: { findFirst: jest.fn() },
    visitor: { findFirst: jest.fn() },
    notification: {
      create: jest.fn(),
      createManyAndReturn: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  async function application(key = 'bk_eu1_test-key') {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        DatabaseModule,
        OperationsModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
    })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ BIRD_API_KEY: key }))
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    const instance = module.createNestApplication();
    instance.use(
      (req: { user: CurrentUser }, _res: unknown, next: () => void) => {
        req.user = user;
        next();
      },
    );
    instance.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await instance.init();
    return instance;
  }

  beforeAll(async () => {
    app = await application();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    records.clear();
    db.notificationDelivery.reset();
    db.$queryRaw.mockImplementation(async () => [{ now: new Date() }]);
    user = {
      id: memberId,
      permissions: ['NOTIFICATION_SEND', 'OPERATION_SCOPE_ALL'],
    } as CurrentUser;
    db.$transaction.mockImplementation(async (fn) => fn(db));
    db.member.findFirst.mockResolvedValue({
      id: memberId,
      email: 'member@example.org',
    });
    db.visitor.findFirst.mockResolvedValue({
      id: visitorId,
      email: 'visitor@example.org',
      memberId: null,
    });
    db.user.findUnique.mockResolvedValue({ memberId });
    const store = (data: Notification) => {
      const row = { ...data, id: randomUUID(), status: 'PENDING' };
      records.set(row.id, row);
      return row;
    };
    db.notification.create.mockImplementation(async ({ data }) => store(data));
    db.notification.createManyAndReturn.mockImplementation(async ({ data }) =>
      data.map(store).map((n: Notification) => ({ id: n.id })),
    );
    db.notification.findFirst.mockImplementation(async ({ where }) => {
      const row = records.get(where.id);
      return !where.createdByUserId ||
        row?.createdByUserId === where.createdByUserId
        ? row
        : null;
    });
    db.notification.update.mockImplementation(async ({ where, data }) => {
      const row = { ...records.get(where.id), ...data } as Notification;
      records.set(where.id, row);
      return row;
    });
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(null, { status: 202 }));
  });
  afterEach(() => jest.restoreAllMocks());

  it('sends a private email through the module wiring and records acceptance', async () => {
    const result = await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...payload, recipientMemberId: memberId })
      .expect(201);
    expect(result.body).toMatchObject({ status: 'SENT', error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://eu1.platform.bird.com/v1/email/messages');
    expect(init?.headers).toMatchObject({
      'Idempotency-Key': `notification-${result.body.id}`,
    });
    const sent = JSON.parse(init?.body as string);
    expect(sent).toMatchObject({
      from: { email: 'noreply@igrejaponte.com' },
      to: ['member@example.org'],
      subject: 'Aviso',
      text: payload.content,
      category: 'marketing',
      html: '<p>Olá &lt;script&gt;alert(1)&lt;/script&gt; &amp; amigos<br>Segunda linha</p>',
      track_clicks: false,
      track_opens: false,
    });
    expect(sent).not.toHaveProperty('cc');
    expect(sent).not.toHaveProperty('bcc');
    expect(db.member.findFirst).toHaveBeenLastCalledWith({
      where: { id: memberId, status: 'ACTIVE', anonymizedAt: null },
      select: { email: true },
    });
    await request(app.getHttpServer())
      .post(`/operations/notifications/${result.body.id}/send`)
      .expect(409);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reuses the exact serialized Bird body and stable key after a lost response', async () => {
    fetchMock.mockRejectedValueOnce(new Error('simulated lost response'));
    const created = await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...payload, recipientMemberId: memberId })
      .expect(201);
    expect(created.body.status).toBe('PENDING');
    await db.notificationDelivery.update({
      where: { notificationId: created.body.id },
      data: { availableAt: new Date(0) },
    });
    const result = await request(app.getHttpServer())
      .post(`/operations/notifications/${created.body.id}/send`)
      .expect(201);
    expect(result.body.status).toBe('SENT');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0]![1]!;
    const retry = fetchMock.mock.calls[1]![1]!;
    expect(typeof first.body).toBe('string');
    expect(retry.body).toBe(first.body);
    expect(retry.headers).toEqual(first.headers);
  });

  it('requires reconciliation if the Bird credential changes during an uncertain delivery', async () => {
    fetchMock.mockRejectedValueOnce(new Error('simulated lost response'));
    const created = await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...payload, recipientMemberId: memberId })
      .expect(201);
    const row = await db.notificationDelivery.findUniqueOrThrow({
      where: { notificationId: created.body.id },
    });
    expect(JSON.stringify(row.payload)).not.toContain('bk_eu1_test-key');
    await db.notificationDelivery.update({
      where: { notificationId: created.body.id },
      data: { availableAt: new Date(0) },
    });
    const rotated = await application('bk_eu1_other-workspace');
    try {
      const result = await request(rotated.getHttpServer())
        .post(`/operations/notifications/${created.body.id}/send`)
        .expect(201);
      expect(result.body.status).toBe('FAILED');
      expect(result.body.error).toContain('sem confirmação');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await rotated.close();
    }
  });

  it.each([
    [
      { id: visitorId, email: 'visitor@example.org', memberId: null },
      'visitor@example.org',
    ],
    [
      {
        id: visitorId,
        email: 'old@example.org',
        memberId,
        member: { email: 'current@example.org' },
      },
      'current@example.org',
    ],
  ])(
    'resolves visitor email without using an obsolete converted address',
    async (visitor, address) => {
      db.visitor.findFirst.mockResolvedValue(visitor);
      await request(app.getHttpServer())
        .post('/operations/notifications')
        .send({ ...payload, recipientVisitorId: visitorId, subject: '  ' })
        .expect(201);
      expect(
        JSON.parse(fetchMock.mock.calls[0]![1]?.body as string),
      ).toMatchObject({
        to: [address],
        subject: 'Notificação — Igreja Ponte',
      });
      expect(db.visitor.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            id: visitorId,
            OR: [
              { memberId: null },
              { member: { status: 'ACTIVE', anonymizedAt: null } },
            ],
          },
        }),
      );
    },
  );

  it.each([null, '', 'invalid-email', 'sememail+abc@aponte.pt'])(
    'records a generic failure without calling Bird for an unavailable email (%s)',
    async (email) => {
      db.member.findFirst.mockResolvedValue({ id: memberId, email });
      const result = await request(app.getHttpServer())
        .post('/operations/notifications')
        .send({ ...payload, recipientMemberId: memberId })
        .expect(201);
      expect(result.body).toMatchObject({
        status: 'FAILED',
        error: 'Falha no provedor de comunicação.',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rechecks recipient availability at send time and does not deliver to an inactive or anonymized member', async () => {
    const created = await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({
        ...payload,
        recipientMemberId: memberId,
        scheduledAt: '2000-01-01T00:00:00Z',
      })
      .expect(201);
    db.member.findFirst.mockResolvedValue(null);
    const sent = await request(app.getHttpServer())
      .post(`/operations/notifications/${created.body.id}/send`)
      .expect(201);
    expect(sent.body.status).toBe('FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports partial delivery without exposing recipient addresses in provider failures', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('private provider details', { status: 429 }),
    );
    const result = await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...payload, recipientMemberIds: [memberId, secondMemberId] })
      .expect(201);
    expect(result.body).toEqual({
      total: 2,
      sent: 1,
      failed: 0,
      pending: 1,
      status: 'PARTIAL',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      [...records.values()].find((n) => n.status === 'PENDING')?.error,
    ).toBe('Falha no provedor de comunicação.');
    const keys = fetchMock.mock.calls.map(
      ([, init]) =>
        (init?.headers as Record<string, string>)['Idempotency-Key'],
    );
    expect(new Set(keys).size).toBe(2);
  });

  it('keeps scheduled messages pending, enforces the date and permits cancellation without sending', async () => {
    const result = await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({
        ...payload,
        recipientMemberId: memberId,
        scheduledAt: '2099-01-01T00:00:00Z',
      })
      .expect(201);
    expect(result.body.status).toBe('PENDING');
    await request(app.getHttpServer())
      .post(`/operations/notifications/${result.body.id}/send`)
      .expect(409);
    const cancelled = await request(app.getHttpServer())
      .post(`/operations/notifications/${result.body.id}/cancel`)
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires permission and rejects client-supplied email addresses', async () => {
    user.permissions = [];
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({ ...payload, recipientMemberId: memberId })
      .expect(403);
    user.permissions = ['NOTIFICATION_SEND', 'OPERATION_SCOPE_ALL'];
    await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({
        ...payload,
        recipientMemberId: memberId,
        email: 'arbitrary@example.org',
      })
      .expect(400);
    expect(records.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not let a sender dispatch someone else’s pending notification', async () => {
    const created = await request(app.getHttpServer())
      .post('/operations/notifications')
      .send({
        ...payload,
        recipientMemberId: memberId,
        scheduledAt: '2000-01-01T00:00:00Z',
      })
      .expect(201);
    user = { ...user, id: visitorId, permissions: ['NOTIFICATION_SEND'] };
    await request(app.getHttpServer())
      .post(`/operations/notifications/${created.body.id}/send`)
      .expect(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses immediate EMAIL before creating records when Bird is not configured', async () => {
    const unconfigured = await application('');
    try {
      await request(unconfigured.getHttpServer())
        .post('/operations/notifications')
        .send({ ...payload, recipientMemberId: memberId })
        .expect(409);
      expect(records.size).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await unconfigured.close();
    }
  });
});
