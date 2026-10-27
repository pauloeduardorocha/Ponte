import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PageQuery } from '../members/member.dto';
import { AuditController } from './audit.controller';

describe('Audit frontend errors', () => {
  it('returns aggregated statistics without loading report details', async () => {
    const rows = [{ kind: 'metrics', label: 'total', count: 167 }];
    const query = jest.fn().mockResolvedValue(rows);
    const controller = new AuditController({
      $queryRaw: query,
    } as unknown as PrismaService);
    await expect(controller.frontendErrorStats()).resolves.toEqual({ rows });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('pages on the server with a stable order and total', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'error' }]);
    const count = jest.fn().mockResolvedValue(51);
    const controller = new AuditController({
      frontendErrorReport: { findMany, count },
    } as unknown as PrismaService);
    const result = await controller.frontendErrors(
      Object.assign(new PageQuery(), { page: 3, pageSize: 25 }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 50,
        take: 25,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(result).toEqual({
      items: [{ id: 'error' }],
      total: 51,
      page: 3,
      pageSize: 25,
    });
  });
  it('returns full details and rejects missing reports', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({ id: 'error', stack: 'trace' })
      .mockResolvedValueOnce(null);
    const controller = new AuditController({
      frontendErrorReport: { findUnique },
    } as unknown as PrismaService);
    await expect(controller.frontendError('error')).resolves.toEqual({
      id: 'error',
      stack: 'trace',
    });
    await expect(controller.frontendError('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
