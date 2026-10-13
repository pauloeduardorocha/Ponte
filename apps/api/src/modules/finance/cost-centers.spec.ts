import { randomUUID } from 'node:crypto';
import { FinanceService } from './finance.service';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from './storage.service';

describe('Movement cost centers', () => {
  const centerId = randomUUID();
  const tx = {
    financialCategory: {
      findUnique: jest.fn().mockResolvedValue({ kind: 'INCOME' }),
    },
    bankAccount: {
      findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    },
    costCenter: { findUnique: jest.fn() },
  };
  const service = new FinanceService({} as PrismaService, {} as StorageService);
  const validate = (costCenterId?: string | null) =>
    (
      service as unknown as {
        validateTransaction: (
          tx: unknown,
          data: unknown,
          kind: string,
        ) => Promise<void>;
      }
    ).validateTransaction(
      tx,
      {
        amount: '10',
        categoryId: randomUUID(),
        accountId: randomUUID(),
        costCenterId,
      },
      'INCOME',
    );
  it('rejects an unknown cost center', async () => {
    tx.costCenter.findUnique.mockResolvedValue(null);
    await expect(validate(centerId)).rejects.toThrow(
      'Centro de custo inválido',
    );
  });
  it('accepts a registered center and allows clearing it', async () => {
    tx.costCenter.findUnique.mockResolvedValue({ id: centerId });
    await expect(validate(centerId)).resolves.toBeUndefined();
    await expect(validate(null)).resolves.toBeUndefined();
  });
});
