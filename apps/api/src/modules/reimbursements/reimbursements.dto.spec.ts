import { validate } from 'class-validator';
import { ReimbursementDto } from './reimbursements.dto';

describe('Reimbursement amount wire format', () => {
  it.each([
    '0.01',
    '0.1',
    '0.10',
    '0.99',
    '1',
    '1.0',
    '1.00',
    '10.00',
    '9999999999.99',
  ])('accepts a positive decimal amount: %s', async (amount) => {
    const errors = await validate(
      Object.assign(new ReimbursementDto(), { amount }),
      { skipMissingProperties: true },
    );
    expect(errors).toEqual([]);
  });
  it.each([
    '0',
    '0.0',
    '0.00',
    '-1',
    '01',
    '01.01',
    '1,20',
    '1e2',
    '1.',
    '.01',
    '0.001',
    '1.000',
    '10000000000',
    ' 1',
    '1 ',
    '',
  ])('rejects amounts outside the decimal contract: %s', async (amount) => {
    const errors = await validate(
      Object.assign(new ReimbursementDto(), { amount }),
      { skipMissingProperties: true },
    );
    expect(errors.map((error) => error.property)).toEqual(['amount']);
  });
});
