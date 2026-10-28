import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { FrontendErrorsController } from './frontend-errors.controller';
import { FrontendErrorsService } from './frontend-errors.service';

describe('Frontend errors network ingestion', () => {
  it('associates the authenticated account ID rather than the member or session ID', async () => {
    const create = jest.fn().mockResolvedValue({ accepted: true });
    const authenticate = jest
      .fn()
      .mockResolvedValue({
        user: { id: 'account-id', memberId: 'member-id' },
        sessionId: 'session-id',
      });
    const controller = new FrontendErrorsController(
      { create } as unknown as FrontendErrorsService,
      { authenticate } as unknown as AuthService,
    );
    const dto = {
      eventType: 'api',
      message: 'Network failure',
      occurredAt: '2026-10-28T12:00:00Z',
      route: '/',
    };
    await controller.create(dto, 'Bearer verified-token', {
      headers: {},
      socket: {},
    } as Request);
    expect(authenticate).toHaveBeenCalledWith('verified-token');
    expect(create).toHaveBeenCalledWith(dto, 'account-id', expect.any(Object));
  });
  const original = process.env;
  afterEach(() => {
    process.env = original;
  });
  it.each(['production', 'preview'])(
    'uses Vercel context in %s without trusting an expired session',
    async (environment) => {
      process.env = { ...original, VERCEL: '1', VERCEL_ENV: environment };
      const create = jest.fn().mockResolvedValue({ accepted: true });
      const authenticate = jest.fn().mockRejectedValue(new Error('expired'));
      const controller = new FrontendErrorsController(
        { create } as unknown as FrontendErrorsService,
        { authenticate } as unknown as AuthService,
      );
      const dto = {
        eventType: 'api',
        message: '401',
        occurredAt: '2026-10-27T12:00:00Z',
        route: '/',
      };
      const request = {
        headers: {
          'x-vercel-forwarded-for': '198.51.100.1',
          'x-vercel-ip-country': 'PT',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as Request;
      await expect(
        controller.create(dto, 'Bearer expired', request),
      ).resolves.toEqual({ accepted: true });
      expect(create).toHaveBeenCalledWith(dto, undefined, {
        ipAddress: '198.51.100.1',
        ipSource: 'vercel',
        geo: { source: 'vercel', country: 'PT' },
      });
    },
  );
  it('does not trust proxy headers under local Vercel development', async () => {
    process.env = { ...original, VERCEL: '1', VERCEL_ENV: 'development' };
    const create = jest.fn().mockResolvedValue({ accepted: true });
    const controller = new FrontendErrorsController(
      { create } as unknown as FrontendErrorsService,
      {} as AuthService,
    );
    const request = {
      headers: { 'x-vercel-forwarded-for': '198.51.100.1' },
      socket: { remoteAddress: '::1' },
    } as unknown as Request;
    await controller.create(
      {
        eventType: 'runtime',
        message: 'error',
        occurredAt: '2026-10-27T12:00:00Z',
        route: '/',
      },
      undefined,
      request,
    );
    expect(create.mock.calls[0]![2]).toEqual({
      ipAddress: '::1',
      ipSource: 'connection',
    });
  });
});
