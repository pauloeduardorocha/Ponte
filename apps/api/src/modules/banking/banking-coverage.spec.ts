import { BankingService } from './banking.service';
import { BankQuery } from './banking.dto';

describe('bank import coverage', () => {
  it('uses completed imports for the selected account, independently of pagination', async () => {
    const aggregate = jest.fn().mockResolvedValue({
      _min: { date: new Date('2026-01-01Z') },
      _max: { date: new Date('2026-02-14Z') },
    });
    const service = new BankingService(
      { bankTransaction: { aggregate } } as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.coverage({ accountId: 'account-1' } as BankQuery),
    ).resolves.toEqual({ start: '2026-01-01', end: '2026-02-14' });
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          import: {
            accountId: 'account-1',
            status: { in: ['READY_FOR_REVIEW', 'CONFIRMED'] },
          },
        },
      }),
    );
  });

  it('returns no coverage for an account without successfully parsed movements', async () => {
    const service = new BankingService(
      {
        bankTransaction: {
          aggregate: jest
            .fn()
            .mockResolvedValue({ _min: { date: null }, _max: { date: null } }),
        },
      } as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.coverage({ accountId: 'empty' } as BankQuery),
    ).resolves.toEqual({ start: null, end: null });
  });
});
