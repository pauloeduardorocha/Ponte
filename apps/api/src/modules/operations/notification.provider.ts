import { Injectable } from '@nestjs/common';
import type { Notification } from '@prisma/client';
export interface NotificationProvider {
  readonly channel: string;
  send(notification: Notification): Promise<void>;
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
