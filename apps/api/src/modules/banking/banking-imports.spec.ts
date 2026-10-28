import { BankingService } from './banking.service';
import { BankQuery } from './banking.dto';

describe('bank import list periods', () => {
  const findMany = jest.fn();
  const count = jest.fn();
  const groupBy = jest.fn();
  const service = new BankingService(
    { bankImport: { findMany, count }, bankTransaction: { groupBy } } as never,
    {} as never,
    {} as never,
  );
  const query = {
    accountId: 'account',
    page: 2,
    pageSize: 20,
    skip: 20,
  } as BankQuery;
  beforeEach(() => {
    jest.clearAllMocks();
    count.mockResolvedValue(25);
  });
  it('adds full movement date ranges for only the requested page, preserving order and pagination', async () => {
    findMany.mockResolvedValue([
      {
        id: 'newer',
        filename: 'statement.xlsx',
        createdAt: new Date('2026-10-28'),
      },
      {
        id: 'older',
        filename: 'statement.xlsx',
        createdAt: new Date('2026-10-13'),
      },
      { id: 'empty', filename: 'empty.xlsx' },
    ]);
    groupBy.mockResolvedValue([
      {
        importId: 'older',
        _min: { date: new Date('2026-01-02') },
        _max: { date: new Date('2026-10-12') },
      },
      {
        importId: 'newer',
        _min: { date: new Date('2026-10-12') },
        _max: { date: new Date('2026-10-27') },
      },
    ]);
    const result = await service.imports(query);
    expect(result).toMatchObject({
      total: 25,
      page: 2,
      pageSize: 20,
      items: [
        { id: 'newer', period: { start: '2026-10-12', end: '2026-10-27' } },
        { id: 'older', period: { start: '2026-01-02', end: '2026-10-12' } },
        { id: 'empty', period: { start: null, end: null } },
      ],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'account' },
        skip: 20,
        take: 20,
      }),
    );
    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['importId'],
      where: { importId: { in: ['newer', 'older', 'empty'] } },
      _min: { date: true },
      _max: { date: true },
    });
  });
  it('returns an empty page without querying movements', async () => {
    findMany.mockResolvedValue([]);
    expect(await service.imports(query)).toMatchObject({
      items: [],
      total: 25,
      page: 2,
    });
    expect(groupBy).not.toHaveBeenCalled();
  });
});
