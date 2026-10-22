import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { LibraryService } from '../src/modules/library/library.service';
import { LibraryController } from '../src/modules/library/library.controller';
import { PrismaService } from '../src/database/prisma.service';
import { PageQuery } from '../src/modules/members/member.dto';
import { PERMISSION_KEY } from '../src/modules/auth/permission.decorator';

function fixture() {
  const stored = {
    id: 'loan1',
    borrowedAt: new Date(),
    dueAt: new Date(),
    returnedAt: null,
    status: 'ACTIVE',
    renewedCount: 0,
    memberId: 'private-reader',
    createdBy: 'private-operator',
    observations: 'Private note',
  };
  const tx = {
    $executeRaw: jest.fn(),
    librarySettings: { upsert: jest.fn().mockResolvedValue({ holdDays: 2 }) },
    book: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'book1' }) },
    loan: {
      findMany: jest
        .fn()
        .mockImplementation(
          async (args: { select?: Record<string, boolean> }) =>
            args.select
              ? [
                  Object.fromEntries(
                    Object.entries(stored).filter(
                      ([key]) => args.select?.[key],
                    ),
                  ),
                ]
              : [],
        ),
      count: jest.fn().mockResolvedValue(41),
    },
    reservation: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const db = {
    $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
  };
  return { service: new LibraryService(db as unknown as PrismaService), tx };
}

describe('Catalog book circulation history', () => {
  it('requires catalog access without granting private library history access', () => {
    expect(
      Reflect.getMetadata(
        PERMISSION_KEY,
        LibraryController.prototype.bookHistory,
      ),
    ).toEqual(['LIBRARY_BOOK_READ']);
  });
  it('returns a bounded page across all book copies without private loan fields', async () => {
    const { service, tx } = fixture();
    const result = await service.bookHistory(
      'book1',
      Object.assign(new PageQuery(), { page: 2 }),
    );
    expect(result).toMatchObject({ total: 41, page: 2, pageSize: 20 });
    expect(Object.keys(result.items[0]!).sort()).toEqual(
      [
        'id',
        'borrowedAt',
        'dueAt',
        'returnedAt',
        'status',
        'renewedCount',
      ].sort(),
    );
    expect(tx.loan.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { bookCopy: { bookId: 'book1' } },
        skip: 20,
        take: 20,
        orderBy: [{ borrowedAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(tx.loan.count).toHaveBeenCalledWith({
      where: { bookCopy: { bookId: 'book1' } },
    });
  });
  it('returns 404 for an unknown book instead of a misleading empty history', async () => {
    const { service, tx } = fixture();
    tx.book.findUniqueOrThrow.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Missing', {
        code: 'P2025',
        clientVersion: '6.19.0',
      }),
    );
    await expect(
      service.bookHistory('missing', new PageQuery()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.loan.count).not.toHaveBeenCalled();
  });
});
