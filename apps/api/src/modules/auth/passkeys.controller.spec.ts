import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasskeysController } from './passkeys.controller';
import { PasskeysService } from './passkeys.service';

describe('Passkey HTTP contract', () => {
  let app: INestApplication;
  const origin = 'https://ponte.example';
  const user = { id: '63b80123-eefa-4f48-a877-6cfdcdd4b724' };
  const db = {};
  const auth = {
    authenticate: jest.fn().mockResolvedValue({ user, sessionId: 'session' }),
  };
  const service = {
    origin: (value: string) =>
      new PasskeysService(
        db as never,
        auth as never,
        new ConfigService({ CORS_ORIGIN: origin }),
      ).origin(value),
    authenticationOptions: jest
      .fn()
      .mockResolvedValue({
        challengeId: '63b80123-eefa-4f48-a877-6cfdcdd4b725',
        options: { challenge: 'random' },
      }),
    list: jest.fn().mockResolvedValue([]),
    remove: jest.fn(),
    login: jest
      .fn()
      .mockResolvedValue({
        user,
        accessToken: 'access',
        refreshToken: 'refresh-secret',
      }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [PasskeysController],
      providers: [
        { provide: PasskeysService, useValue: service },
        { provide: AuthService, useValue: auth },
        {
          provide: ConfigService,
          useValue: new ConfigService({ NODE_ENV: 'production' }),
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
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
  afterAll(async () => {
    await app.close();
  });

  it('requires authentication to list or delete passkeys', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/passkeys').expect(401);
    await request(app.getHttpServer())
      .delete('/api/v1/auth/passkeys/credential')
      .set('Origin', origin)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/passkeys')
      .set('Authorization', 'Bearer valid')
      .expect(200, []);
    expect(service.list).toHaveBeenCalledWith(user.id);
  });
  it('rejects absent or untrusted Origin and accepts public login options', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/passkeys/login/options')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/passkeys/login/options')
      .set('Origin', 'https://evil.example')
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/passkeys/login/options')
      .set('Origin', origin)
      .expect(200);
  });
  it('rejects malformed verify requests before the service', async () => {
    for (const body of [
      { challengeId: 'invalid', response: {} },
      { challengeId: '63b80123-eefa-4f48-a877-6cfdcdd4b725', response: [] },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/passkeys/login/verify')
        .set('Origin', origin)
        .send(body)
        .expect(400);
    }
    expect(service.login).not.toHaveBeenCalled();
  });
  it('returns a session and an HttpOnly secure refresh cookie without exposing refresh tokens in JSON', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/passkeys/login/verify')
      .set('Origin', origin)
      .send({
        challengeId: '63b80123-eefa-4f48-a877-6cfdcdd4b725',
        response: { id: 'credential' },
      })
      .expect(200);
    expect(result.body).toEqual({ accessToken: 'access', user });
    expect(result.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);
    expect(result.headers['set-cookie']?.[0]).toMatch(/Secure/);
    expect(result.headers['set-cookie']?.[0]).toMatch(/SameSite=Strict/);
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('deletes only with the authenticated user ID', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/auth/passkeys/credential')
      .set('Authorization', 'Bearer valid')
      .set('Origin', origin)
      .expect(204);
    expect(service.remove).toHaveBeenCalledWith(user.id, 'credential');
  });
});
