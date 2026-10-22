import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('Account appearance HTTP contract', () => {
  let app: INestApplication;
  const user = {
    id: '63b80123-eefa-4f48-a877-6cfdcdd4b724',
    colorMode: 'light',
  };
  const update = jest.fn(async ({ data }: { data: { colorMode: string } }) => {
    user.colorMode = data.colorMode;
    return { colorMode: user.colorMode };
  });
  const db = {
    $transaction: (fn: (tx: unknown) => unknown) => fn({ user: { update } }),
  };
  const auth = {
    authenticate: jest.fn(async () => ({ user, sessionId: 'session' })),
    updatePreferences: (id: string, mode: 'system' | 'light' | 'dark') =>
      AuthService.prototype.updatePreferences.call({ db } as never, id, mode),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ConfigService, useValue: new ConfigService() },
        { provide: APP_GUARD, useClass: AuthGuard },
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
  afterAll(() => app.close());
  beforeEach(() => {
    update.mockClear();
    user.colorMode = 'light';
  });

  it.each(['system', 'dark', 'light'])(
    'saves %s only for the authenticated user and returns it from /me',
    async (colorMode) => {
      await request(app.getHttpServer())
        .patch('/api/v1/auth/preferences')
        .set('Authorization', 'Bearer access')
        .send({ colorMode })
        .expect(200, { colorMode })
        .expect('Cache-Control', 'no-store');
      expect(update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { colorMode },
        select: { colorMode: true },
      });
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer access')
        .expect(200);
      expect(response.body.colorMode).toBe(colorMode);
    },
  );

  it.each([
    {},
    { colorMode: 'auto' },
    { colorMode: null },
    { colorMode: 'dark', userId: 'someone-else' },
  ])('rejects an invalid body %j', async (body) => {
    await request(app.getHttpServer())
      .patch('/api/v1/auth/preferences')
      .set('Authorization', 'Bearer access')
      .send(body)
      .expect(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/auth/preferences')
      .send({ colorMode: 'dark' })
      .expect(401);
    expect(update).not.toHaveBeenCalled();
  });
});
