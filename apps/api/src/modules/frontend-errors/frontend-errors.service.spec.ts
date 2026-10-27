import { ConfigService } from '@nestjs/config';
import { BirdEmailService } from '../email/bird-email.service';
import { PrismaService } from '../../database/prisma.service';
import { FrontendErrorsService } from './frontend-errors.service';

describe('FrontendErrorsService version context', () => {
  it('persists the client version and accepts older clients without a version', async () => {
    const create = jest.fn().mockResolvedValue({});
    const db = {
      frontendErrorReport: {
        create,
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService;
    const service = new FrontendErrorsService(
      db,
      { configured: false } as BirdEmailService,
      new ConfigService(),
    );
    const report = {
      occurredAt: '2026-10-23T18:00:00.000Z',
      eventType: 'api',
      message: 'HTTP 503',
      route: '/reimbursements',
    };
    await service.create({
      ...report,
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
    await expect(service.create(report)).resolves.toEqual({ accepted: true });
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ device: undefined }),
      }),
    );
  });
});

describe('Frontend error alerts', () => {
  const report = {
    id: 'report-1',
    message: '<script>broken</script>',
    occurredAt: new Date('2026-10-27T12:00:00Z'),
    device: { appVersion: '1.1.1' },
    stack: 'trace',
    logs: [{ message: 'context' }],
  };
  function setup() {
    const create = jest.fn().mockResolvedValue(report);
    const db = {
      frontendErrorReport: {
        create,
        deleteMany: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const send = jest.fn().mockResolvedValue(undefined);
    const service = new FrontendErrorsService(
      db,
      { configured: true, send } as unknown as BirdEmailService,
      new ConfigService({ FRONTEND_ERROR_EMAIL_TO: 'alerts@example.test' }),
    );
    return { service, send, create };
  }
  const dto = {
    occurredAt: '2026-10-27T12:00:00Z',
    eventType: 'runtime',
    message: 'error',
    route: '/',
  };
  it('emails all saved details as escaped HTML after persistence', async () => {
    const { service, send, create } = setup();
    await service.create(dto);
    const message = send.mock.calls[0]![0];
    expect(message.to).toBe('alerts@example.test');
    expect(message.html).toContain('<table');
    expect(message.html).toContain('&lt;script&gt;broken&lt;/script&gt;');
    expect(message.html).not.toContain('<script>');
    for (const field of Object.keys(report))
      expect(message.html).toContain(field);
    expect(message.text).toContain('1.1.1');
    expect(message.idempotencyKey).toBe('frontend-error-report-1');
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(
      send.mock.invocationCallOrder[0]!,
    );
  });
  it('accepts persisted errors even when delivery fails', async () => {
    const { service, send } = setup();
    send.mockRejectedValue(new Error('provider unavailable'));
    await expect(service.create(dto)).resolves.toEqual({ accepted: true });
  });
  it.each([401, 403])('persists HTTP %i without sending an email', async (apiStatus) => {
    const { service, send, create } = setup();
    await expect(
      service.create({ ...dto, eventType: 'api', apiStatus }),
    ).resolves.toEqual({ accepted: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ apiStatus }),
      }),
    );
    expect(send).not.toHaveBeenCalled();
  });
  it.each([400, 404, 429, 500, 503])('continues emailing HTTP %i', async (apiStatus) => {
    const { service, send } = setup();
    await service.create({ ...dto, eventType: 'api', apiStatus });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not send when saving fails', async () => {
    const { service, send, create } = setup();
    create.mockRejectedValue(new Error('database unavailable'));
    await expect(service.create(dto)).rejects.toThrow('database unavailable');
    expect(send).not.toHaveBeenCalled();
  });
});
