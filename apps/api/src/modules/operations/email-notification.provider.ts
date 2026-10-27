import { Injectable } from '@nestjs/common';
import type { Notification, Prisma } from '@prisma/client';
import { isEmail } from 'class-validator';
import { BirdEmailService } from '../email/bird-email.service';
import type { NotificationProvider } from './notification.provider';

@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  readonly channel = 'EMAIL';
  readonly idempotentRetry = true;

  constructor(private readonly email: BirdEmailService) {}

  get configured() {
    return this.email.configured;
  }

  async prepare(
    notification: Notification,
    tx: Prisma.TransactionClient,
  ): Promise<Prisma.InputJsonObject> {
    let recipient: string | null | undefined;
    if (notification.recipientMemberId && !notification.recipientVisitorId) {
      const member = await tx.member.findFirst({
        where: {
          id: notification.recipientMemberId,
          status: 'ACTIVE',
          anonymizedAt: null,
        },
        select: { email: true },
      });
      recipient = member?.email;
    } else if (
      notification.recipientVisitorId &&
      !notification.recipientMemberId
    ) {
      const visitor = await tx.visitor.findFirst({
        where: {
          id: notification.recipientVisitorId,
          OR: [
            { memberId: null },
            { member: { status: 'ACTIVE', anonymizedAt: null } },
          ],
        },
        select: {
          email: true,
          memberId: true,
          member: { select: { email: true } },
        },
      });
      recipient = visitor?.memberId ? visitor.member?.email : visitor?.email;
    }
    const to = recipient?.trim();
    if (!to || !isEmail(to) || /^sememail\+/i.test(to))
      throw new Error('Destinatário sem email disponível para envio.');

    const html = notification.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\r\n|\r|\n/g, '<br>');
    return {
      body: this.email.serialize({
        from: this.email.sender,
        to,
        subject: notification.subject?.trim() || 'Notificação — Igreja Ponte',
        text: notification.content,
        html: `<p>${html}</p>`,
        // Free-form announcements must respect the provider's unsubscribe list.
        category: 'marketing',
      }),
      credentialFingerprint: this.email.credentialFingerprint,
    };
  }
  async send(
    notification: Notification,
    db: Prisma.TransactionClient,
    payload?: Prisma.JsonValue | null,
  ) {
    const prepared = payload ?? (await this.prepare(notification, db));
    const body = (prepared as Prisma.JsonObject).body;
    if (typeof body !== 'string')
      throw new Error('Payload de e-mail indisponível.');
    await this.email.sendSerialized(body, `notification-${notification.id}`);
  }
}
