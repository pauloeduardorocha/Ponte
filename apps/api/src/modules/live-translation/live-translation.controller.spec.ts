import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LiveTranslationController,
  TranslationAdminGuard,
} from './live-translation.controller';
import { LiveTranslationService } from './live-translation.service';

describe('Translation administration', () => {
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
