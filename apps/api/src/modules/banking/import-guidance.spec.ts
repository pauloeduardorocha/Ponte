import { BankingService } from './banking.service';

describe('bank import guidance', () => {
  const groupBy = jest.fn();
  const findUnique = jest.fn();
  const service = new BankingService(
    {
      bankAccount: { findUnique },
      bankTransaction: { groupBy },
    } as never,
    {} as never,
    {} as never,
  );
  const period = (start: string | null, end: string | null) => ({
    _min: { date: start ? new Date(start) : null },
    _max: { date: end ? new Date(end) : null },
  });
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T12:00:00Z'));
    findUnique.mockResolvedValue({ id: 'account' });
    groupBy.mockResolvedValue([]);
  });
  afterEach(() => jest.useRealTimers());

  it('merges overlapping, nested and adjacent imports before detecting gaps', async () => {
    groupBy.mockResolvedValue([
      period('2026-10-15', '2026-10-20'),
      period('2026-09-01', '2026-09-10'),
      period('2026-09-05', '2026-09-07'),
      period('2026-09-08', '2026-09-20'),
      period('2026-09-21', '2026-09-30'),
      period(null, null),
    ]);
    expect(await service.importGuidance('account')).toEqual({
      accountId: 'account',
      bankDataThrough: '2026-10-20',
      gaps: [{ start: '2026-10-01', end: '2026-10-14' }],
      suggestedPeriod: { start: '2026-10-20', end: '2026-10-23' },
    });
    expect(groupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          import: {
            accountId: 'account',
            status: { in: ['CONFIRMED', 'READY_FOR_REVIEW'] },
          },
        },
      }),
    );
  });
  it('does not invent historical coverage for an account without movements', async () => {
    expect(await service.importGuidance('account')).toEqual({
      accountId: 'account',
      bankDataThrough: null,
      gaps: [],
      suggestedPeriod: null,
    });
  });
  it('does not suggest a reversed range when already current', async () => {
    groupBy.mockResolvedValue([period('2026-10-01', '2026-10-23')]);
    expect(
      (await service.importGuidance('account')).suggestedPeriod,
    ).toBeNull();
  });
  it('uses the Lisbon calendar date across midnight UTC', async () => {
    jest.setSystemTime(new Date('2026-10-22T23:30:00Z'));
    groupBy.mockResolvedValue([period('2026-10-01', '2026-10-22')]);
    expect((await service.importGuidance('account')).suggestedPeriod?.end).toBe(
      '2026-10-23',
    );
  });
  it('rejects an unknown account', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.importGuidance('missing')).rejects.toThrow(
      'Conta bancária não encontrada',
    );
  });
});
