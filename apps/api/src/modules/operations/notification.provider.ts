import { Injectable } from '@nestjs/common';
import type { Notification, Prisma } from '@prisma/client';
import { PushService } from './push.service';
export interface NotificationProvider {
  readonly channel: string;
  readonly idempotentRetry?: boolean;
  prepare?(
    notification: Notification,
    db: Prisma.TransactionClient,
  ): Promise<Prisma.InputJsonObject>;
  send(
    notification: Notification,
    db: Prisma.TransactionClient,
    payload?: Prisma.JsonValue | null,
  ): Promise<void>;
}
@Injectable()
export class InternalNotificationProvider implements NotificationProvider {
  readonly channel = 'INTERNAL';
  async send(_notification: Notification): Promise<void> {
    void _notification;
    // Persistence is the delivery mechanism for the internal inbox.
  }
}
export const NOTIFICATION_PROVIDERS = Symbol('NOTIFICATION_PROVIDERS');

@Injectable()
export class PushNotificationProvider implements NotificationProvider {
  readonly channel = 'PUSH';
  constructor(private readonly push: PushService) {}
  async send(notification: Notification) {
    if (!(await this.push.send(notification)))
      throw new Error('Nenhum dispositivo aceitou o push.');
  }
}
