import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { CurrentUser } from '@church/shared';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';
import { BirdDeliveryError } from '../src/modules/email/bird-email.service';
import { NotificationOutboxService } from '../src/modules/operations/notification-outbox.service';
import { NotificationWorkerController } from '../src/modules/operations/notification-worker.controller';
import { OperationsService } from '../src/modules/operations/operations.service';

describe('Notification outbox with real PostgreSQL and simulated transport', () => {
  const schema = `outbox_${randomUUID().replaceAll('-', '')}`;
  let db: PrismaClient;
  let observer: PrismaClient;
  let worker: NotificationOutboxService;
  let operations: OperationsService;
  let user: CurrentUser;
  let memberId: string;
  const provider = {
    channel: 'EMAIL',
    idempotentRetry: true,
    prepare: jest.fn(),
    send: jest.fn(),
  };
  const requestPayload = {
    from: 'sender@example.invalid',
    to: 'recipient@example.invalid',
    subject: 'Notice',
    text: 'Message',
  };

  beforeAll(async () => {
    const connection = new URL(process.env.TEST_DATABASE_URL!);
    if (!/^\/ponte_push_test_[a-f0-9]+$/.test(connection.pathname))
      throw new Error('Use the disposable integration database');
    connection.searchParams.set('schema', schema);
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: { ...process.env, DATABASE_URL: connection.toString() },
        stdio: 'pipe',
      },
    );
    db = new PrismaClient({
      datasources: { db: { url: connection.toString() } },
    });
    observer = new PrismaClient({
      datasources: { db: { url: connection.toString() } },
    });
    const account = await db.user.create({
      data: {
        email: `outbox-${randomUUID()}@example.invalid`,
        name: 'Outbox fixture',
        passwordHash: 'unused',
        status: 'ACTIVE',
      },
    });
    memberId = (await db.user.findUniqueOrThrow({ where: { id: account.id } }))
      .memberId!;
    if (!memberId) throw new Error('Fixture identity was not linked');
    user = {
      id: account.id,
      permissions: ['NOTIFICATION_SEND', 'OPERATION_SCOPE_ALL'],
    } as CurrentUser;
  }, 60000);
  afterAll(async () => {
    await observer?.$disconnect();
    if (db) {
      await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await db.$disconnect();
    }
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await db.notification.deleteMany();
    provider.prepare.mockReset().mockResolvedValue(requestPayload);
    provider.send.mockReset().mockResolvedValue(undefined);
    worker = new NotificationOutboxService(db as PrismaService, [provider]);
    operations = new OperationsService(
      db as PrismaService,
      [provider],
      undefined,
      worker,
    );
  });
  async function queued(channel = 'EMAIL', held = false) {
    return db.$transaction(async (tx) => {
      const n = await tx.notification.create({
        data: {
          recipientMemberId: memberId,
          createdByUserId: user.id,
          channel,
          content: 'Message',
        },
      });
      await worker.enqueue(tx, [n.id], held);
      return n;
    });
  }
  const delivery = (id: string) =>
    db.notificationDelivery.findUniqueOrThrow({
      where: { notificationId: id },
    });
  const due = (id: string) =>
    db.notificationDelivery.update({
      where: { notificationId: id },
      data: { availableAt: new Date(0) },
    });

  it('rolls back notification creation if its durable intent cannot be committed', async () => {
    jest
      .spyOn(worker, 'enqueue')
      .mockRejectedValueOnce(new Error('simulated persistence failure'));
    await expect(
      operations.sendNotification(
        { channel: 'EMAIL', content: 'Message', recipientMemberId: memberId },
        user,
      ),
    ).rejects.toThrow();
    expect(await db.notification.count()).toBe(0);
    expect(await db.notificationDelivery.count()).toBe(0);
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('commits the claim and releases DB locks before entering the transport', async () => {
    provider.send.mockImplementationOnce(async (n) => {
      expect(
        (
          await observer.notificationDelivery.findUniqueOrThrow({
            where: { notificationId: n.id },
          })
        ).state,
      ).toBe('PROCESSING');
      await observer.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM notifications WHERE id=${n.id}::uuid FOR UPDATE NOWAIT`;
      });
    });
    const result = await operations.sendNotification(
      { channel: 'EMAIL', content: 'Message', recipientMemberId: memberId },
      user,
    );
    expect(result.status).toBe('SENT');
    if (!('id' in result))
      throw new Error('Expected an individual notification');
    expect(await delivery(result.id)).toMatchObject({
      state: 'DELIVERED',
      attempts: 1,
      payload: null,
    });
  });

  it('allows only one worker to send and blocks cancellation during a live claim', async () => {
    const n = await queued();
    let release!: () => void;
    let entered!: () => void;
    const entering = new Promise<void>((resolve) => {
      entered = resolve;
    });
    provider.send.mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const first = worker.dispatch(n.id, user);
    await entering;
    try {
      await expect(worker.dispatch(n.id, user)).rejects.toThrow(
        'processamento',
      );
      await expect(worker.dispatch(n.id, user, true)).rejects.toThrow(
        'processamento',
      );
      expect(provider.send).toHaveBeenCalledTimes(1);
    } finally {
      release();
      await first;
    }
  });

  it('does not call the provider when committing a claim fails', async () => {
    const n = await queued();
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_outbox_claim() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated commit failure'; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE CONSTRAINT TRIGGER reject_outbox_claim AFTER UPDATE ON notification_deliveries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_outbox_claim()`,
    );
    try {
      await expect(worker.dispatch(n.id, user)).rejects.toThrow();
      expect(await delivery(n.id)).toMatchObject({
        state: 'READY',
        attempts: 0,
      });
      expect(provider.send).not.toHaveBeenCalled();
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER reject_outbox_claim ON notification_deliveries',
      );
      await db.$executeRawUnsafe('DROP FUNCTION reject_outbox_claim()');
    }
  });

  it('recovers an email accepted before the final DB commit fails', async () => {
    const n = await queued();
    const accepted = new Set<string>();
    provider.send.mockImplementation(async (message) => {
      accepted.add(message.id);
    });
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_outbox_ack() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated acknowledgement failure'; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE CONSTRAINT TRIGGER reject_outbox_ack AFTER UPDATE ON notifications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_outbox_ack()`,
    );
    try {
      await expect(worker.dispatch(n.id, user)).rejects.toThrow();
      expect((await delivery(n.id)).state).toBe('PROCESSING');
      expect(
        (await db.notification.findUniqueOrThrow({ where: { id: n.id } }))
          .status,
      ).toBe('PENDING');
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER reject_outbox_ack ON notifications',
      );
      await db.$executeRawUnsafe('DROP FUNCTION reject_outbox_ack()');
    }
    await db.notificationDelivery.update({
      where: { notificationId: n.id },
      data: { lockedUntil: new Date(0) },
    });
    expect(await worker.process()).toMatchObject({ sent: 1 });
    expect(accepted.size).toBe(1);
    expect(provider.send).toHaveBeenCalledTimes(2);
  });

  it('recovers a committed intent when the request exits before dispatching', async () => {
    await queued();
    expect(await worker.process()).toMatchObject({ sent: 1, processed: 1 });
    expect(await worker.process()).toMatchObject({ processed: 0 });
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it('keeps scheduled/legacy messages manual and cancels a ready intent without transport', async () => {
    const held = await queued('EMAIL', true);
    const ready = await queued();
    await worker.dispatch(ready.id, user, true);
    expect(await worker.process()).toMatchObject({ processed: 0 });
    expect((await delivery(held.id)).state).toBe('HELD');
    expect((await delivery(ready.id)).state).toBe('CANCELLED');
    expect(provider.send).not.toHaveBeenCalled();
    expect((await worker.dispatch(held.id, user)).status).toBe('SENT');
  });

  it('retries an uncertain email with the frozen body, same identity and bounded backoff', async () => {
    const n = await queued();
    const accepted = new Set<string>();
    provider.send.mockImplementation(async (notification) => {
      accepted.add(notification.id);
      if (provider.send.mock.calls.length === 1)
        throw new BirdDeliveryError(true, true);
    });
    expect((await worker.dispatch(n.id, user)).status).toBe('PENDING');
    await expect(worker.dispatch(n.id, user, true)).rejects.toThrow(
      'sem confirmação',
    );
    expect(await delivery(n.id)).toMatchObject({
      state: 'READY',
      attempts: 1,
      payload: requestPayload,
    });
    await expect(worker.dispatch(n.id, user)).rejects.toThrow(
      'próxima tentativa',
    );
    await due(n.id);
    expect(await worker.process()).toMatchObject({ sent: 1 });
    expect(accepted.size).toBe(1);
    expect(provider.send.mock.calls[0][2]).toEqual(
      provider.send.mock.calls[1][2],
    );
  });

  it('recovers an expired email claim within the idempotency window', async () => {
    const n = await queued();
    await db.notificationDelivery.update({
      where: { notificationId: n.id },
      data: {
        state: 'PROCESSING',
        attempts: 1,
        firstAttemptAt: new Date(),
        lockedUntil: new Date(0),
        claimToken: randomUUID(),
        payload: requestPayload,
      },
    });
    expect(await worker.process()).toMatchObject({ sent: 1 });
    expect((await delivery(n.id)).attempts).toBe(2);
  });

  it('never retries an expired push claim whose external acceptance is unknown', async () => {
    const n = await queued('PUSH');
    const push = { channel: 'PUSH', send: jest.fn() };
    const pushWorker = new NotificationOutboxService(db as PrismaService, [
      push,
    ]);
    await db.notificationDelivery.update({
      where: { notificationId: n.id },
      data: {
        state: 'PROCESSING',
        attempts: 1,
        firstAttemptAt: new Date(),
        lockedUntil: new Date(0),
        claimToken: randomUUID(),
      },
    });
    expect(await pushWorker.process()).toMatchObject({ failed: 1 });
    expect((await delivery(n.id)).state).toBe('UNCERTAIN');
    expect(push.send).not.toHaveBeenCalled();
  });

  it('stops at three attempts and keeps an unknown outcome for reconciliation', async () => {
    const n = await queued();
    provider.send.mockRejectedValue(new BirdDeliveryError(true, true));
    for (let attempt = 0; attempt < 3; attempt++) {
      await worker.dispatch(n.id, user);
      await due(n.id);
    }
    expect(await delivery(n.id)).toMatchObject({
      state: 'UNCERTAIN',
      attempts: 3,
    });
    expect(await worker.process()).toMatchObject({ processed: 0 });
    expect(provider.send).toHaveBeenCalledTimes(3);
  });

  it('does not resend after the safe retention window expires', async () => {
    const n = await queued();
    await db.notificationDelivery.update({
      where: { notificationId: n.id },
      data: {
        firstAttemptAt: new Date(Date.now() - 2 * 60 * 60_000),
        attempts: 1,
        uncertain: true,
        payload: requestPayload,
      },
    });
    expect(await worker.process()).toMatchObject({ failed: 1 });
    expect((await delivery(n.id)).state).toBe('UNCERTAIN');
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('stops if the resolved address/body changes instead of reusing a key for a different request', async () => {
    const n = await queued();
    provider.send.mockRejectedValueOnce(new BirdDeliveryError(true, true));
    await worker.dispatch(n.id, user);
    await due(n.id);
    provider.prepare.mockResolvedValue({
      ...requestPayload,
      to: 'different@example.invalid',
    });
    expect(await worker.process()).toMatchObject({ failed: 1 });
    expect((await delivery(n.id)).state).toBe('UNCERTAIN');
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it('keeps claim ownership fencing when a previous worker returns late', async () => {
    const n = await queued();
    const newerToken = randomUUID();
    provider.send.mockImplementationOnce(async () => {
      await observer.notificationDelivery.update({
        where: { notificationId: n.id },
        data: { claimToken: newerToken },
      });
    });
    expect((await worker.dispatch(n.id, user)).status).toBe('PENDING');
    expect(await delivery(n.id)).toMatchObject({
      state: 'PROCESSING',
      claimToken: newerToken,
    });
  });

  it('requires a distinct configured worker secret before touching the outbox', async () => {
    const token = 'worker-secret-'.repeat(4);
    const controller = new NotificationWorkerController(
      worker,
      new ConfigService({ NOTIFICATION_OUTBOX_SECRET: token }),
    );
    const process = jest.spyOn(worker, 'process');
    expect(() => controller.process()).toThrow();
    expect(() => controller.process('Bearer invalid')).toThrow();
    expect(process).not.toHaveBeenCalled();
    await expect(controller.process(`Bearer ${token}`)).resolves.toMatchObject({
      processed: 0,
    });
  });
});
