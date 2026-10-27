import {
  Controller,
  Headers,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/permission.decorator';
import { NotificationOutboxService } from './notification-outbox.service';

@ApiExcludeController()
@Controller('internal/notification-outbox')
export class NotificationWorkerController {
  constructor(
    private readonly outbox: NotificationOutboxService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('process')
  process(@Headers('authorization') authorization?: string) {
    const secret = this.config.get<string>('NOTIFICATION_OUTBOX_SECRET', '');
    if (secret.length < 32)
      throw new ServiceUnavailableException('Worker não configurado.');
    const received = Buffer.from(authorization ?? '');
    const expected = Buffer.from(`Bearer ${secret}`);
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      throw new UnauthorizedException();
    return this.outbox.process();
  }
}
