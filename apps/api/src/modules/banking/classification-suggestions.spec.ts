import 'reflect-metadata';
import { BankingService } from './banking.service';
import { BankingController } from './banking.controller';
import { PERMISSION_KEY } from '../auth/permission.decorator';
import {
  classificationPattern,
  historicalSuggestion,
} from './classification-suggestions';

const category = { id: 'category', name: 'Eletricidade', kind: 'EXPENSE' };
const center = { id: 'center', name: 'Sede' };
const historicalRow = {
  description: 'Pagamento Energia 01/10/2026',
  category,
  costCenterRecord: center,
};

describe('historical classification suggestions', () => {
  it('normalizes accents, punctuation, case and dates while preserving identifiers', () => {
    expect(classificationPattern('PAGAMÉNTO: Energia 01/11/2026')).toBe(
      classificationPattern(historicalRow.description),
    );
    expect(classificationPattern('Energia 123456')).not.toBe(
      classificationPattern('Energia 987654'),
    );
  });

  it('requires three supporting movements and 80% agreement without rounding the threshold', () => {
    expect(historicalSuggestion([category, category])).toBeNull();
    expect(
      historicalSuggestion([category, category, category, null]),
    ).toBeNull();
    expect(
      historicalSuggestion([category, category, category, category, null]),
    ).toMatchObject({ agreement: 80, support: 4, sampleSize: 5 });
    expect(
      historicalSuggestion([
        category,
        category,
        category,
        { id: 'other', name: 'Other' },
      ]),
    ).toBeNull();
    expect(
      historicalSuggestion(
        Array(3).fill({
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Sem categoria',
        }),
      ),
    ).toBeNull();
  });

  function setup(
    history: unknown[] = Array(3).fill(historicalRow),
    direction = 'DEBIT',
    description = 'Pagamento Energia 01/11/2026',
  ) {
    const db = {
      bankTransaction: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({
            description,
            direction,
            import: { accountId: 'account' },
          }),
        findMany: jest.fn().mockResolvedValue(history),
      },
    };
    return {
      db,
      service: new BankingService(db as never, {} as never, {} as never),
    };
  }

  it('restricts history to confirmed human classifications in the same account and direction', async () => {
    const { db, service } = setup();
    expect(await service.classificationSuggestions('movement')).toMatchObject({
      classification: 'EXPENSE',
      category: { id: 'category', support: 3 },
      costCenter: { id: 'center', support: 3 },
    });
    expect(db.bankTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { not: 'movement' },
          direction: 'DEBIT',
          classification: 'EXPENSE',
          classifiedBy: { not: null },
          status: { in: ['CLASSIFIED', 'RECONCILED'] },
          import: {
            accountId: 'account',
            status: { in: ['CONFIRMED', 'READY_FOR_REVIEW'] },
          },
        },
        take: 2000,
      }),
    );
  });

  it('evaluates each field independently and ignores unrelated descriptions', async () => {
    const { service } = setup([
      ...Array(3).fill({ ...historicalRow, costCenterRecord: null }),
      ...Array(4).fill({ ...historicalRow, description: 'Outro fornecedor' }),
    ]);
    expect(await service.classificationSuggestions('movement')).toMatchObject({
      category: { support: 3, sampleSize: 3 },
      costCenter: null,
    });
  });

  it('supports credits and rejects categories of the wrong kind', async () => {
    const { service } = setup(undefined, 'CREDIT');
    expect(await service.classificationSuggestions('movement')).toMatchObject({
      classification: 'INCOME',
      category: null,
      costCenter: { id: 'center' },
    });
  });

  it('returns empty suggestions for short descriptions without scanning history', async () => {
    const { service, db } = setup([], 'DEBIT', '123');
    expect(await service.classificationSuggestions('movement')).toMatchObject({
      category: null,
      costCenter: null,
    });
    expect(db.bankTransaction.findMany).not.toHaveBeenCalled();
  });

  it('requires banking, contribution and category read permissions', () => {
    expect(
      Reflect.getMetadata(
        PERMISSION_KEY,
        BankingController.prototype.classificationSuggestions,
      ),
    ).toEqual([
      'FINANCE_BANK_IMPORT',
      'FINANCE_CONTRIBUTION_READ',
      'FINANCE_CATEGORY_READ',
    ]);
  });
});
