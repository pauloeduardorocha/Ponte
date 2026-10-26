import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BirdEmailService } from '../email/bird-email.service';

export interface PasswordResetMessage {
  email: string;
  token: string;
  expiresAt: Date;
}

export abstract class PasswordResetDelivery {
  abstract send(message: PasswordResetMessage): Promise<void>;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });

@Injectable()
export class BirdPasswordResetDelivery extends PasswordResetDelivery {
  private readonly logger = new Logger(BirdPasswordResetDelivery.name);

  constructor(
    private readonly config: ConfigService,
    private readonly email: BirdEmailService,
  ) {
    super();
  }

  async send(message: PasswordResetMessage): Promise<void> {
    if (!this.email.configured) {
      this.logger.warn(
        'Password recovery requested; Bird email delivery is not configured. No message was sent.',
      );
      return;
    }

    // Use the configured frontend URL, never a caller-supplied Host header.
    const publicUrl = this.config.get<string>('PUBLIC_WEB_URL', '').trim();
    let url: URL;
    try {
      url = new URL(publicUrl);
    } catch {
      throw new Error('Configure PUBLIC_WEB_URL for password recovery emails.');
    }
    const localHttp =
      this.config.get<string>('NODE_ENV') !== 'production' &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !localHttp) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('PUBLIC_WEB_URL must be a trusted HTTPS frontend URL.');
    url.pathname = `${url.pathname.replace(/\/$/, '')}/reset-password`;
    url.searchParams.set('token', message.token);
    const link = url.toString();
    const expiry = message.expiresAt.toLocaleString('pt-PT', {
      timeZone: 'Europe/Lisbon',
    });
    await this.email.send({
      to: message.email,
      subject: 'Redefinir a senha — Igreja Ponte',
      text: `Recebemos um pedido para redefinir a sua senha no Ponte.\n\nAbra este link: ${link}\n\nO link é válido até ${expiry} (hora de Lisboa) e só pode ser usado uma vez. Se não fez este pedido, ignore este email.`,
      html: `<p>Recebemos um pedido para redefinir a sua senha no Ponte.</p><p><a href="${escapeHtml(link)}">Redefinir a senha</a></p><p>O link é válido até ${escapeHtml(expiry)} (hora de Lisboa) e só pode ser usado uma vez.</p><p>Se não fez este pedido, ignore este email.</p>`,
    });
  }
}

@Injectable()
export class PendingEmailDelivery extends PasswordResetDelivery {
  private readonly logger = new Logger(PendingEmailDelivery.name);

  async send(): Promise<void> {
    this.logger.warn(
      'Password recovery requested; email delivery adapter is not configured. No message was sent.',
    );
  }
}
