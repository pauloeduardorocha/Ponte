import { BankingService } from './banking.service';

describe('movement descriptions', () => {
  it.each(['CREDIT', 'DEBIT'])(
    'updates the %s ledger while preserving the statement description',
    async (direction) => {
      const row = {
        id: 'movement',
        description: 'Original statement',
        customDescription: null,
        direction,
        status: 'RECONCILED',
        memberId: null,
        import: { status: 'CONFIRMED', accountId: 'account' },
      };
      const tx = {
        $executeRaw: jest.fn(),
        bankTransaction: {
          findMany: jest.fn().mockResolvedValue([row]),
          update: jest
            .fn()
            .mockImplementation(({ data }) => ({ ...row, ...data })),
        },
        financialCategory: {
          findUnique: jest
            .fn()
            .mockResolvedValue({
              kind: direction === 'CREDIT' ? 'INCOME' : 'EXPENSE',
            }),
        },
        income: {
          findFirstOrThrow: jest
            .fn()
            .mockResolvedValue({ id: 'income', contribution: null }),
          update: jest.fn(),
        },
        expense: { updateMany: jest.fn() },
        auditLog: { create: jest.fn() },
      };
      const service = new BankingService(
        { $transaction: (fn: (client: unknown) => unknown) => fn(tx) } as never,
        {} as never,
        {} as never,
      );
      const classify = (customDescription: string | null | undefined) =>
        service.classify(
          {
            ids: ['movement'],
            classification: direction === 'CREDIT' ? 'INCOME' : 'EXPENSE',
            categoryId: 'category',
            customDescription,
          },
          { id: 'user', permissions: [] } as never,
        );
      await classify('  Community offering  ');
      expect(tx.bankTransaction.update.mock.calls[0][0].data).toMatchObject({
        customDescription: 'Community offering',
      });
      expect(
        tx.bankTransaction.update.mock.calls[0][0].data,
      ).not.toHaveProperty('description');
      const ledgerUpdate =
        direction === 'CREDIT' ? tx.income.update : tx.expense.updateMany;
      expect(ledgerUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: 'Community offering' }),
        }),
      );
      await classify(null);
      expect(ledgerUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: 'Original statement' }),
        }),
      );
      row.customDescription = 'Saved description' as never;
      await classify(undefined);
      expect(ledgerUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: 'Saved description' }),
        }),
      );
    },
  );
});
