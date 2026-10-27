import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

describe('Account preferences HTTP contract', () => {
  let app: INestApplication;
  const user = {
    id: '63b80123-eefa-4f48-a877-6cfdcdd4b724',
    colorMode: 'light',
    pushReimbursementRequested: true,
    pushEventRefundRequested: true,
    pushLibraryOverdue: true,
    pushLibraryReservationReady: true,
    pushBirthdays: true,
  };
  const update = jest.fn(async ({ data }: { data: Partial<typeof user> }) => {
    Object.assign(
      user,
      Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      ),
    );
    return {
      colorMode: user.colorMode,
      pushReimbursementRequested: user.pushReimbursementRequested,
      pushEventRefundRequested: user.pushEventRefundRequested,
      pushLibraryOverdue: user.pushLibraryOverdue,
      pushLibraryReservationReady: user.pushLibraryReservationReady,
      pushBirthdays: user.pushBirthdays,
    };
  });
  const db = {
    $transaction: (fn: (tx: unknown) => unknown) => fn({ user: { update } }),
  };
  const auth = {
    authenticate: jest.fn(async () => ({ user, sessionId: 'session' })),
    updatePreferences: (id: string, preferences: Partial<typeof user>) =>
      AuthService.prototype.updatePreferences.call(
        { db } as never,
        id,
        preferences,
      ),
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
    Object.assign(user, {
      colorMode: 'light',
      pushReimbursementRequested: true,
      pushEventRefundRequested: true,
      pushLibraryOverdue: true,
      pushLibraryReservationReady: true,
      pushBirthdays: true,
    });
  });

  it.each(['system', 'dark', 'light'])(
    'saves color mode %s only for the authenticated user',
    async (colorMode) => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/auth/preferences')
        .set('Authorization', 'Bearer access')
        .send({ colorMode })
        .expect(200)
        .expect('Cache-Control', 'no-store');
      expect(response.body).toMatchObject({
        colorMode,
        pushReimbursementRequested: true,
        pushLibraryOverdue: true,
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { colorMode },
        select: {
          colorMode: true,
          pushReimbursementRequested: true,
          pushEventRefundRequested: true,
          pushLibraryOverdue: true,
          pushLibraryReservationReady: true,
          pushBirthdays: true,
        },
      });
    },
  );

  it('saves a push preference without changing the other preferences', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/auth/preferences')
      .set('Authorization', 'Bearer access')
      .send({ pushLibraryOverdue: false })
      .expect(200);
    expect(response.body).toMatchObject({
      colorMode: 'light',
      pushReimbursementRequested: true,
      pushLibraryOverdue: false,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { pushLibraryOverdue: false },
      select: {
        colorMode: true,
        pushReimbursementRequested: true,
        pushEventRefundRequested: true,
        pushLibraryOverdue: true,
        pushLibraryReservationReady: true,
        pushBirthdays: true,
      },
    });
  });

  it.each([
    { colorMode: 'auto' },
    { colorMode: null },
    { pushLibraryOverdue: 'false' },
    { pushBirthdays: 'false' },
    { pushBirthdays: null },
    { colorMode: 'dark', userId: 'someone-else' },
  ])('rejects an invalid body %j', async (body) => {
    await request(app.getHttpServer())
      .patch('/api/v1/auth/preferences')
      .set('Authorization', 'Bearer access')
      .send(body)
      .expect(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('saves birthday opt-out', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/auth/preferences')
      .set('Authorization', 'Bearer access')
      .send({ pushBirthdays: false })
      .expect(200);
    expect(response.body).toMatchObject({
      pushBirthdays: false,
      pushLibraryOverdue: true,
    });
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/auth/preferences')
      .send({ pushLibraryOverdue: false })
      .expect(401);
    expect(update).not.toHaveBeenCalled();
  });
});
