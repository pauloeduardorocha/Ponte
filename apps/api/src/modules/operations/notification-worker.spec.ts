import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { PermissionGuard } from '../auth/permission.guard';
import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationWorkerController } from './notification-worker.controller';

describe('Notification worker machine authentication', () => {
  const secret = 'dedicated-machine-secret-'.repeat(3);
  async function application(configuredSecret = secret) {
    const process = jest
      .fn()
      .mockResolvedValue({
        processed: 0,
        sent: 0,
        failed: 0,
        pending: 0,
        skipped: 0,
      });
    const authenticate = jest.fn();
    const module = await Test.createTestingModule({
      controllers: [NotificationWorkerController],
      providers: [
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NOTIFICATION_OUTBOX_SECRET: configuredSecret,
          }),
        },
        { provide: NotificationOutboxService, useValue: { process } },
        { provide: AuthService, useValue: { authenticate } },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionGuard },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.init();
    return { app, process, authenticate };
  }
  it('accepts only the dedicated bearer secret and bypasses session authentication', async () => {
    const { app, process, authenticate } = await application();
    try {
      for (const value of [
        '',
        'Bearer ordinary-user-jwt',
        `Basic ${secret}`,
        `Bearer ${secret}x`,
      ]) {
        await request(app.getHttpServer())
          .post('/internal/notification-outbox/process')
          .set('Authorization', value)
          .expect(401);
      }
      expect(process).not.toHaveBeenCalled();
      await request(app.getHttpServer())
        .post('/internal/notification-outbox/process')
        .auth(secret, { type: 'bearer' })
        .expect(201);
      expect(process).toHaveBeenCalledTimes(1);
      expect(authenticate).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('stays disabled without a strong configured secret', async () => {
    const { app, process } = await application('');
    try {
      await request(app.getHttpServer())
        .post('/internal/notification-outbox/process')
        .auth(secret, { type: 'bearer' })
        .expect(503);
      expect(process).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
