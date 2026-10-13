import { BankingService } from './banking.service';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../finance/storage.service';
import { StatementParserRegistry } from './statement.parsers';
import type { CurrentUser } from '@church/shared';

describe('Bank movement attachments', () => {
  const user = { id: 'actor' } as CurrentUser;
  const file = {
    originalname: 'receipt.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7'),
    size: 8,
  };
  function setup(count = 0, exists = true) {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue(exists ? [{ id: 'movement' }] : []),
      bankAttachment: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            exists
              ? { id: 'attachment', filename: 'receipt.pdf', storageKey: 'key' }
              : null,
          ),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'attachment', filename: 'new.pdf' }),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(count),
        create: jest
          .fn()
          .mockResolvedValue({ id: 'attachment', filename: file.originalname }),
      },
      auditLog: { create: jest.fn() },
    };
    const db = { $transaction: jest.fn(async (callback) => callback(tx)) };
    const storage = {
      validate: jest.fn(),
      put: jest.fn().mockResolvedValue('key'),
      remove: jest.fn(),
    };
    const service = new BankingService(
      db as unknown as PrismaService,
      storage as unknown as StorageService,
      {} as StatementParserRegistry,
    );
    return { service, tx, storage };
  }
  it('rejects a file above 1 MB before storing it', async () => {
    const { service, storage } = setup();
    await expect(
      service.attach('movement', { ...file, size: 1048577 }, user),
    ).rejects.toThrow('1 MB');
    expect(storage.put).not.toHaveBeenCalled();
  });
  it('renames within the movement and audits the old and new names', async () => {
    const { service, tx } = setup();
    await service.renameAttachment('movement', 'attachment', 'new.pdf', user);
    expect(tx.bankAttachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'attachment', transactionId: 'movement' },
    });
    expect(tx.bankAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { filename: 'new.pdf' } }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'FINANCE_BANK_ATTACHMENT_RENAME',
          metadata: expect.objectContaining({
            previousFilename: 'receipt.pdf',
            filename: 'new.pdf',
          }),
        }),
      }),
    );
  });
  it.each(['../new.pdf', 'new.png', '   ', 'new\u0000.pdf'])(
    'rejects invalid rename %s',
    async (filename) => {
      const { service, tx } = setup();
      await expect(
        service.renameAttachment('movement', 'attachment', filename, user),
      ).rejects.toThrow();
      expect(tx.bankAttachment.update).not.toHaveBeenCalled();
    },
  );
  it('deletes the attachment and its private file', async () => {
    const { service, tx, storage } = setup();
    await service.deleteAttachment('movement', 'attachment', user);
    expect(tx.bankAttachment.delete).toHaveBeenCalledWith({
      where: { id: 'attachment' },
    });
    expect(storage.remove).toHaveBeenCalledWith('key');
  });
  it('does not rename or delete an attachment outside the movement', async () => {
    const { service, tx, storage } = setup(0, false);
    await expect(
      service.renameAttachment('other', 'attachment', 'new.pdf', user),
    ).rejects.toThrow();
    await expect(
      service.deleteAttachment('other', 'attachment', user),
    ).rejects.toThrow();
    expect(tx.bankAttachment.update).not.toHaveBeenCalled();
    expect(tx.bankAttachment.delete).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
  it('locks the movement and accepts its fifth attachment', async () => {
    const { service, tx } = setup(4);
    await expect(service.attach('movement', file, user)).resolves.toMatchObject(
      { id: 'attachment' },
    );
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('FOR UPDATE');
    expect(tx.auditLog.create).toHaveBeenCalled();
  });
  it('rejects the sixth attachment and removes its stored file', async () => {
    const { service, tx, storage } = setup(5);
    await expect(service.attach('movement', file, user)).rejects.toThrow(
      '5 anexos',
    );
    expect(tx.bankAttachment.create).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith('key');
  });
  it('cleans up uploads for a missing movement', async () => {
    const { service, storage } = setup(0, false);
    await expect(service.attach('missing', file, user)).rejects.toThrow();
    expect(storage.remove).toHaveBeenCalledWith('key');
  });
  it('rejects invalid file signatures before storing', async () => {
    const { service, storage } = setup();
    storage.validate.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    await expect(service.attach('movement', file, user)).rejects.toThrow(
      'Invalid signature',
    );
    expect(storage.put).not.toHaveBeenCalled();
  });
});
