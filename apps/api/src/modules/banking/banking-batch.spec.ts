import { BankingService } from './banking.service';
import { Prisma } from '@prisma/client';
import { BankImportTimeoutException } from '../../common/bank-import-timeout.exception';
import {
  ParsedBankTransaction,
  transactionFingerprint,
} from './statement.parsers';

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
    const rows: ParsedBankTransaction[] = Array.from(
      { length: 434 },
      (_, i) => ({
        date: '2026-10-12',
        amount: `${i + 1}.00`,
        direction: i % 2 ? 'CREDIT' : 'DEBIT',
        description: 'Movement',
        reference: '',
        bankIdentifier: null,
        account: null,
        currency: 'EUR',
        rowNumber: i + 1,
      }),
    );
    // Separate statement rows without unique identifiers must all be registered.
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
    return { service, tx, rows };
  };
  const upload = (service: BankingService) =>
    service.upload(
      'account',
      {
        size: 4,
        buffer: Buffer.from('file'),
        originalname: 'statement.xlsx',
      } as never,
      { id: 'user' } as never,
    );
  const previous = (
    row: ParsedBankTransaction,
    id = 'previous',
    importId = 'older',
  ) => ({
    ...row,
    id,
    importId,
    date: new Date(row.date),
    amount: new Prisma.Decimal(row.amount),
    fingerprint: transactionFingerprint('account', row),
  });
  it('batches all 435 separate statement rows while preserving accounting links', async () => {
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
      status: 'RECONCILED',
      duplicateReason: null,
    });
    expect(tx.bankTransaction.createMany).toHaveBeenCalledTimes(1);
    expect(tx.income.createMany.mock.calls[0]![0].data).toHaveLength(217);
    expect(tx.expense.createMany.mock.calls[0]![0].data).toHaveLength(218);
    const reconciliations =
      tx.bankReconciliation.createMany.mock.calls[0]![0].data;
    expect(reconciliations).toHaveLength(435);
    expect(
      new Set(
        reconciliations.map(
          (r: { bankTransactionId: string }) => r.bankTransactionId,
        ),
      ).size,
    ).toBe(435);
    expect(tx.auditLog.createMany.mock.calls[0]![0].data).toHaveLength(435);
  });
  it('registers same-day equal payments to different recipients and repeated statement lines', async () => {
    const { service, tx, rows } = setup();
    const first = { ...rows[0]!, description: 'Transfer to Recipient A' };
    rows.splice(
      0,
      rows.length,
      first,
      { ...first, description: 'Transfer to Recipient B' },
      { ...first },
    );
    await upload(service);
    expect(
      tx.bankTransaction.createMany.mock.calls[0]![0].data.map(
        (r: { status: string }) => r.status,
      ),
    ).toEqual(['RECONCILED', 'RECONCILED', 'RECONCILED']);
    expect(tx.expense.createMany.mock.calls[0]![0].data).toHaveLength(3);
  });
  it('does not let a stored fingerprint or shared reference override different descriptions', async () => {
    const { service, tx, rows } = setup();
    const row = {
      ...rows[0]!,
      description: 'Recipient B',
      reference: 'TRANSFER',
    };
    rows.splice(0, rows.length, row);
    tx.bankTransaction.findMany.mockResolvedValue([
      { ...previous(row), description: 'Recipient A' },
    ]);
    await upload(service);
    expect(tx.bankTransaction.createMany.mock.calls[0]![0].data[0].status).toBe(
      'RECONCILED',
    );
    expect(tx.expense.createMany.mock.calls[0]![0].data).toHaveLength(1);
  });
  it('reviews an overlapping statement using the original description, including legacy hashes', async () => {
    const { service, tx, rows } = setup();
    const row = { ...rows[0]!, description: 'Transferencia Joao' };
    rows.splice(0, rows.length, row);
    tx.bankTransaction.findMany.mockResolvedValue([
      {
        ...previous(row),
        description: 'TRANSFERÊNCIA  JOÃO',
        fingerprint: 'legacy-hash',
      },
    ]);
    await upload(service);
    expect(
      tx.bankTransaction.createMany.mock.calls[0]![0].data[0],
    ).toMatchObject({
      status: 'POSSIBLE_DUPLICATE',
      duplicateReason: expect.stringContaining('previous'),
    });
    expect(tx.expense.createMany).not.toHaveBeenCalled();
    expect(tx.bankReconciliation.createMany).not.toHaveBeenCalled();
    expect(tx.bankTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'REJECTED' } }),
      }),
    );
  });
  it.each([1, 2])(
    'matches %i prior occurrences once across overlapping historical imports',
    async (occurrences) => {
      const { service, tx, rows } = setup();
      const row = { ...rows[0]! };
      rows.splice(0, rows.length, row, { ...row });
      tx.bankTransaction.findMany.mockResolvedValue(
        ['older', 'overlapping'].flatMap((importId) =>
          Array.from({ length: occurrences }, (_, i) =>
            previous(row, `${importId}-${i}`, importId),
          ),
        ),
      );
      await upload(service);
      expect(
        tx.bankTransaction.createMany.mock.calls[0]![0].data.map(
          (r: { status: string }) => r.status,
        ),
      ).toEqual(
        occurrences === 1
          ? ['POSSIBLE_DUPLICATE', 'RECONCILED']
          : ['POSSIBLE_DUPLICATE', 'POSSIBLE_DUPLICATE'],
      );
      if (occurrences === 1)
        expect(tx.expense.createMany.mock.calls[0]![0].data).toHaveLength(1);
      else expect(tx.expense.createMany).not.toHaveBeenCalled();
    },
  );
  it('rejects a repeated bank identifier even inside the same statement', async () => {
    const { service, tx, rows } = setup();
    const row = { ...rows[0]!, bankIdentifier: 'BANK-123' };
    rows.splice(0, rows.length, row, {
      ...row,
      description: 'Changed bank memo',
    });
    await upload(service);
    expect(
      tx.bankTransaction.createMany.mock.calls[0]![0].data.map(
        (r: { status: string }) => r.status,
      ),
    ).toEqual(['RECONCILED', 'REJECTED']);
    expect(tx.expense.createMany.mock.calls[0]![0].data).toHaveLength(1);
  });
  it('keeps different unique identifiers distinct despite equal descriptions and references', async () => {
    const { service, tx, rows } = setup();
    const row = {
      ...rows[0]!,
      bankIdentifier: 'BANK-NEW',
      reference: 'TRANSFER',
    };
    rows.splice(0, rows.length, row);
    tx.bankTransaction.findMany.mockResolvedValue([
      { ...previous(row), bankIdentifier: 'BANK-OLD' },
    ]);
    await upload(service);
    expect(tx.bankTransaction.createMany.mock.calls[0]![0].data[0].status).toBe(
      'RECONCILED',
    );
  });
  it('rejects every occurrence when the identical file is uploaded again', async () => {
    const { service, tx, rows } = setup();
    const row = { ...rows[0]! };
    rows.splice(0, rows.length, row, { ...row });
    tx.bankTransaction.findMany.mockResolvedValue([
      previous(row, 'first'),
      previous(row, 'second'),
    ]);
    tx.bankImport.findFirst.mockResolvedValue({ id: 'older' });
    await upload(service);
    expect(
      tx.bankTransaction.createMany.mock.calls[0]![0].data.map(
        (r: { status: string }) => r.status,
      ),
    ).toEqual(['REJECTED', 'REJECTED']);
    expect(tx.expense.createMany).not.toHaveBeenCalled();
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
  it('blocks a repeated file even when all its original rows were rejected', async () => {
    const { service, tx, rows } = setup();
    rows.splice(1);
    tx.bankImport.findFirst.mockResolvedValue({ id: 'older' });
    await upload(service);
    expect(
      tx.bankTransaction.createMany.mock.calls[0]![0].data[0],
    ).toMatchObject({
      status: 'REJECTED',
      duplicateReason: expect.stringContaining('Duplicado ignorado'),
    });
    expect(tx.expense.createMany).not.toHaveBeenCalled();
    expect(tx.bankReconciliation.createMany).not.toHaveBeenCalled();
  });
});
