import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';
import {
  LiveTranslationController,
  TranslationAdminGuard,
} from './live-translation.controller';
import { LiveTranslationService } from './live-translation.service';

describe('Translation administration', () => {
  it('allows anonymous discovery without exposing authenticated or administrator routes', async () => {
    const status = { active: false, audienceUrl: null, expiresAt: null };
    const module = await Test.createTestingModule({
      controllers: [LiveTranslationController],
      providers: [
        TranslationAdminGuard,
        {
          provide: LiveTranslationService,
          useValue: { status: jest.fn().mockResolvedValue(status) },
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({ NODE_ENV: 'production' }),
        },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.useGlobalGuards(
      new AuthGuard(new Reflector(), {
        authenticate: async () => {
          throw new UnauthorizedException();
        },
      } as unknown as AuthService),
    );
    await app.init();
    try {
      await request(app.getHttpServer())
        .get('/live-translation/public-status')
        .expect(200)
        .expect(status);
      await request(app.getHttpServer())
        .get('/live-translation/status')
        .expect(401);
      await request(app.getHttpServer())
        .get('/live-translation/download')
        .expect(401);
      await request(app.getHttpServer())
        .post('/live-translation/credential')
        .expect(401);
    } finally {
      await app.close();
    }
  });
  it('limits administration to admin and super admin roles', () => {
    const guard = new TranslationAdminGuard();
    const context = (roles?: string[]) =>
      ({
        switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
      }) as unknown as ExecutionContext;
    for (const roles of [undefined, [], ['PASTOR'], ['MEMBER']])
      expect(() => guard.canActivate(context(roles))).toThrow(
        ForbiddenException,
      );
    expect(guard.canActivate(context(['ADMIN']))).toBe(true);
    expect(guard.canActivate(context(['SUPER_ADMIN']))).toBe(true);
  });
  it('never streams packaged binaries through production functions', () => {
    const controller = new LiveTranslationController(
      {} as LiveTranslationService,
      new ConfigService({
        NODE_ENV: 'production',
        TRANSLATION_APP_DOWNLOAD_URL: 'https://downloads.example/ponte.zip',
      }),
    );
    expect(controller.download()).toEqual({
      url: 'https://downloads.example/ponte.zip',
      localAvailable: false,
    });
    expect(() => controller.archive()).toThrow();
  });
});
