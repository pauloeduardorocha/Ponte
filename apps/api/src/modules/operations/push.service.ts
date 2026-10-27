import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ECDH } from 'node:crypto';
import { Notification, Prisma } from '@prisma/client';
import * as webPush from 'web-push';
import { PrismaService } from '../../database/prisma.service';
import { PushSubscriptionDto } from './push.dto';

export function notificationPushPayload(notification: Notification) {
  const payload = {
    title: notification.subject?.trim() || 'A Ponte',
    body: notification.content,
    tag: notification.id,
    url: '/inbox',
  };
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 3000) {
    // Bound encrypted push size using serialized UTF-8 bytes, preserving Unicode.
    const characters = Array.from(notification.content);
    let low = 0,
      high = characters.length;
    while (low < high) {
      const length = Math.ceil((low + high) / 2);
      payload.body = characters.slice(0, length).join('') + '…';
      if (Buffer.byteLength(JSON.stringify(payload), 'utf8') <= 3000)
        low = length;
      else high = length - 1;
    }
    payload.body = characters.slice(0, low).join('') + '…';
  }
  return JSON.stringify(payload);
}

export type SystemPushPreference =
  | 'pushReimbursementRequested'
  | 'pushEventRefundRequested'
  | 'pushLibraryOverdue'
  | 'pushLibraryReservationReady'
  | 'pushBirthdays';

// Endpoints are client input. Never allow arbitrary outbound requests or redirects.
export function validatePushEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new BadRequestException('Endpoint push inválido.');
  }
  const allowed =
    [
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'web.push.apple.com',
    ].includes(url.hostname) ||
    /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  if (
    !allowed ||
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  )
    throw new BadRequestException('Serviço push não suportado.');
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private vapid() {
    const publicKey = this.config.get<string>('WEB_PUSH_PUBLIC_KEY');
    const privateKey = this.config.get<string>('WEB_PUSH_PRIVATE_KEY');
    const subject = this.config.get<string>('WEB_PUSH_SUBJECT');
    if (!publicKey || !privateKey || !subject) return null;
    try {
      webPush.getVapidHeaders(
        'https://fcm.googleapis.com',
        subject,
        publicKey,
        privateKey,
        'aes128gcm',
      );
    } catch {
      return null;
    }
    return { subject, publicKey, privateKey };
  }
  settings() {
    const vapid = this.vapid();
    return { enabled: !!vapid, publicKey: vapid?.publicKey ?? null };
  }
  async subscribe(userId: string, dto: PushSubscriptionDto) {
    if (!this.vapid())
      throw new ServiceUnavailableException('Push ainda não configurado.');
    validatePushEndpoint(dto.endpoint);
    try {
      ECDH.convertKey(Buffer.from(dto.keys.p256dh, 'base64url'), 'prime256v1');
      if (Buffer.from(dto.keys.auth, 'base64url').length !== 16)
        throw new Error();
    } catch {
      throw new BadRequestException('Chaves push inválidas.');
    }
    // A unique endpoint cannot be reassigned to another account, including during a race.
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
        const existing = await tx.pushSubscription.findUnique({
          where: { endpoint: dto.endpoint },
        });
        if (existing && existing.userId !== userId)
          throw new ConflictException(
            'Desative as notificações da conta anterior neste navegador.',
          );
        if (existing)
          await tx.pushSubscription.update({
            where: { id: existing.id },
            data: dto.keys,
          });
        else {
          if ((await tx.pushSubscription.count({ where: { userId } })) >= 10)
            throw new ConflictException(
              'Limite de 10 dispositivos atingido. Desative um dispositivo antes de adicionar outro.',
            );
          await tx.pushSubscription.create({
            data: { userId, endpoint: dto.endpoint, ...dto.keys },
          });
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Inscrição alterada. Tente novamente.');
      throw error;
    }
    return { subscribed: true };
  }
  async unsubscribe(userId: string, endpoint: string) {
    await this.db.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { subscribed: false };
  }
  async send(notification: Notification): Promise<number> {
    const vapidDetails = this.vapid();
    if (!vapidDetails) return 0;
    const memberId =
      notification.recipientMemberId ??
      (notification.recipientVisitorId
        ? (
            await this.db.visitor.findUnique({
              where: { id: notification.recipientVisitorId },
              select: { memberId: true },
            })
          )?.memberId
        : null);
    if (!memberId) return 0;
    const subscriptions = await this.db.pushSubscription.findMany({
      where: { user: { memberId, status: 'ACTIVE', deletedAt: null } },
    });
    let accepted = 0;
    for (let offset = 0; offset < subscriptions.length; offset += 5) {
      const results = await Promise.all(
        subscriptions.slice(offset, offset + 5).map(async (subscription) => {
          try {
            validatePushEndpoint(subscription.endpoint);
            await webPush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              notificationPushPayload(notification),
              { vapidDetails, TTL: 86400, timeout: 5000 },
            );
            return 1;
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await this.db.pushSubscription.deleteMany({
                where: {
                  id: subscription.id,
                  updatedAt: subscription.updatedAt,
                },
              });
            } else
              this.logger.warn('Não foi possível entregar um alerta push.');
            return 0;
          }
        }),
      );
      accepted += results.reduce<number>((sum, count) => sum + count, 0);
    }
    return accepted;
  }
  async notifyUsers(
    userIds: string[],
    preference: SystemPushPreference,
    title: string,
    body: string,
    url: string,
  ) {
    const vapidDetails = this.vapid();
    if (!vapidDetails || userIds.length === 0) return;
    const subscriptions = await this.db.pushSubscription.findMany({
      where: {
        user: {
          id: { in: [...new Set(userIds)] },
          status: 'ACTIVE',
          deletedAt: null,
          [preference]: true,
        },
      },
    });
    const payload = JSON.stringify({
      title,
      body,
      tag: `${preference}:${randomUUID()}`,
      url,
    });
    for (let offset = 0; offset < subscriptions.length; offset += 5) {
      await Promise.all(
        subscriptions.slice(offset, offset + 5).map(async (subscription) => {
          try {
            validatePushEndpoint(subscription.endpoint);
            await webPush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              payload,
              { vapidDetails, TTL: 86400, timeout: 5000 },
            );
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await this.db.pushSubscription.deleteMany({
                where: {
                  id: subscription.id,
                  updatedAt: subscription.updatedAt,
                },
              });
            } else {
              this.logger.warn(
                'Não foi possível entregar um alerta push do sistema.',
              );
            }
          }
        }),
      );
    }
  }
  async notifyInternal(notification: Notification) {
    try {
      await this.send(notification);
    } catch {
      this.logger.warn(
        'Alerta push indisponível; mensagem preservada na caixa de entrada.',
      );
    }
  }
}
