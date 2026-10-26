import { Injectable } from '@nestjs/common';
import type { Notification, Prisma } from '@prisma/client';
import { isEmail } from 'class-validator';
import { BirdEmailService } from '../email/bird-email.service';
import type { NotificationProvider } from './notification.provider';

@Injectable()
export class EmailNotificationProvider implements NotificationProvider {
  readonly channel = 'EMAIL';

  constructor(private readonly email: BirdEmailService) {}

  get configured() {
    return this.email.configured;
  }

  async send(notification: Notification, tx: Prisma.TransactionClient) {
    // Reuse the locked delivery transaction instead of a second pool connection.
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
    await this.email.send({
      to,
      subject: notification.subject?.trim() || 'Notificação — Igreja Ponte',
      text: notification.content,
      html: `<p>${html}</p>`,
      // Free-form announcements must respect the provider's unsubscribe list.
      category: 'marketing',
      idempotencyKey: `notification-${notification.id}`,
    });
  }
}
