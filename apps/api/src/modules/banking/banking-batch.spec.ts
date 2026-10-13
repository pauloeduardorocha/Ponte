import { BankingService } from './banking.service';
import { Prisma } from '@prisma/client';
import { BankImportTimeoutException } from '../../common/bank-import-timeout.exception';

describe('bank import batching', () => {
  const setup = (timeout = false) => {
    const tx = {
      $executeRaw: jest.fn(),
      auditLog: { create: jest.fn(), createMany: jest.fn() },
      bankAccount: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      },
      bankImport: {
        create: jest.fn().mockResolvedValue({ id: 'import', fileHash: 'hash' }),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      bankTransaction: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      income: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      expense: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
      },
      bankReconciliation: { createMany: jest.fn() },
      financialCategory: {
        upsert: jest.fn().mockResolvedValue({ id: 'category' }),
      },
    };
    if (timeout)
      tx.bankTransaction.createMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('secret SQL', {
          code: 'P2028',
          clientVersion: 'test',
        }),
      );
    const rows = Array.from({ length: 434 }, (_, i) => ({
      date: '2026-10-12',
      amount: `${i + 1}.00`,
      direction: i % 2 ? 'CREDIT' : 'DEBIT',
      description: 'Movement',
      reference: '',
      bankIdentifier: null,
      account: null,
      currency: 'EUR',
      rowNumber: i + 1,
    }));
    // Same-file duplicates must still be found before any rows reach the database.
    rows.push({ ...rows[0]!, rowNumber: 435 });
    const service = new BankingService(
      {
        bankAccount: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ status: 'ACTIVE', currency: 'EUR' }),
        },
        $transaction: (fn: (client: unknown) => unknown) => fn(tx),
      } as never,
      {
        putValidated: jest.fn().mockResolvedValue('storage'),
        remove: jest.fn(),
      } as never,
      {
        identify: () => ({
          format: 'XLSX',
          parser: { parse: async () => rows },
        }),
      } as never,
    );
    jest
      .spyOn(service, 'importDetail')
      .mockResolvedValue({ id: 'import', status: 'CONFIRMED' } as never);
    return { service, tx };
  };
  it('batches 434 ledger entries while preserving duplicate review and links', async () => {
    const { service, tx } = setup();
    await service.upload(
      'account',
      {
        size: 34129,
        buffer: Buffer.from('file'),
        originalname: 'statement.xlsx',
      } as never,
      { id: 'user' } as never,
    );
    const movements = tx.bankTransaction.createMany.mock.calls[0]![0].data;
    expect(movements).toHaveLength(435);
    expect(movements[434]).toMatchObject({
      status: 'POSSIBLE_DUPLICATE',
      duplicateReason: expect.stringContaining(movements[0].id),
    });
    expect(tx.bankTransaction.createMany).toHaveBeenCalledTimes(1);
    expect(tx.income.createMany.mock.calls[0]![0].data).toHaveLength(217);
    expect(tx.expense.createMany.mock.calls[0]![0].data).toHaveLength(217);
    const reconciliations =
      tx.bankReconciliation.createMany.mock.calls[0]![0].data;
    expect(reconciliations).toHaveLength(434);
    expect(
      new Set(
        reconciliations.map(
          (r: { bankTransactionId: string }) => r.bankTransactionId,
        ),
      ).size,
    ).toBe(434);
    expect(tx.auditLog.createMany.mock.calls[0]![0].data).toHaveLength(434);
  });
  it('records a failed import and returns the specific timeout error', async () => {
    const { service, tx } = setup(true);
    await expect(
      service.upload(
        'account',
        {
          size: 1,
          buffer: Buffer.from('x'),
          originalname: 'statement.xlsx',
        } as never,
        { id: 'user' } as never,
      ),
    ).rejects.toBeInstanceOf(BankImportTimeoutException);
    expect(tx.bankImport.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(tx.income.createMany).not.toHaveBeenCalled();
  });
});
