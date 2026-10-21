import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createECDH, randomBytes } from 'node:crypto';
import { Notification } from '@prisma/client';
import { CurrentUser } from '@church/shared';
import request from 'supertest';
import * as webPush from 'web-push';
import { PrismaService } from '../../database/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { InternalNotificationProvider } from './notification.provider';
import { PushController } from './push.controller';
import {
  PushService,
  validatePushEndpoint,
  notificationPushPayload,
} from './push.service';

jest.mock('web-push', () => ({
  ...jest.requireActual('web-push'),
  sendNotification: jest.fn(),
}));

const user = {
  id: '63b80123-eefa-4f48-a877-6cfdcdd4b724',
  permissions: [],
} as unknown as CurrentUser;
const keys = webPush.generateVAPIDKeys();
const browserKey = createECDH('prime256v1');
browserKey.generateKeys();
const dto = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test',
  keys: {
    p256dh: browserKey.getPublicKey().toString('base64url'),
    auth: randomBytes(16).toString('base64url'),
  },
};
const message = {
  id: 'message',
  recipientMemberId: 'member',
  recipientVisitorId: null,
  channel: 'INTERNAL',
  status: 'PENDING',
  subject: 'Private subject',
  content: 'Private content',
} as Notification;

function setup() {
  const db = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    user: { findUnique: jest.fn().mockResolvedValue({ memberId: 'member' }) },
    visitor: {
      findUnique: jest.fn().mockResolvedValue({ memberId: 'member' }),
    },
    pushSubscription: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    notification: {
      count: jest.fn().mockResolvedValue(2),
      findFirst: jest.fn().mockResolvedValue(message),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ ...message, ...data }),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  db.$transaction.mockImplementation(async (fn) => fn(db));
  const config = new ConfigService({
    WEB_PUSH_PUBLIC_KEY: keys.publicKey,
    WEB_PUSH_PRIVATE_KEY: keys.privateKey,
    WEB_PUSH_SUBJECT: 'mailto:admin@example.org',
  });
  const push = new PushService(db as unknown as PrismaService, config);
  const operations = new OperationsService(
    db as unknown as PrismaService,
    [new InternalNotificationProvider()],
    push,
  );
  return { db, push, operations, config };
}

describe('Push delivery and ownership', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each([
    'http://fcm.googleapis.com/test',
    'https://127.0.0.1/private',
    'https://fcm.googleapis.com.evil.example/test',
    'https://user:password@web.push.apple.com/test',
    'https://web.push.apple.com:444/test',
    'not a url',
  ])('blocks unsafe endpoint %s', (value) => {
    expect(() => validatePushEndpoint(value)).toThrow();
  });
  it.each([
    'https://fcm.googleapis.com/test',
    'https://updates.push.services.mozilla.com/wpush/v2/test',
    'https://web.push.apple.com/test',
    'https://wns2-test.notify.windows.com/test',
  ])('accepts push service %s', (value) => {
    expect(() => validatePushEndpoint(value)).not.toThrow();
  });
  it('exposes only the public key and disables push without configuration', () => {
    const { push } = setup();
    expect(push.settings()).toEqual({
      enabled: true,
      publicKey: keys.publicKey,
    });
    expect(JSON.stringify(push.settings())).not.toContain(keys.privateKey);
    expect(
      new PushService(
        {} as PrismaService,
        new ConfigService({
          WEB_PUSH_PUBLIC_KEY: '',
          WEB_PUSH_PRIVATE_KEY: '',
          WEB_PUSH_SUBJECT: '',
        }),
      ).settings(),
    ).toEqual({ enabled: false, publicKey: null });
  });
  it('binds subscriptions to the session and refuses reassignment and device overflow', async () => {
    const { push, db } = setup();
    await expect(push.subscribe(user.id, dto)).resolves.toEqual({
      subscribed: true,
    });
    expect(db.pushSubscription.create).toHaveBeenCalledWith({
      data: { userId: user.id, endpoint: dto.endpoint, ...dto.keys },
    });
    db.pushSubscription.findUnique.mockResolvedValue({
      id: 'sub',
      userId: 'another-account',
    });
    await expect(push.subscribe(user.id, dto)).rejects.toThrow(
      'conta anterior',
    );
    expect(db.pushSubscription.update).not.toHaveBeenCalled();
    db.pushSubscription.findUnique.mockResolvedValue(null);
    db.pushSubscription.count.mockResolvedValue(10);
    await expect(push.subscribe(user.id, dto)).rejects.toThrow(
      '10 dispositivos',
    );
    await push.unsubscribe(user.id, dto.endpoint);
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id, endpoint: dto.endpoint },
    });
  });
  it('rejects invalid cryptographic keys before persisting a subscription', async () => {
    const { push, db } = setup();
    await expect(
      push.subscribe(user.id, {
        ...dto,
        keys: { ...dto.keys, p256dh: 'A'.repeat(87) },
      }),
    ).rejects.toThrow('Chaves push inválidas');
    expect(db.pushSubscription.create).not.toHaveBeenCalled();
  });
  it('sends the subject and message only to active recipient accounts and prunes expired endpoints', async () => {
    const { push, db } = setup();
    const subscription = {
      id: 'expired',
      endpoint: dto.endpoint,
      ...dto.keys,
      updatedAt: new Date(),
    };
    db.pushSubscription.findMany.mockResolvedValue([
      subscription,
      { ...subscription, id: 'valid' },
    ]);
    const send = jest
      .mocked(webPush.sendNotification)
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockResolvedValueOnce({ statusCode: 201, body: '', headers: {} });
    expect(await push.send(message)).toBe(1);
    expect(db.pushSubscription.findMany).toHaveBeenCalledWith({
      where: {
        user: { memberId: 'member', status: 'ACTIVE', deletedAt: null },
      },
    });
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: 'expired', updatedAt: subscription.updatedAt },
    });
    const payload = send.mock.calls[1]![1]!;
    expect(JSON.parse(payload as string)).toMatchObject({
      title: message.subject,
      body: message.content,
      url: '/inbox',
    });
  });
  it('uses the church name when no subject is provided', () => {
    expect(
      JSON.parse(notificationPushPayload({ ...message, subject: null })),
    ).toMatchObject({ title: 'A Ponte', body: message.content });
  });
  it.each(['😀'.repeat(2000), '\n"\\'.repeat(1600)])(
    'bounds long message payloads by serialized UTF-8 bytes',
    (content) => {
      const serialized = notificationPushPayload({ ...message, content });
      const body = JSON.parse(serialized).body as string;
      expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThanOrEqual(3000);
      expect(body.endsWith('…')).toBe(true);
      expect(content.startsWith(body.slice(0, -1))).toBe(true);
      expect(JSON.parse(serialized).title).toBe(message.subject);
    },
  );
  it('resolves converted visitor recipients and does not broadcast unlinked visitors', async () => {
    const { push, db } = setup();
    const visitorMessage = {
      ...message,
      recipientMemberId: null,
      recipientVisitorId: 'visitor',
    };
    await push.send(visitorMessage);
    expect(db.visitor.findUnique).toHaveBeenCalledWith({
      where: { id: 'visitor' },
      select: { memberId: true },
    });
    db.visitor.findUnique.mockResolvedValue({ memberId: null });
    db.pushSubscription.findMany.mockClear();
    expect(await push.send(visitorMessage)).toBe(0);
    expect(db.pushSubscription.findMany).not.toHaveBeenCalled();
  });
  it('persists internal delivery before push and preserves it if push fails', async () => {
    const { push, db, operations } = setup();
    jest.spyOn(push, 'send').mockImplementation(async () => {
      expect(db.notification.update).toHaveBeenCalledWith({
        where: { id: 'message' },
        data: { status: 'SENT', sentAt: expect.any(Date), error: null },
      });
      throw new Error('upstream failed');
    });
    await expect(
      operations.notificationAction('message', user),
    ).resolves.toMatchObject({ status: 'SENT' });
  });
  it('scopes unread and read operations to sent personal messages and returns 404 for another recipient', async () => {
    const { db, operations } = setup();
    await operations.unread(user);
    expect(db.notification.count).toHaveBeenCalledWith({
      where: {
        channel: { in: ['INTERNAL', 'PUSH'] },
        status: 'SENT',
        readAt: null,
        OR: [
          { recipientMemberId: 'member' },
          { recipientVisitor: { memberId: 'member' } },
        ],
      },
    });
    await operations.readInbox(user, 'message');
    expect(db.notification.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'message',
        readAt: null,
        status: 'SENT',
        OR: expect.any(Array),
      }),
      data: { readAt: expect.any(Date) },
    });
    db.notification.findFirst.mockResolvedValue(null);
    db.notification.updateMany.mockClear();
    await expect(operations.readInbox(user, 'other-message')).rejects.toThrow();
    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });
});

describe('Notification HTTP contract', () => {
  let app: INestApplication;
  const services = setup();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PushController, OperationsController],
      providers: [
        { provide: PushService, useValue: services.push },
        { provide: OperationsService, useValue: services.operations },
        {
          provide: AuthService,
          useValue: {
            authenticate: async () => ({ user, sessionId: 'session' }),
          },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
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
  });
  afterAll(async () => app.close());
  it('requires authentication for config, subscriptions and read status', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/operations/push/config')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/operations/push/subscriptions')
      .send(dto)
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/v1/operations/push/subscriptions')
      .send({ endpoint: dto.endpoint })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/operations/inbox/unread')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/operations/inbox/read-all')
      .expect(401);
  });
  it('accepts a browser subscription and rejects injected identity or malformed nested keys', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/operations/push/subscriptions')
      .auth('valid', { type: 'bearer' })
      .send(dto)
      .expect(201, { subscribed: true });
    for (const body of [
      { ...dto, userId: 'other' },
      { ...dto, keys: {} },
      { endpoint: dto.endpoint },
      { ...dto, keys: { ...dto.keys, injected: true } },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/operations/push/subscriptions')
        .auth('valid', { type: 'bearer' })
        .send(body)
        .expect(400);
    }
  });
  it('allows personal unread/read-all access without management permissions', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/operations/inbox/unread')
      .auth('valid', { type: 'bearer' })
      .expect(200, { count: 2 });
    await request(app.getHttpServer())
      .post('/api/v1/operations/inbox/read-all')
      .auth('valid', { type: 'bearer' })
      .expect(201, { count: 1 });
    await request(app.getHttpServer())
      .post('/api/v1/operations/inbox/not-a-uuid/read')
      .auth('valid', { type: 'bearer' })
      .expect(400);
  });
});
