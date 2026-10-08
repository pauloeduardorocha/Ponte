import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AccountDto, IncomeDto, IncomePatch } from './finance.dto';
import { randomUUID } from 'node:crypto';
describe('Finance DTOs', () => {
  const income = {
    amount: '10.25',
    date: '2026-10-07',
    accountId: randomUUID(),
    categoryId: randomUUID(),
    description: 'Oferta',
    origin: 'Manual',
  };
  it('accepts exact decimal strings and rejects floats, precision loss, null required fields and unknown properties', async () => {
    expect(await validate(plainToInstance(IncomeDto, income))).toHaveLength(0);
    for (const amount of [10.25, '1e3', '1.001', '-2.00'])
      expect(
        (await validate(plainToInstance(IncomeDto, { ...income, amount })))
          .length,
      ).toBeGreaterThan(0);
    expect(
      (await validate(plainToInstance(IncomePatch, { amount: null }))).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await validate(
          plainToInstance(AccountDto, {
            bank: 'Banco',
            name: 'Principal',
            currency: 'EUR',
            openingBalance: '0',
            password: 'secret',
          }),
          { whitelist: true, forbidNonWhitelisted: true },
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
