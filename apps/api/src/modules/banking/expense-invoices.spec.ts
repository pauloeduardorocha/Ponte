import { Prisma } from '@prisma/client';
import type { CurrentUser } from '@church/shared';
import { InvoicesService } from './invoices.service';
import { FinanceService } from '../finance/finance.service';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../finance/storage.service';

describe('Expense documents', () => {
  it('excludes expenses documented directly or through their bank movement', async () => {
    const expense = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    const service = new FinanceService(
      { expense } as unknown as PrismaService,
      {} as StorageService,
    );
    await service.expenses({ page: 1, pageSize: 20, missingDocument: 'true' });
    expect(expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          attachments: { none: {} },
          invoices: { none: {} },
          OR: [
            { bankTransactionId: null },
            {
              bankTransaction: {
                attachments: { none: {} },
                invoices: { none: {} },
              },
            },
          ],
        }),
      }),
    );
    expect(expense.count.mock.calls[0][0].where).toEqual(
      expense.findMany.mock.calls[0][0].where,
    );
  });
  function setup(currency = 'EUR', associated = false) {
    const tx = {
      $executeRaw: jest.fn(),
      expense: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'expense',
            amount: new Prisma.Decimal(20),
            date: new Date('2026-10-14'),
            description: 'Loja',
            account: { currency },
          }),
      },
      financialInvoice: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'invoice',
            currency: 'EUR',
            amount: new Prisma.Decimal(20),
            bankTransactionId: associated ? 'bank' : null,
            expenseId: null,
          }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'invoice', expenseId: 'expense' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const db = {
      ...tx,
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    return {
      tx,
      service: new InvoicesService(
        db as unknown as PrismaService,
        {} as StorageService,
      ),
    };
  }
  it('associates an invoice directly to a manual expense', async () => {
    const { tx, service } = setup();
    await service.associate(
      'invoice',
      'expense',
      { id: 'actor' } as CurrentUser,
      true,
    );
    expect(tx.financialInvoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expenseId: 'expense',
          bankTransactionId: null,
          associatedBy: 'actor',
        }),
      }),
    );
  });
  it('rejects a currency mismatch', async () => {
    const { tx, service } = setup('BRL');
    await expect(
      service.associate(
        'invoice',
        'expense',
        { id: 'actor' } as CurrentUser,
        true,
      ),
    ).rejects.toThrow('Moeda ou direção incompatível');
    expect(tx.financialInvoice.update).not.toHaveBeenCalled();
  });
  it('preserves an existing bank association', async () => {
    const { tx, service } = setup('EUR', true);
    await expect(
      service.associate(
        'invoice',
        'expense',
        { id: 'actor' } as CurrentUser,
        true,
      ),
    ).rejects.toThrow('Fatura já associada');
    expect(tx.financialInvoice.update).not.toHaveBeenCalled();
  });
  it('suggests only unassociated invoices with the expense currency and amount', async () => {
    const { tx, service } = setup();
    await service.suggestions('expense', true);
    expect(tx.financialInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bankTransactionId: null,
          expenseId: null,
          currency: 'EUR',
          amount: new Prisma.Decimal(20),
        }),
      }),
    );
  });
});
