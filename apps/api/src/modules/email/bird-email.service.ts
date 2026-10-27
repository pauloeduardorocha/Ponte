import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import { createHash } from 'node:crypto';

export interface BirdEmailMessage {
  from?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  category?: 'transactional' | 'marketing';
  idempotencyKey?: string;
}

export class BirdDeliveryError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly uncertain: boolean,
    message = 'Falha no provedor de comunicação.',
  ) {
    super(message);
  }
}

@Injectable()
export class BirdEmailService {
  private readonly apiKey: string;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('BIRD_API_KEY', '').trim();
    this.from = config
      .get<string>('BIRD_EMAIL_FROM', 'noreply@igrejaponte.com')
      .trim();
    if (this.apiKey && !/^bk_eu1_\S+$/.test(this.apiKey))
      throw new Error('BIRD_API_KEY must be a Bird EU (bk_eu1_) API key.');
    if (this.apiKey && !isEmail(this.from))
      throw new Error(
        'BIRD_EMAIL_FROM must be a verified sender email address.',
      );
  }

  get configured() {
    return Boolean(this.apiKey);
  }
  get sender() {
    return this.from;
  }
  get credentialFingerprint() {
    return createHash('sha256').update(this.apiKey).digest('hex');
  }
  serialize(message: BirdEmailMessage) {
    return JSON.stringify({
      from: { email: message.from ?? this.from, name: 'Igreja Ponte' },
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      category: message.category ?? 'transactional',
      track_clicks: false,
      track_opens: false,
    });
  }

  async send(message: BirdEmailMessage): Promise<void> {
    return this.sendSerialized(this.serialize(message), message.idempotencyKey);
  }

  async sendSerialized(body: string, idempotencyKey?: string): Promise<void> {
    if (!this.configured)
      throw new Error('Bird email delivery is not configured.');

    let response: Response;
    try {
      response = await fetch(
        'https://eu1.platform.bird.com/v1/email/messages',
        {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          },
          body,
        },
      );
    } catch {
      // Provider errors may contain the request, API key or reset link.
      throw new BirdDeliveryError(
        true,
        true,
        'Bird email request failed or timed out.',
      );
    }
    // Reading the response body is unnecessary; acceptance is confirmed by status.
    await response.body?.cancel().catch(() => undefined);
    if (response.status !== 202)
      throw new BirdDeliveryError(
        response.status >= 500 || [409, 429].includes(response.status),
        response.status >= 500,
        `Bird did not accept the email (HTTP ${response.status}).`,
      );
  }
}
