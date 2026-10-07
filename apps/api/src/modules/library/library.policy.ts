import { Prisma } from '@prisma/client';

export const DAY_MS = 86_400_000;
export const ACTIVE_LOANS = ['ACTIVE', 'OVERDUE'] as const;

/** UTC calendar days, with grace excluded from chargeable days. */
export function overdueDays(dueAt: Date, at: Date, graceDays: number): number {
  const utcDay = (date: Date) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.max(
    0,
    Math.floor((utcDay(at) - utcDay(dueAt)) / DAY_MS) - graceDays,
  );
}

/** Decimal arithmetic only; monetary values are serialized as strings. */
export function outstanding(fine: {
  amount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  discount: Prisma.Decimal;
}): Prisma.Decimal {
  return fine.amount.minus(fine.paidAmount).minus(fine.discount);
}

export function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}
