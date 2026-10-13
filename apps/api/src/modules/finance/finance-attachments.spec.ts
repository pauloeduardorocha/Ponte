import { FinanceService } from './finance.service';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from './storage.service';
import type { CurrentUser } from '@church/shared';

describe('Expense attachment management', () => {
  const user = { id: 'actor' } as CurrentUser;
  function setup() {
    const attachment = {
      id: 'attachment',
      filename: 'receipt.pdf',
      storageKey: 'key',
    };
    const tx = {
      $executeRaw: jest.fn(),
      financialAttachment: {
        findUnique: jest.fn().mockResolvedValue(attachment),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'attachment', filename: 'new.pdf' }),
        delete: jest
          .fn()
          .mockResolvedValue({ id: 'attachment', filename: 'receipt.pdf' }),
      },
      auditLog: { create: jest.fn() },
    };
    const db = {
      financialAttachment: tx.financialAttachment,
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    const storage = { remove: jest.fn() };
    return {
      tx,
      storage,
      service: new FinanceService(
        db as unknown as PrismaService,
        storage as unknown as StorageService,
      ),
    };
  }
  it('renames the expense attachment and audits the change', async () => {
    const { service, tx } = setup();
    await service.renameAttachment('attachment', 'new.pdf', user);
    expect(tx.financialAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { filename: 'new.pdf' } }),
    );
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
  it('rejects changing the file extension', async () => {
    const { service, tx } = setup();
    await expect(
      service.renameAttachment('attachment', 'new.png', user),
    ).rejects.toThrow('extensão');
    expect(tx.financialAttachment.update).not.toHaveBeenCalled();
  });
  it('deletes the expense attachment and private file', async () => {
    const { service, storage, tx } = setup();
    await service.deleteAttachment('attachment', user);
    expect(tx.financialAttachment.delete).toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith('key');
  });
});
