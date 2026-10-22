import 'reflect-metadata';
import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LibraryService } from '../src/modules/library/library.service';
import { LibraryController } from '../src/modules/library/library.controller';
import { PrismaService } from '../src/database/prisma.service';
import { PageQuery } from '../src/modules/members/member.dto';
import {
  LibraryPageQuery,
  BookQuery,
  CopyQuery,
  LoanQuery,
  LibraryQuery,
} from '../src/modules/library/library.dto';
import { PERMISSION_ANY_KEY } from '../src/modules/auth/permission.decorator';

function fixture() {
  const payments = Array.from({ length: 43 }, (_, id) => ({
    id: `payment-${id}`,
  }));
  const adjustments = Array.from({ length: 2 }, (_, id) => ({
    id: `adjustment-${id}`,
  }));
  const movementModel = (rows: { id: string }[]) => ({
    findMany: jest.fn(async ({ skip, take }) => rows.slice(skip, skip + take)),
    count: jest.fn(async () => rows.length),
  });
  const tx = {
    $executeRaw: jest.fn(),
    librarySettings: { upsert: jest.fn().mockResolvedValue({ holdDays: 2 }) },
    loan: { findMany: jest.fn().mockResolvedValue([]) },
    reservation: { findMany: jest.fn().mockResolvedValue([]) },
    fine: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'fine1' }) },
    finePayment: movementModel(payments),
    fineAdjustment: movementModel(adjustments),
  };
  const db = {
    $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
  };
  return { service: new LibraryService(db as unknown as PrismaService), tx };
}

describe('Paginated fine movements', () => {
  it('allows fine readers and private history readers, without granting catalog readers access', () => {
    expect(
      Reflect.getMetadata(
        PERMISSION_ANY_KEY,
        LibraryController.prototype.fineHistory,
      ),
    ).toEqual(['LIBRARY_FINE_READ', 'LIBRARY_HISTORY_READ']);
  });
  it('keeps independent totals and returns every movement across bounded pages without duplicates', async () => {
    const { service, tx } = fixture();
    const pages: Awaited<ReturnType<LibraryService['fineHistory']>>[] = [];
    for (let page = 1; page <= 3; page++) {
      pages.push(
        await service.fineHistory(
          'fine1',
          Object.assign(new PageQuery(), { page }),
        ),
      );
    }
    expect(pages.map((p) => p.payments.length)).toEqual([20, 20, 3]);
    expect(pages.map((p) => p.adjustments.length)).toEqual([2, 0, 0]);
    expect(
      new Set(pages.flatMap((p) => p.payments.map((p) => p.id))).size,
    ).toBe(43);
    expect(pages[1]).toMatchObject({
      totalPayments: 43,
      totalAdjustments: 2,
      page: 2,
      pageSize: 20,
    });
    expect(tx.finePayment.findMany).toHaveBeenNthCalledWith(2, {
      where: { fineId: 'fine1' },
      skip: 20,
      take: 20,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(tx.fineAdjustment.count).toHaveBeenCalledWith({
      where: { fineId: 'fine1' },
    });
  });
  it('defaults every library query to 10 and accepts an explicit size without changing other modules', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    for (const metatype of [
      LibraryPageQuery,
      BookQuery,
      CopyQuery,
      LoanQuery,
      LibraryQuery,
    ]) {
      expect(
        await pipe.transform({}, { type: 'query', metatype }),
      ).toMatchObject({ page: 1, pageSize: 10 });
      expect(
        await pipe.transform({ pageSize: '50' }, { type: 'query', metatype }),
      ).toMatchObject({ pageSize: 50 });
      await expect(
        pipe.transform({ pageSize: '101' }, { type: 'query', metatype }),
      ).rejects.toThrow();
    }
    expect(new PageQuery().pageSize).toBe(20);
    const { service } = fixture();
    expect((await service.fineHistory('fine1')).payments).toHaveLength(10);
  });
  it('returns 404 for a missing fine', async () => {
    const { service, tx } = fixture();
    tx.fine.findUniqueOrThrow.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Missing', {
        code: 'P2025',
        clientVersion: '6.19.0',
      }),
    );
    await expect(service.fineHistory('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.finePayment.findMany).not.toHaveBeenCalled();
  });
  it.each([{ page: 0 }, { pageSize: 101 }, { pageSize: -1 }, { page: 'bad' }])(
    'rejects invalid pagination %j',
    async (query) => {
      const pipe = new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      await expect(
        pipe.transform(query, { type: 'query', metatype: PageQuery }),
      ).rejects.toThrow();
    },
  );
});
