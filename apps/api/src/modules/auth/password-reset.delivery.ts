import { Injectable, Logger } from '@nestjs/common';

export interface PasswordResetMessage {
  email: string;
  token: string;
  expiresAt: Date;
}

export abstract class PasswordResetDelivery {
  abstract send(message: PasswordResetMessage): Promise<void>;
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
