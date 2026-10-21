import type { CurrentUser } from '@church/shared';
import { PrismaService } from '../../database/prisma.service';
import { FinanceService } from './finance.service';
import { StorageService } from './storage.service';

describe('Financial dashboard bank coverage', () => {
  function setup(date: Date | null) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      bankTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _max: { date } }),
        count: jest.fn().mockResolvedValue(0),
      },
      income: { findMany: jest.fn().mockResolvedValue([]) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const db = { $transaction: jest.fn(async (callback) => callback(tx)) };
    return {
      tx,
      service: new FinanceService(
        db as unknown as PrismaService,
        {} as StorageService,
      ),
    };
  }

  it('exposes coverage to summary readers without exposing import or movement details', async () => {
    const { service, tx } = setup(new Date('2026-09-30T00:00:00Z'));
    const result = await service.dashboard(
      {
        permissions: ['FINANCE_SUMMARY_READ'],
      } as CurrentUser,
      { month: '2026-08' },
    );
    expect(result.bankDataThrough).toBe('2026-09-30');
    expect(result.latestTransactions).toEqual([]);
    expect(result).not.toHaveProperty('latestImport');
    expect(tx.income.findMany).not.toHaveBeenCalled();
  });

  it('respects the selected account and excludes incomplete or failed imports', async () => {
    const { service, tx } = setup(new Date('2026-09-30T00:00:00Z'));
    const result = await service.dashboard(
      {
        permissions: ['FINANCE_TRANSACTION_READ'],
      } as CurrentUser,
      { accountId: 'selected-account' },
    );
    expect(result.bankDataThrough).toBe('2026-09-30');
    expect(tx.bankTransaction.aggregate).toHaveBeenCalledWith({
      where: {
        import: {
          accountId: 'selected-account',
          status: { in: ['READY_FOR_REVIEW', 'CONFIRMED'] },
        },
      },
      _max: { date: true },
    });
  });

  it('returns null without imported movements', async () => {
    const { service } = setup(null);
    const result = await service.dashboard({
      permissions: ['FINANCE_SUMMARY_READ'],
    } as CurrentUser);
    expect(result.bankDataThrough).toBeNull();
  });
});
