import { Prisma } from '@prisma/client';
import type { CurrentUser } from '@church/shared';
import {
  ReimbursementsService,
  reimbursementStatus,
} from './reimbursements.service';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../finance/storage.service';

const user = { id: 'actor', permissions: [] } as unknown as CurrentUser;
const manager = {
  ...user,
  permissions: ['FINANCE_TRANSACTION_READ', 'FINANCE_TRANSACTION_UPDATE'],
} as CurrentUser;
const row = {
  id: 'request',
  deletedAt: null,
  beneficiaryName: 'Maria',
  iban: 'PT50000201231234567890154',
  categoryId: 'category',
  purpose: 'Material para crianças',
  amount: new Prisma.Decimal('25.10'),
  currency: 'EUR',
  submittedBy: user.id,
  paidAt: null as Date | null,
  bankTransactionId: null as string | null,
  attachments: [{ id: 'document', kind: 'DOCUMENT', filename: 'receipt.pdf' }],
};
const file = {
  originalname: 'receipt.pdf',
  mimetype: 'application/pdf',
  buffer: Buffer.from('%PDF-test'),
  size: 9,
};
function setup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'request' }]),
    reimbursement: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(row),
      findUniqueOrThrow: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue(row),
      create: jest.fn().mockResolvedValue(row),
    },
    financialCategory: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'category', kind: 'EXPENSE' }),
      findMany: jest.fn(),
    },
    bankTransaction: {
      update: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({
        id: 'bank',
        direction: 'DEBIT',
        amount: new Prisma.Decimal('25.10'),
        status: 'CLASSIFIED',
        classification: 'EXPENSE',
        reimbursement: null,
        import: { status: 'CONFIRMED', account: { currency: 'EUR' } },
      }),
    },
    reimbursementAttachment: {
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue({ storageKey: 'key' }),
    },
    member: {
      findFirst: jest.fn().mockResolvedValue({ id: 'member', name: 'Maria' }),
      updateMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  const db = { ...tx, $transaction: jest.fn(async (callback) => callback(tx)) };
  const storage = {
    validate: jest.fn(),
    put: jest.fn().mockResolvedValue('key'),
    remove: jest.fn(),
    get: jest.fn().mockResolvedValue(Buffer.from('file')),
  };
  return {
    tx,
    db,
    storage,
    service: new ReimbursementsService(
      db as unknown as PrismaService,
      storage as unknown as StorageService,
    ),
  };
}
describe('Reimbursement lifecycle and access', () => {
  it('lists the same expense categories for members without finance permissions', async () => {
    const { service, tx } = setup();
    await service.categories(user);
    expect(tx.financialCategory.findMany).toHaveBeenCalledWith({
      where: { kind: 'EXPENSE' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  });
  it('reads only the authenticated member profile', async () => {
    const { service, tx } = setup();
    await service.profile(user);
    expect(tx.member.findFirst).toHaveBeenCalledWith({
      where: { user: { id: user.id }, anonymizedAt: null },
      select: { name: true, iban: true },
    });
  });
  it.each(['create', 'update'] as const)(
    'saves a missing member IBAN on %s of their own request',
    async (operation) => {
      const { service, tx } = setup();
      tx.member.findFirst.mockResolvedValue({ id: 'member', name: 'Maria' });
      if (operation === 'create')
        await service.create(
          { iban: row.iban, categoryId: row.categoryId, amount: '25.10' },
          [file],
          user,
        );
      else
        await service.update(
          row.id,
          { iban: row.iban, categoryId: row.categoryId, amount: '25.10' },
          user,
        );
      expect(tx.member.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'member',
          anonymizedAt: null,
          OR: [{ iban: null }, { iban: '' }],
        },
        data: { iban: row.iban },
      });
    },
  );
  it('does not persist the IBAN of a different beneficiary in the member profile', async () => {
    const { service, tx } = setup();
    tx.member.findFirst.mockResolvedValue({
      id: 'member',
      name: 'Outra pessoa',
    });
    await service.create(
      { iban: row.iban, categoryId: row.categoryId, amount: '25.10' },
      [file],
      user,
    );
    expect(tx.member.updateMany).not.toHaveBeenCalled();
  });
  it('does not persist a beneficiary IBAN when a manager edits someone else’s request', async () => {
    const { service, tx } = setup();
    await service.update(
      row.id,
      { iban: row.iban, categoryId: row.categoryId, amount: '25.10' },
      { ...manager, id: 'treasurer' },
    );
    expect(tx.member.findFirst).not.toHaveBeenCalled();
    expect(tx.member.updateMany).not.toHaveBeenCalled();
  });
  it('allows the authenticated author to delete their request and audits it', async () => {
    const { service, tx, storage } = setup();
    await expect(service.remove('request', user)).resolves.toEqual({
      id: 'request',
    });
    expect(tx.reimbursement.update).toHaveBeenCalledWith({
      where: { id: 'request' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REIMBURSEMENT_DELETE',
          userId: user.id,
        }),
      }),
    );
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('does not let another member delete a request, including anonymous requests', async () => {
    const { service, tx } = setup();
    for (const submittedBy of ['other', null]) {
      tx.reimbursement.findUnique.mockResolvedValue({ ...row, submittedBy });
      await expect(service.remove('request', user)).rejects.toThrow();
    }
    expect(tx.reimbursement.update).not.toHaveBeenCalled();
  });
  it('lets the treasurer delete an anonymous or paid request without removing bank evidence', async () => {
    const { service, tx, storage } = setup();
    tx.reimbursement.findUnique.mockResolvedValue({
      ...row,
      submittedBy: null,
      paidAt: new Date(),
      bankTransactionId: 'bank',
    });
    await service.remove('request', manager);
    expect(tx.reimbursement.update).toHaveBeenCalledWith({
      where: { id: 'request' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('excludes deleted requests from both personal and treasury lists', async () => {
    const { service, tx } = setup();
    for (const reader of [user, manager])
      await service.list({ page: 1, pageSize: 20 }, reader);
    for (const [query] of tx.reimbursement.findMany.mock.calls)
      expect(query.where.deletedAt).toBeNull();
  });
  it('makes deletion idempotent and rejects payment or edits after deletion', async () => {
    const { service, tx } = setup();
    tx.reimbursement.findUnique.mockResolvedValue({
      ...row,
      deletedAt: new Date(),
    });
    await expect(service.remove('request', user)).resolves.toEqual({
      id: 'request',
    });
    expect(tx.reimbursement.update).not.toHaveBeenCalled();
    await expect(
      service.pay('request', '2026-01-01', manager),
    ).rejects.toThrow();
    await expect(
      service.update(
        'request',
        { iban: row.iban, categoryId: row.categoryId, amount: '10' },
        user,
      ),
    ).rejects.toThrow();
  });
  it('distinguishes incomplete, ready, paid and linked requests', () => {
    expect(reimbursementStatus({ ...row, categoryId: null })).toBe(
      'INCOMPLETE',
    );
    expect(reimbursementStatus({ ...row, iban: '' })).toBe('INCOMPLETE');
    expect(
      reimbursementStatus({ ...row, attachments: [{ kind: 'PAYMENT' }] }),
    ).toBe('INCOMPLETE');
    expect(reimbursementStatus(row)).toBe('READY');
    expect(reimbursementStatus({ ...row, paidAt: new Date() })).toBe('PAID');
    expect(
      reimbursementStatus({
        ...row,
        bankTransactionId: 'bank',
        paidAt: new Date(),
      }),
    ).toBe('LINKED');
  });
  it('hides other members requests and files', async () => {
    const { service, tx, storage } = setup();
    tx.reimbursement.findUnique.mockResolvedValue({
      ...row,
      submittedBy: 'other',
    });
    await expect(service.detail('request', user)).rejects.toThrow();
    await expect(
      service.download('request', 'document', user),
    ).rejects.toThrow();
    expect(storage.get).not.toHaveBeenCalled();
  });
  it('rejects anonymous submissions and accounts without a member before storing files', async () => {
    const { service, tx, storage } = setup();
    await expect(
      service.create(
        { iban: row.iban, categoryId: row.categoryId, amount: '25.10' },
        [file],
      ),
    ).rejects.toThrow();
    tx.member.findFirst.mockResolvedValueOnce(null!);
    await expect(
      service.create(
        { iban: row.iban, categoryId: row.categoryId, amount: '25.10' },
        [file],
        user,
      ),
    ).rejects.toThrow('exclusivo');
    expect(storage.put).not.toHaveBeenCalled();
  });
  it('requires IBAN and a valid expense category', async () => {
    const { service, tx } = setup();
    await expect(
      service.create(
        { iban: '', categoryId: row.categoryId, amount: '25.10' },
        [file],
        user,
      ),
    ).rejects.toThrow('IBAN');
    tx.financialCategory.findUnique.mockResolvedValueOnce({
      id: 'category',
      kind: 'INCOME',
    });
    await expect(
      service.create(
        { iban: row.iban, categoryId: row.categoryId, amount: '25.10' },
        [file],
        user,
      ),
    ).rejects.toThrow('categoria');
  });
  it('stores the authenticated submitter separately from the beneficiary', async () => {
    const { service, tx } = setup();
    await service.create(
      {
        beneficiaryName: 'Outra pessoa',
        iban: row.iban,
        categoryId: row.categoryId,
        amount: '25.10',
      },
      [file],
      user,
    );
    expect(tx.reimbursement.create.mock.calls[0]![0].data).toMatchObject({
      submittedBy: user.id,
      beneficiaryName: 'Outra pessoa',
    });
  });
  it('requires a document and cleans files when persistence fails', async () => {
    const { service, tx, storage } = setup();
    await expect(
      service.create(
        { iban: row.iban, categoryId: row.categoryId, amount: '25.10' },
        [],
        user,
      ),
    ).rejects.toThrow('documento');
    tx.reimbursement.create.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(
      service.create(
        { iban: row.iban, categoryId: row.categoryId, amount: '25.10' },
        [file],
        user,
      ),
    ).rejects.toThrow('database unavailable');
    expect(storage.remove).toHaveBeenCalledWith('key');
  });
  it('does not mark an incomplete request as paid', async () => {
    const { service, tx } = setup();
    tx.reimbursement.findUnique.mockResolvedValue({ ...row, purpose: '' });
    await expect(service.pay('request', '2026-01-01', manager)).rejects.toThrow(
      'Complete',
    );
    expect(tx.reimbursement.update).not.toHaveBeenCalled();
  });
  it('requires payment before association', async () => {
    const { service, tx } = setup();
    await expect(service.link('request', 'bank', manager)).rejects.toThrow(
      'pedido pago',
    );
    expect(tx.reimbursement.update).not.toHaveBeenCalled();
  });
  it.each([
    { amount: new Prisma.Decimal('24.10') },
    { direction: 'CREDIT' },
    { status: 'REJECTED' },
    { status: 'POSSIBLE_DUPLICATE' },
    { classification: 'IGNORE' },
    { import: { status: 'CONFIRMED', account: { currency: 'USD' } } },
  ])('rejects incompatible bank movements: %p', async (mismatch) => {
    const { service, tx } = setup();
    tx.reimbursement.findUnique.mockResolvedValue({
      ...row,
      paidAt: new Date('2026-01-01'),
    });
    const movement = await tx.bankTransaction.findUnique();
    tx.bankTransaction.findUnique.mockResolvedValue({
      ...movement,
      ...mismatch,
    });
    await expect(service.link('request', 'bank', manager)).rejects.toThrow();
    expect(tx.reimbursement.update).not.toHaveBeenCalled();
  });
  it('links an exact debit under locks and writes an audit event', async () => {
    const { service, tx } = setup();
    tx.reimbursement.findUnique.mockResolvedValue({
      ...row,
      paidAt: new Date('2026-01-01'),
    });
    await service.link('request', 'bank', manager);
    expect(tx.bankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryId: row.categoryId,
          classification: 'EXPENSE',
        }),
      }),
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.reimbursement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { bankTransactionId: 'bank' } }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'REIMBURSEMENT_LINK' }),
      }),
    );
  });
  it('prevents reusing a movement already linked to another request', async () => {
    const { service, tx } = setup();
    const movement = await tx.bankTransaction.findUnique();
    tx.bankTransaction.findUnique.mockResolvedValue({
      ...movement,
      reimbursement: row,
    });
    await expect(service.link('request', 'bank', manager)).rejects.toThrow(
      'já está associado',
    );
  });
  it.each([true, false])(
    'preserves reconciled accounting and rejects category mismatch: %s',
    async (matches) => {
      const { service, tx } = setup();
      tx.reimbursement.findUnique.mockResolvedValue({
        ...row,
        paidAt: new Date('2026-01-01'),
      });
      const movement = await tx.bankTransaction.findUnique();
      tx.bankTransaction.findUnique.mockResolvedValue({
        ...movement,
        status: 'RECONCILED',
        categoryId: matches ? row.categoryId : 'other',
      });
      const result = service.link(row.id, 'bank', manager);
      if (matches) await expect(result).resolves.toBeDefined();
      else await expect(result).rejects.toThrow('categoria');
      expect(tx.bankTransaction.update).not.toHaveBeenCalled();
    },
  );
  it('blocks changes to paid requests and payment evidence uploaded by a member', async () => {
    const { service, tx, storage } = setup();
    tx.reimbursement.findUniqueOrThrow.mockResolvedValue({
      ...row,
      paidAt: new Date(),
    });
    await expect(
      service.update(
        'request',
        { iban: row.iban, categoryId: row.categoryId, amount: '99' },
        user,
      ),
    ).rejects.toThrow('pago');
    await expect(
      service.attach('request', file, 'PAYMENT', user),
    ).rejects.toThrow();
    expect(storage.put).not.toHaveBeenCalled();
  });
  it('requires unlinking before correcting a payment', async () => {
    const { service, tx } = setup();
    tx.reimbursement.findUnique.mockResolvedValue({
      ...row,
      paidAt: new Date(),
      bankTransactionId: 'bank',
    });
    await expect(service.undoPayment('request', manager)).rejects.toThrow(
      'Desfaça',
    );
  });
});
