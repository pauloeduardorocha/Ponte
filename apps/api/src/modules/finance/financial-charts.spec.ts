import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { financialCharts } from './financial-charts';
import { FinanceController } from './finance.controller';
import { PERMISSION_KEY } from '../auth/permission.decorator';
import { FinanceChartsQuery } from './finance.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('Treasury charts', () => {
  it('requires detailed financial data permission on the HTTP endpoint', () => {
    expect(
      Reflect.getMetadata(PERMISSION_KEY, FinanceController.prototype.charts),
    ).toEqual(['FINANCE_TRANSACTION_READ']);
  });

  it.each([
    {},
    { start: '2026-02-30', end: '2026-11-07' },
    { start: '2026-11-01T00:00:00Z', end: '2026-11-07' },
  ])('rejects missing or malformed HTTP dates: %j', async (query) => {
    expect(
      (await validate(plainToInstance(FinanceChartsQuery, query))).length,
    ).toBeGreaterThan(0);
  });
  const now = new Date('2026-11-07T12:00:00Z');
  function setup() {
    const tx = {
      bankAccount: {
        groupBy: jest.fn().mockResolvedValue([
          {
            currency: 'EUR',
            _sum: { openingBalance: new Prisma.Decimal(100) },
          },
          {
            currency: 'BRL',
            _sum: { openingBalance: new Prisma.Decimal(500) },
          },
        ]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        {
          date: 'opening',
          currency: 'EUR',
          kind: 'INCOME',
          amount: new Prisma.Decimal(50),
        },
        {
          date: 'opening',
          currency: 'EUR',
          kind: 'EXPENSE',
          amount: new Prisma.Decimal(10),
        },
        {
          date: '2026-11-05',
          currency: 'EUR',
          kind: 'INCOME',
          category: 'Ofertas',
          center: 'Sem centro de custos',
          amount: new Prisma.Decimal(90),
        },
        {
          date: '2026-11-07',
          currency: 'EUR',
          kind: 'EXPENSE',
          category: 'Energia',
          center: 'Sede',
          amount: new Prisma.Decimal(30),
        },
      ]),
    };
    return {
      $transaction: jest.fn(async (fn) => fn(tx)),
    } as unknown as PrismaService;
  }

  it('carries prior balance, fills empty days, keeps currencies separate and projects daily averages', async () => {
    const result = await financialCharts(
      setup(),
      { start: '2026-11-05', end: '2026-11-09' },
      now,
    );
    const eur = result.currencies[0]!;
    expect(eur.initialBalance).toBe(140);
    expect(eur.historicalDays).toBe(3);
    expect(eur.averageIncome).toBe(30);
    expect(eur.averageExpenses).toBe(10);
    expect(eur.points.map((p) => p.balance)).toEqual([230, 230, 200, 220, 240]);
    expect(eur.points.map((p) => p.projected)).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(eur.incomeCategories).toEqual([{ name: 'Ofertas', amount: 90 }]);
    expect(eur.expenseCenters).toEqual([{ name: 'Sede', amount: 30 }]);
    expect(result.currencies[1]!.points.every((p) => p.balance === 500)).toBe(
      true,
    );
  });

  it('does not project a historical period and includes both date boundaries', async () => {
    const result = await financialCharts(
      setup(),
      { start: '2026-11-05', end: '2026-11-07' },
      now,
    );
    expect(result.currencies[0]!.points).toHaveLength(3);
    expect(result.currencies[0]!.points.every((p) => !p.projected)).toBe(true);
  });

  it.each([
    { start: '2026-11-08', end: '2026-11-09' },
    { start: '2026-11-05', end: '2026-11-04' },
    { start: '2020-01-01', end: '2026-11-07' },
    { start: 'invalid', end: '2026-11-07' },
  ])(
    'rejects invalid ranges before accessing the database: %j',
    async (query) => {
      const db = setup();
      await expect(financialCharts(db, query, now)).rejects.toThrow();
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );
});
