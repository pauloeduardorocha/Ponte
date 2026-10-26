import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import { BirdEmailService } from '../email/bird-email.service';
import { AuthService, RECOVERY_MESSAGE } from './auth.service';
import { BirdPasswordResetDelivery } from './password-reset.delivery';

describe('Bird password recovery flow (mocked HTTP and database)', () => {
  const configValues = {
    BIRD_API_KEY: 'bk_eu1_test-key',
    PUBLIC_WEB_URL: 'https://ponte.example.org',
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
  };
  const user = {
    id: 'user-id',
    email: 'member@example.org',
    status: 'ACTIVE',
    deletedAt: null,
  };
  const db = {
    user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    passwordReset: { updateMany: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let errorLog: jest.SpiedFunction<Logger['error']>;
  let warnLog: jest.SpiedFunction<Logger['warn']>;
  const setup = (values = {}) => {
    const config = new ConfigService({ ...configValues, ...values });
    const delivery = new BirdPasswordResetDelivery(
      config,
      new BirdEmailService(config),
    );
    return {
      delivery,
      auth: new AuthService(
        db as unknown as PrismaService,
        new JwtService(),
        config,
        delivery,
      ),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ ...user });
    db.user.findUniqueOrThrow.mockResolvedValue({ ...user });
    db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn(db),
    );
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 202 }));
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(['ACTIVE', 'PENDING_APPROVAL'])(
    'emails a reset link only after persisting its hash for an eligible %s account',
    async (status) => {
      db.user.findUnique.mockResolvedValue({ ...user, status });
      db.user.findUniqueOrThrow.mockResolvedValue({ ...user, status });
      let committed = false;
      db.$transaction.mockImplementation(
        async (fn: (tx: unknown) => unknown) => {
          const result = await fn(db);
          committed = true;
          return result;
        },
      );
      fetchMock.mockImplementation(async () => {
        expect(committed).toBe(true);
        return new Response(null, { status: 202 });
      });
      const { auth } = setup();
      const started = Date.now();
      await expect(auth.forgotPassword(user.email)).resolves.toEqual(
        RECOVERY_MESSAGE,
      );
      const payload = JSON.parse(fetchMock.mock.calls[0]![1]?.body as string);
      const link = new URL(payload.text.match(/https:\/\/\S+/)[0]);
      expect(link.origin).toBe(configValues.PUBLIC_WEB_URL);
      expect(link.pathname).toBe('/reset-password');
      const token = link.searchParams.get('token')!;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(payload.to).toEqual([user.email]);
      expect(payload.html).toContain(`href="${link.toString()}"`);
      expect(payload.html).toContain('Redefinir a senha');
      const stored = db.passwordReset.create.mock.calls[0][0].data;
      expect(stored.tokenHash).toBe(auth.hashToken(token));
      expect(stored).not.toHaveProperty('token');
      expect(stored.expiresAt.getTime()).toBeGreaterThanOrEqual(
        started + 30 * 60_000,
      );
      expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 30 * 60_000,
      );
      expect(db.passwordReset.updateMany).toHaveBeenCalledWith({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(db.auditLog.create).toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    { ...user, status: 'DISABLED' },
    { ...user, deletedAt: new Date() },
  ])(
    'returns the same message without sending for an ineligible account',
    async (account) => {
      db.user.findUnique.mockResolvedValue(account);
      await expect(setup().auth.forgotPassword(user.email)).resolves.toEqual(
        RECOVERY_MESSAGE,
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(db.passwordReset.create).not.toHaveBeenCalled();
    },
  );

  it('checks eligibility again inside the locked transaction', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({
      ...user,
      status: 'DISABLED',
    });
    await expect(setup().auth.forgotPassword(user.email)).resolves.toEqual(
      RECOVERY_MESSAGE,
    );
    expect(db.passwordReset.create).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never sends a token when the database transaction fails', async () => {
    db.$transaction.mockRejectedValue(new Error('database failed'));
    await expect(setup().auth.forgotPassword(user.email)).rejects.toThrow(
      'database failed',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps provider failures private and returns the generic public response', async () => {
    fetchMock.mockRejectedValue(new Error('private email, token and API key'));
    await expect(setup().auth.forgotPassword(user.email)).resolves.toEqual(
      RECOVERY_MESSAGE,
    );
    expect(errorLog.mock.calls).toEqual([
      ['Password recovery email could not be sent.'],
    ]);
  });

  it('warns without exposing personal data when no key is configured', async () => {
    await expect(
      setup({ BIRD_API_KEY: '' }).auth.forgotPassword(user.email),
    ).resolves.toEqual(RECOVERY_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnLog.mock.calls).toEqual([
      [
        'Password recovery requested; Bird email delivery is not configured. No message was sent.',
      ],
    ]);
  });

  it.each([
    '',
    'not-a-url',
    'http://ponte.example.org',
    'http://localhost:5173',
    'https://name:secret@ponte.example.org',
    'https://ponte.example.org?token=other',
    'https://ponte.example.org#fragment',
    'javascript:alert(1)',
  ])('refuses an unsafe production frontend URL (%s)', async (url) => {
    await expect(
      setup({ PUBLIC_WEB_URL: url }).delivery.send({
        email: user.email,
        token: 'private-token',
        expiresAt: new Date(),
      }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports local development URLs and encodes tokens in HTML links', async () => {
    await setup({
      NODE_ENV: 'development',
      PUBLIC_WEB_URL: 'http://localhost:5173/',
    }).delivery.send({
      email: user.email,
      token: 'a&"<token>',
      expiresAt: new Date(),
    });
    const payload = JSON.parse(fetchMock.mock.calls[0]![1]?.body as string);
    expect(payload.html).toContain(
      'http://localhost:5173/reset-password?token=a%26%22%3Ctoken%3E',
    );
    expect(payload.html).not.toContain('a&"<token>');
  });
});
