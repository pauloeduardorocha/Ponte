import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { CurrentUser } from '@church/shared';
import { execFileSync } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import * as webPush from 'web-push';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { DatabaseModule } from '../src/database/database.module';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthGuard } from '../src/modules/auth/auth.guard';
import { PermissionGuard } from '../src/modules/auth/permission.guard';
import { OperationsModule } from '../src/modules/operations/operations.controller';
import { EventsService } from '../src/modules/events/events.service';
import { OperationsService } from '../src/modules/operations/operations.service';
import { PushService } from '../src/modules/operations/push.service';

jest.mock('web-push', () => ({
  ...jest.requireActual('web-push'),
  sendNotification: jest.fn(),
}));

// Deliberately require a disposable database: this test applies all migrations to public.
describe('Notifications on disposable PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let own: CurrentUser, other: CurrentUser;
  let memberId: string, otherMemberId: string;
  let messageId: string, otherMessageId: string;
  const endpoint = 'https://fcm.googleapis.com/fcm/send/e2e';
  const browserKey = createECDH('prime256v1');
  browserKey.generateKeys();
  const subscription = {
    endpoint,
    keys: {
      p256dh: browserKey.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
  const call = (
    method: 'get' | 'post' | 'delete',
    path: string,
    body?: object,
    token = 'own',
  ) => {
    const server = request(app.getHttpServer());
    return server[method](`/api/v1/operations${path}`)
      .auth(token, { type: 'bearer' })
      .send(body ?? {});
  };
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/^\/ponte_push_test_[a-f0-9]+$/.test(new URL(url).pathname))
      throw new Error(
        'TEST_DATABASE_URL must name a disposable ponte_push_test_<hex> database.',
      );
    process.env.DATABASE_URL = url;
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      { env: process.env, stdio: 'pipe' },
    );
    db = new PrismaClient({ datasources: { db: { url } } });
    for (const name of ['own', 'other'])
      await db.user.create({
        data: {
          name,
          email: `${name}@notification.example`,
          passwordHash: 'unused-in-isolated-test',
          status: 'ACTIVE',
        },
      });
    const users = await db.user.findMany({ orderBy: { name: 'asc' } });
    const otherRow = users.find((u) => u.name === 'other')!;
    const ownRow = users.find((u) => u.name === 'own')!;
    own = {
      id: ownRow.id,
      name: ownRow.name,
      email: ownRow.email,
      status: 'ACTIVE',
      permissions: ['OPERATION_SCOPE_ALL', 'NOTIFICATION_SEND'],
    };
    other = {
      ...own,
      id: otherRow.id,
      name: otherRow.name,
      email: otherRow.email,
      permissions: [],
    };
    memberId = ownRow.memberId!;
    otherMemberId = otherRow.memberId!;
    const vapid = webPush.generateVAPIDKeys();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              WEB_PUSH_PUBLIC_KEY: vapid.publicKey,
              WEB_PUSH_PRIVATE_KEY: vapid.privateKey,
              WEB_PUSH_SUBJECT: 'mailto:admin@example.org',
            }),
          ],
        }),
        DatabaseModule,
        OperationsModule,
      ],
      providers: [
        { provide: PrismaService, useValue: db },
        {
          provide: AuthService,
          useValue: {
            authenticate: async (token: string) => ({
              user: token === 'own' ? own : other,
              sessionId: 'session',
            }),
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
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
    messageId = (
      await db.notification.create({
        data: {
          recipientMemberId: memberId,
          createdByUserId: own.id,
          content: 'own-message',
          channel: 'INTERNAL',
          status: 'SENT',
          sentAt: new Date(),
        },
      })
    ).id;
    otherMessageId = (
      await db.notification.create({
        data: {
          recipientMemberId: otherMemberId,
          createdByUserId: own.id,
          content: 'private-other-message',
          channel: 'INTERNAL',
          status: 'SENT',
          sentAt: new Date(),
        },
      })
    ).id;
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
  });

  it('isolates inboxes, unread counts and idempotent read receipts in the database', async () => {
    const inbox = await call('get', '/inbox').expect(200);
    expect(inbox.body.items.map((n: { id: string }) => n.id)).toEqual([
      messageId,
    ]);
    expect(JSON.stringify(inbox.body)).not.toContain('private-other-message');
    await call('get', '/inbox/unread').expect(200, { count: 1 });
    await call('post', `/inbox/${otherMessageId}/read`).expect(404);
    await call('post', `/inbox/${messageId}/read`).expect(201, { count: 1 });
    await call('post', `/inbox/${messageId}/read`).expect(201, { count: 0 });
    await call('get', '/inbox/unread').expect(200, { count: 0 });
    await call('post', '/inbox/read-all').expect(201, { count: 0 });
    expect(
      (
        await db.notification.findUniqueOrThrow({
          where: { id: otherMessageId },
        })
      ).readAt,
    ).toBeNull();
  });
  it('persists subscriptions, prevents concurrent ownership changes and scopes removal', async () => {
    await call('post', '/push/subscriptions', subscription).expect(201);
    await call('post', '/push/subscriptions', subscription).expect(201);
    await call('post', '/push/subscriptions', subscription, 'other').expect(
      409,
    );
    await call('delete', '/push/subscriptions', { endpoint }, 'other').expect(
      200,
    );
    expect(
      await db.pushSubscription.count({ where: { endpoint, userId: own.id } }),
    ).toBe(1);
  });
  it('sends both INTERNAL and PUSH to the subscribed recipient and includes them in the inbox', async () => {
    const send = jest
      .mocked(webPush.sendNotification)
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    for (const channel of ['INTERNAL', 'PUSH']) {
      const created = await call('post', '/notifications', {
        recipientMemberId: memberId,
        content: `${channel}-message`,
        channel,
      }).expect(201);
      expect(created.body.status).toBe('SENT');
      expect(created.body.sentAt).toBeTruthy();
      await call('post', `/notifications/${created.body.id}/send`).expect(409);
    }
    expect(send).toHaveBeenCalledTimes(2);
    const inbox = await call('get', '/inbox').expect(200);
    expect(inbox.body.items).toHaveLength(3);
    await call('post', '/inbox/read-all').expect(201, { count: 2 });
  });
  it('keeps scheduled messages pending and prevents sending them before their date', async () => {
    const scheduledAt = new Date(Date.now() + 86400000).toISOString();
    const send = jest.mocked(webPush.sendNotification);
    send.mockClear();
    const created = await call('post', '/notifications', {
      recipientMemberId: memberId,
      channel: 'INTERNAL',
      content: 'Future message',
      scheduledAt,
    }).expect(201);
    expect(created.body).toMatchObject({
      status: 'PENDING',
      scheduledAt,
      sentAt: null,
    });
    await call('post', `/notifications/${created.body.id}/send`).expect(409);
    expect(send).not.toHaveBeenCalled();
    await call('delete', `/inbox/${created.body.id}`).expect(404);
  });
  it('rejects immediate channels without providers and persists delivery failures', async () => {
    const count = await db.notification.count();
    await call('post', '/notifications', {
      recipientMemberId: memberId,
      channel: 'EMAIL',
      content: 'Unsupported',
    }).expect(409);
    expect(await db.notification.count()).toBe(count);
    jest
      .mocked(webPush.sendNotification)
      .mockRejectedValue({ statusCode: 503 });
    const failed = await call('post', '/notifications', {
      recipientMemberId: memberId,
      channel: 'PUSH',
      content: 'Failed push',
    }).expect(201);
    expect(failed.body).toMatchObject({ status: 'FAILED', sentAt: null });
    await call('post', `/notifications/${failed.body.id}/send`).expect(409);
  });
  it('deletes only personal sent messages, updates unread counts and preserves the administrative history', async () => {
    const created = await call('post', '/notifications', {
      recipientMemberId: memberId,
      channel: 'INTERNAL',
      content: 'Remove me',
    }).expect(201);
    const unread = await call('get', '/inbox/unread').expect(200);
    await call('delete', `/inbox/${otherMessageId}`).expect(404);
    // The recipient needs no notification management permission to remove a message.
    const permissions = own.permissions;
    own.permissions = [];
    try {
      await call('delete', `/inbox/${created.body.id}`).expect(200, {
        count: 1,
      });
    } finally {
      own.permissions = permissions;
    }
    await call('get', '/inbox/unread').expect(200, {
      count: unread.body.count - 1,
    });
    const inbox = await call('get', '/inbox').expect(200);
    expect(inbox.body.items.map((n: { id: string }) => n.id)).not.toContain(
      created.body.id,
    );
    await call('post', `/inbox/${created.body.id}/read`).expect(404);
    await call('delete', `/inbox/${created.body.id}`).expect(404);
    await call('delete', `/inbox/${messageId}`).expect(200, { count: 1 });
    const row = await db.notification.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(row.inboxDeletedAt).toBeInstanceOf(Date);
    expect(row.status).toBe('SENT');
    expect(
      (
        await db.notification.findUniqueOrThrow({
          where: { id: otherMessageId },
        })
      ).inboxDeletedAt,
    ).toBeNull();
  });
  it('delivers event messages after commit and preserves them when push fails', async () => {
    const event = await db.communityEvent.create({
      data: {
        name: 'Notification event',
        location: 'Test location',
        startsAt: new Date(),
        createdByUserId: own.id,
      },
    });
    await db.eventRegistration.create({
      data: { eventId: event.id, memberId, communicationConsent: true },
    });
    jest
      .mocked(webPush.sendNotification)
      .mockRejectedValue({ statusCode: 410 });
    const operations = app.get(OperationsService);
    const events = new EventsService(
      db as PrismaService,
      operations,
      app.get(PushService),
    );
    expect(
      await events.notify(
        event.id,
        { subject: 'Event subject', content: 'Event-message' },
        own,
      ),
    ).toEqual({ count: 1 });
    expect(
      await db.notification.count({
        where: {
          subject: 'Event subject',
          status: 'SENT',
          recipientMemberId: memberId,
        },
      }),
    ).toBe(1);
    expect(await db.pushSubscription.count({ where: { endpoint } })).toBe(0);
  });
});
