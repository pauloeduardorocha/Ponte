import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import {
  PasswordResetDelivery,
  PendingEmailDelivery,
} from '../src/modules/auth/password-reset.delivery';

describe('Authentication security configuration', () => {
  it.each([
    {},
    { JWT_ACCESS_SECRET: 'short', JWT_REFRESH_SECRET: 'b'.repeat(48) },
    { JWT_ACCESS_SECRET: 'a'.repeat(48), JWT_REFRESH_SECRET: 'a'.repeat(48) },
    {
      JWT_ACCESS_SECRET: 'replace-with-a-random-secret-at-least-32-characters',
      JWT_REFRESH_SECRET: 'b'.repeat(48),
    },
  ])(
    'refuses startup with missing, weak, placeholder or identical secrets',
    (configuration) => {
      const config = new ConfigService({
        JWT_ACCESS_SECRET: '',
        JWT_REFRESH_SECRET: '',
        ...configuration,
      });
      expect(
        () =>
          new AuthService(
            new PrismaService(),
            new JwtService(),
            config,
            new PendingEmailDelivery(),
          ),
      ).toThrow();
    },
  );

  it('explicitly warns that delivery is not configured without logging reset tokens or e-mail', async () => {
    const log = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const delivery: PasswordResetDelivery = new PendingEmailDelivery();
    try {
      await delivery.send({
        email: 'private@example.com',
        token: 'secret-token',
        expiresAt: new Date(),
      });
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('No message was sent'),
      );
      expect(log).not.toHaveBeenCalledWith(
        expect.stringContaining('secret-token'),
      );
      expect(log).not.toHaveBeenCalledWith(
        expect.stringContaining('private@example.com'),
      );
    } finally {
      log.mockRestore();
    }
  });
});

describe('Authentication HTTP rate limits', () => {
  let app: INestApplication;
  const login = jest.fn().mockResolvedValue({
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    user: { id: 'test' },
  });
  const forgotPassword = jest
    .fn()
    .mockResolvedValue({ message: 'Generic response' });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ limit: 100, ttl: 60000 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { login, forgotPassword } },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NODE_ENV: 'production',
            CORS_ORIGIN: 'https://church.example',
          }),
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('limits login to 10 requests/minute and sets secure cookies in production', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'user@example.com', password: 'password' })
        .expect(200)
        .expect((response) => {
          expect(response.headers['set-cookie']?.[0]).toContain('Secure');
          expect(response.headers['cache-control']).toBe('no-store');
        });
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'password' })
      .expect(429);
    expect(login).toHaveBeenCalledTimes(10);
  });

  it('also rate-limits password recovery requests', async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'user@example.com' })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'user@example.com' })
      .expect(429);
    expect(forgotPassword).toHaveBeenCalledTimes(10);
  });
});
