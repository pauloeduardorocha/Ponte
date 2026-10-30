import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { BirdEmailService } from '../email/bird-email.service';
import { PrismaService } from '../../database/prisma.service';
import { FrontendErrorsService } from './frontend-errors.service';

const dto = {
  occurredAt: '2026-10-23T18:00:00.000Z',
  eventType: 'api',
  message: 'HTTP 503',
  route: '/reimbursements',
};

async function setup() {
  const create = jest.fn().mockResolvedValue({ id: 'report-1' });
  const send = jest.fn().mockRejectedValue(new Error('must never send'));
  const module = await Test.createTestingModule({
    providers: [
      FrontendErrorsService,
      {
        provide: PrismaService,
        useValue: {
          frontendErrorReport: {
            create,
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        },
      },
      { provide: BirdEmailService, useValue: { configured: true, send } },
      {
        provide: ConfigService,
        useValue: new ConfigService({
          FRONTEND_ERROR_EMAIL_TO: 'alerts@example.test',
        }),
      },
    ],
  }).compile();
  return { service: module.get(FrontendErrorsService), create, send };
}

describe('Frontend error persistence with emails suspended', () => {
  it('preserves the original client version and accepts unversioned clients', async () => {
    const { service, create } = await setup();
    await service.create({
      ...dto,
      device: { appVersion: '0.1.1', os: 'Android' },
    });
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          device: { appVersion: '0.1.1', os: 'Android' },
        }),
      }),
    );
    await expect(service.create(dto)).resolves.toEqual({ accepted: true });
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ device: undefined }),
      }),
    );
  });
  it.each([401, 403])(
    'accepts but does not persist HTTP %s from any client',
    async (apiStatus) => {
      const { service, create, send } = await setup();
      await expect(
        service.create({ ...dto, apiStatus }, 'authenticated-user'),
      ).resolves.toEqual({ accepted: true });
      await expect(
        service.create({ ...dto, apiStatus, device: { appVersion: '0.1.1' } }),
      ).resolves.toEqual({ accepted: true });
      expect(create).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    },
  );
  it.each([0, 400, 404, 429, 500, 503, undefined])(
    'persists HTTP %s without email even with a configured provider',
    async (apiStatus) => {
      const { service, create, send } = await setup();
      await expect(service.create({ ...dto, apiStatus })).resolves.toEqual({
        accepted: true,
      });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ apiStatus }),
        }),
      );
      expect(send).not.toHaveBeenCalled();
    },
  );
  it.each(['runtime', 'console', 'unhandled_rejection'])(
    'never emails %s errors',
    async (eventType) => {
      const { service, send } = await setup();
      await expect(service.create({ ...dto, eventType })).resolves.toEqual({
        accepted: true,
      });
      expect(send).not.toHaveBeenCalled();
    },
  );
  it('preserves the authenticated user ID and server network context', async () => {
    const { service, create } = await setup();
    const network = {
      ipAddress: '192.0.2.10',
      ipSource: 'connection' as const,
    };
    await service.create(
      { ...dto, device: { appVersion: '0.1.1' } },
      'authenticated-user',
      network,
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'authenticated-user',
          device: { appVersion: '0.1.1', network },
        }),
      }),
    );
  });
  it('propagates persistence failures without sending emails', async () => {
    const { service, create, send } = await setup();
    create.mockRejectedValue(new Error('database unavailable'));
    await expect(service.create(dto)).rejects.toThrow('database unavailable');
    expect(send).not.toHaveBeenCalled();
  });
});
