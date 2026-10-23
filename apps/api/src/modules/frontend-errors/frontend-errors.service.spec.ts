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
    const service = new FrontendErrorsService(db);
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
