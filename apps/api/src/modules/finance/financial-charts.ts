import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FinanceChartsQuery } from './finance.dto';

const DAY = 86_400_000;
type Row = {
  date: string;
  currency: string;
  kind: string;
  category: string;
  center: string;
  amount: Prisma.Decimal;
};

export async function financialCharts(
  db: PrismaService,
  q: FinanceChartsQuery,
  now = new Date(),
) {
  const today = now.toISOString().slice(0, 10);
  const start = new Date(`${q.start}T00:00:00Z`);
  const end = new Date(`${q.end}T00:00:00Z`);
  if (
    !Number.isFinite(+start) ||
    !Number.isFinite(+end) ||
    q.start < '2000-01-01' ||
    q.start > today ||
    end < start ||
    (+end - +start) / DAY > 1095
  )
    throw new BadRequestException(
      'Selecione início entre 2000 e hoje, fim após o início e intervalo de até 1095 dias.',
    );
  const through = q.end < today ? q.end : today;
  const cutoff = new Date(`${through}T00:00:00Z`);
  const rows = await db.$transaction(
    async (tx) => {
      const opening = await tx.bankAccount.groupBy({
        by: ['currency'],
        _sum: { openingBalance: true },
      });
      const movements = await tx.$queryRaw<Row[]>`
      WITH movements AS (
        SELECT i.date, a.currency, 'INCOME' AS kind, c.name AS category,
          COALESCE(cc.name, i."costCenter", 'Sem centro de custos') AS center, i.amount
        FROM incomes i JOIN bank_accounts a ON a.id=i."accountId"
        JOIN financial_categories c ON c.id=i."categoryId"
        LEFT JOIN cost_centers cc ON cc.id=i."costCenterId"
        WHERE i.status='COMPLETED' AND i.date<=${cutoff}
        UNION ALL
        SELECT e."paidAt", a.currency, 'EXPENSE', c.name,
          COALESCE(cc.name, e."costCenter", 'Sem centro de custos'), e.amount
        FROM expenses e JOIN bank_accounts a ON a.id=e."accountId"
        JOIN financial_categories c ON c.id=e."categoryId"
        LEFT JOIN cost_centers cc ON cc.id=e."costCenterId"
        WHERE e.status='COMPLETED' AND e."paidAt"<=${cutoff}
      )
      SELECT CASE WHEN date<${start} THEN 'opening' ELSE to_char(date,'YYYY-MM-DD') END AS date,
        currency, kind,
        CASE WHEN date<${start} THEN '' ELSE category END AS category,
        CASE WHEN date<${start} THEN '' ELSE center END AS center, SUM(amount) AS amount
      FROM movements GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,4,5`;
      return { opening, movements };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  return {
    start: q.start,
    end: q.end,
    through,
    currencies: rows.opening.map((account) => {
      const movements = rows.movements.filter(
        (r) => r.currency === account.currency,
      );
      let balance = Number(account._sum.openingBalance ?? 0);
      const daily = new Map<string, { income: number; expenses: number }>();
      const groups = {
        incomeCategories: new Map<string, number>(),
        expenseCategories: new Map<string, number>(),
        incomeCenters: new Map<string, number>(),
        expenseCenters: new Map<string, number>(),
      };
      let income = 0,
        expenses = 0;
      for (const row of movements) {
        const amount = Number(row.amount),
          incoming = row.kind === 'INCOME';
        if (row.date === 'opening') {
          balance += incoming ? amount : -amount;
          continue;
        }
        const day = daily.get(row.date) ?? { income: 0, expenses: 0 };
        day[incoming ? 'income' : 'expenses'] += amount;
        daily.set(row.date, day);
        if (incoming) income += amount;
        else expenses += amount;
        for (const [map, name] of [
          [
            incoming ? groups.incomeCategories : groups.expenseCategories,
            row.category,
          ],
          [incoming ? groups.incomeCenters : groups.expenseCenters, row.center],
        ] as const)
          map.set(name, (map.get(name) ?? 0) + amount);
      }
      const days = Math.round((+cutoff - +start) / DAY) + 1;
      const averageIncome = income / days,
        averageExpenses = expenses / days;
      const points: {
        date: string;
        projected: boolean;
        income: number;
        expenses: number;
        balance: number;
      }[] = [];
      const initialBalance = balance;
      for (let time = +start; time <= +end; time += DAY) {
        const date = new Date(time).toISOString().slice(0, 10),
          projected = date > today;
        const day = projected
          ? { income: averageIncome, expenses: averageExpenses }
          : (daily.get(date) ?? { income: 0, expenses: 0 });
        balance += day.income - day.expenses;
        points.push({
          date,
          projected,
          income: day.income,
          expenses: day.expenses,
          balance,
        });
      }
      return {
        currency: account.currency,
        initialBalance,
        averageIncome,
        averageExpenses,
        historicalDays: days,
        incomeCategories: [...groups.incomeCategories].map(
          ([name, amount]) => ({ name, amount }),
        ),
        expenseCategories: [...groups.expenseCategories].map(
          ([name, amount]) => ({ name, amount }),
        ),
        incomeCenters: [...groups.incomeCenters].map(([name, amount]) => ({
          name,
          amount,
        })),
        expenseCenters: [...groups.expenseCenters].map(([name, amount]) => ({
          name,
          amount,
        })),
        points,
      };
    }),
  };
}
