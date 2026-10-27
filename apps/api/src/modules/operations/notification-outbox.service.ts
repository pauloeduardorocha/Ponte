import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import {
  Prisma,
  type Notification,
  type NotificationDelivery,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '../../database/prisma.service';
import { bindAudit } from '../audit/audit-context';
import { BirdDeliveryError } from '../email/bird-email.service';
import {
  NOTIFICATION_PROVIDERS,
  type NotificationProvider,
} from './notification.provider';
import { PushService } from './push.service';

const LEASE_MS = 120_000;
const RETRY_WINDOW_MS = 2 * 60 * 60_000; // Below Bird's three-hour retention.
const FAILURE = 'Falha no provedor de comunicação.';
const UNCERTAIN =
  'Entrega sem confirmação. Rever o histórico do provedor antes de criar outro envio.';
type Claim =
  | { result: Notification }
  | {
      notification: Notification;
      delivery: NotificationDelivery;
      token: string;
      provider: NotificationProvider;
    };

@Injectable()
export class NotificationOutboxService {
  constructor(
    private readonly db: PrismaService,
    @Inject(NOTIFICATION_PROVIDERS)
    private readonly providers: NotificationProvider[],
    @Optional() private readonly push?: PushService,
  ) {}

  enqueue(tx: Prisma.TransactionClient, ids: string[], held: boolean) {
    return tx.notificationDelivery.createMany({
      data: ids.map((notificationId) => ({
        notificationId,
        state: held ? 'HELD' : 'READY',
      })),
    });
  }

  private write<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.db.$transaction(
      async (tx) => {
        await bindAudit(tx);
        return fn(tx);
      },
      { timeout: 10_000 },
    );
  }

  private async clock(db: Prisma.TransactionClient) {
    const [clock] = await db.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    if (!clock) throw new Error('Database clock unavailable');
    return clock.now;
  }

  async dispatch(
    id: string,
    user?: CurrentUser,
    cancel = false,
  ): Promise<Notification> {
    const claim = await this.write<Claim>(async (tx) => {
      await tx.$queryRaw`SELECT id FROM notifications WHERE id=${id}::uuid FOR UPDATE`;
      const n = await tx.notification.findFirst({
        where: {
          id,
          ...(user && !user.permissions.includes('OPERATION_SCOPE_ALL')
            ? { createdByUserId: user.id }
            : {}),
        },
      });
      if (!n) throw new NotFoundException();
      if (n.status !== 'PENDING')
        throw new ConflictException('Notificação já processada.');
      const now = await this.clock(tx);
      const d = await tx.notificationDelivery.upsert({
        where: { notificationId: id },
        create: { notificationId: id, state: 'HELD' },
        update: {},
      });
      if (!['READY', 'HELD', 'PROCESSING'].includes(d.state))
        throw new ConflictException('Entrega já processada.');
      if (d.state === 'PROCESSING' && d.lockedUntil && d.lockedUntil > now)
        throw new ConflictException('Envio em processamento.');
      if (cancel) {
        // An expired lease can still represent an accepted external send.
        if (d.state === 'PROCESSING' || d.uncertain)
          throw new ConflictException(
            'Entrega sem confirmação; aguarde a recuperação do processamento.',
          );
        await tx.notificationDelivery.update({
          where: { notificationId: id },
          data: {
            state: 'CANCELLED',
            claimToken: null,
            lockedUntil: null,
            payload: Prisma.DbNull,
          },
        });
        return {
          result: await tx.notification.update({
            where: { id },
            data: { status: 'CANCELLED' },
          }),
        };
      }
      if (n.scheduledAt && n.scheduledAt > now)
        throw new ConflictException('Aguarde a data agendada.');
      // Legacy unscheduled intents remain manual; dated intents are released
      // by the worker only after checking the database clock above.
      if (!user && d.state === 'HELD' && !n.scheduledAt)
        throw new ConflictException('Pendência antiga exige ação manual.');
      if (d.state === 'READY' && d.availableAt > now)
        throw new ConflictException('Aguarde a próxima tentativa.');
      const provider = this.providers.find((p) => p.channel === n.channel);
      if (!provider)
        throw new ConflictException(
          'Canal preparado; configure um provedor antes de enviar.',
        );
      const terminal = async (uncertain: boolean) => {
        await tx.notificationDelivery.update({
          where: { notificationId: id },
          data: {
            state: uncertain ? 'UNCERTAIN' : 'FAILED',
            uncertain,
            claimToken: null,
            lockedUntil: null,
            ...(!uncertain ? { payload: Prisma.DbNull } : {}),
          },
        });
        return {
          result: await tx.notification.update({
            where: { id },
            data: { status: 'FAILED', error: uncertain ? UNCERTAIN : FAILURE },
          }),
        };
      };
      if (
        d.attempts >= 3 ||
        (d.firstAttemptAt &&
          now.getTime() - d.firstAttemptAt.getTime() >= RETRY_WINDOW_MS)
      )
        return terminal(d.uncertain || d.state === 'PROCESSING');
      if (
        d.state === 'PROCESSING' &&
        !provider.idempotentRetry &&
        n.channel !== 'INTERNAL'
      )
        return terminal(true);
      if (n.channel === 'INTERNAL') {
        await tx.notificationDelivery.update({
          where: { notificationId: id },
          data: {
            state: 'DELIVERED',
            claimToken: null,
            lockedUntil: null,
            payload: Prisma.DbNull,
          },
        });
        return {
          result: await tx.notification.update({
            where: { id },
            data: { status: 'SENT', sentAt: now, error: null },
          }),
        };
      }
      let payload: Prisma.InputJsonObject | undefined;
      try {
        payload = await provider.prepare?.(n, tx);
        // Freeze the request across retries; changing an address/config must never
        // reuse a Bird idempotency key with a different body.
        if (d.payload && !isDeepStrictEqual(d.payload, payload))
          return terminal(d.uncertain || d.state === 'PROCESSING');
      } catch {
        return terminal(d.uncertain || d.state === 'PROCESSING');
      }
      const token = randomUUID();
      const delivery = await tx.notificationDelivery.update({
        where: { notificationId: id },
        data: {
          state: 'PROCESSING',
          attempts: d.attempts + 1,
          uncertain: d.uncertain || d.state === 'PROCESSING',
          claimToken: token,
          lockedUntil: new Date(now.getTime() + LEASE_MS),
          firstAttemptAt: d.firstAttemptAt ?? now,
          ...(payload ? { payload } : {}),
        },
      });
      return { notification: n, delivery, token, provider };
    });
    if ('result' in claim) {
      if (claim.result.channel === 'INTERNAL' && claim.result.status === 'SENT')
        await this.push?.notifyInternal(claim.result);
      return claim.result;
    }
    let error: unknown;
    let succeeded = false;
    try {
      // The claim transaction has committed before any external request begins.
      await claim.provider.send(
        claim.notification,
        this.db,
        claim.delivery.payload,
      );
      succeeded = true;
    } catch (failure) {
      error = failure;
    }
    return this.write(async (tx) => {
      await tx.$queryRaw`SELECT id FROM notifications WHERE id=${id}::uuid FOR UPDATE`;
      const d = await tx.notificationDelivery.findUniqueOrThrow({
        where: { notificationId: id },
      });
      if (d.claimToken !== claim.token || d.state !== 'PROCESSING')
        return tx.notification.findUniqueOrThrow({ where: { id } });
      const now = await this.clock(tx);
      const retry =
        error instanceof BirdDeliveryError &&
        error.retryable &&
        claim.provider.idempotentRetry &&
        d.attempts < 3;
      const uncertain =
        !succeeded &&
        (d.uncertain ||
          (error instanceof BirdDeliveryError ? error.uncertain : true));
      const state = succeeded
        ? 'DELIVERED'
        : retry
          ? 'READY'
          : uncertain
            ? 'UNCERTAIN'
            : 'FAILED';
      await tx.notificationDelivery.update({
        where: { notificationId: id },
        data: {
          state,
          uncertain,
          claimToken: null,
          lockedUntil: null,
          availableAt: new Date(
            now.getTime() + (d.attempts === 1 ? 60_000 : 300_000),
          ),
          ...(!retry && !uncertain ? { payload: Prisma.DbNull } : {}),
        },
      });
      return tx.notification.update({
        where: { id },
        data: {
          status: succeeded ? 'SENT' : retry ? 'PENDING' : 'FAILED',
          sentAt: succeeded ? now : null,
          error: succeeded ? null : state === 'UNCERTAIN' ? UNCERTAIN : FAILURE,
        },
      });
    });
  }

  async process(limit = 10) {
    const now = await this.clock(this.db);
    const candidates = await this.db.notificationDelivery.findMany({
      where: {
        notification: {
          status: 'PENDING',
          channel: { in: this.providers.map((p) => p.channel) },
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        },
        OR: [
          { state: 'HELD', notification: { scheduledAt: { lte: now } } },
          { state: 'READY', availableAt: { lte: now } },
          { state: 'PROCESSING', lockedUntil: { lte: now } },
        ],
      },
      orderBy: [{ availableAt: 'asc' }, { notificationId: 'asc' }],
      take: Math.min(Math.max(limit, 1), 10),
      select: { notificationId: true },
    });
    const counts = { processed: 0, sent: 0, pending: 0, failed: 0, skipped: 0 };
    for (const c of candidates) {
      try {
        const n: Notification = await this.dispatch(c.notificationId);
        counts.processed++;
        if (n.status === 'SENT') counts.sent++;
        else if (n.status === 'PENDING') counts.pending++;
        else counts.failed++;
      } catch (e) {
        if (e instanceof ConflictException || e instanceof NotFoundException)
          counts.skipped++;
        else throw e;
      }
    }
    return counts;
  }
}
