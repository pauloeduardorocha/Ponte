import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AdjustmentDto,
  PaymentDto,
  SettingsDto,
} from '../src/modules/library/library.dto';
import {
  addDays,
  DAY_MS,
  outstanding,
  overdueDays,
} from '../src/modules/library/library.policy';

describe('Library policies', () => {
  it.each([
    ['2026-10-01T23:59:59Z', 0, 0],
    ['2026-10-02T00:00:00Z', 0, 1],
    ['2026-10-03T23:59:59Z', 2, 0],
    ['2026-10-04T00:00:00Z', 2, 1],
    ['2026-09-30T23:59:59Z', 0, 0],
  ])('uses UTC calendar days at %s with grace %s', (at, grace, days) => {
    expect(
      overdueDays(new Date('2026-10-01T09:00:00Z'), new Date(at), grace),
    ).toBe(days);
  });
  it('ignores host timezone and crosses DST/year without changing the interval', () => {
    expect(
      overdueDays(
        new Date('2026-12-31T23:00:00-03:00'),
        new Date('2027-01-02T00:00:00Z'),
        0,
      ),
    ).toBe(1);
    const date = new Date('2026-03-28T10:00:00Z');
    expect(addDays(date, 2).getTime() - date.getTime()).toBe(2 * DAY_MS);
    expect(date.toISOString()).toBe('2026-03-28T10:00:00.000Z');
  });
  it('subtracts money exactly in decimals', () => {
    expect(
      outstanding({
        amount: new Prisma.Decimal('0.30'),
        paidAmount: new Prisma.Decimal('0.10'),
        discount: new Prisma.Decimal('0.10'),
      }).toFixed(2),
    ).toBe('0.10');
  });
  it.each(['1.001', '-1', '1e2', 'NaN', 'Infinity', '01.00', 1, null])(
    'rejects invalid payment money %s',
    async (amount) => {
      const dto = plainToInstance(PaymentDto, {
        amount,
        idempotencyKey: 'a0b00000-0000-4000-8000-000000000001',
      });
      expect((await validate(dto)).length).toBeGreaterThan(0);
    },
  );
  it('requires nonblank adjustment reason and complete settings', async () => {
    expect(
      (
        await validate(
          plainToInstance(AdjustmentDto, {
            kind: 'FORGIVE',
            justification: '  ',
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
    expect((await validate(new SettingsDto())).length).toBeGreaterThan(0);
  });
});
