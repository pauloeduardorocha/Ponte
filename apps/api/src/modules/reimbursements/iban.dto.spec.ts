import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMemberDto, UpdateMemberDto } from '../members/member.dto';
import { ReimbursementDto } from './reimbursements.dto';

const iban = 'PT50000201231234567890154';

describe('IBAN input validation', () => {
  it.each([CreateMemberDto, UpdateMemberDto, ReimbursementDto])(
    'normalizes and validates %p',
    async (Dto) => {
      const input = plainToInstance(Dto, {
        name: 'Maria',
        email: 'maria@example.com',
        iban: 'pt50 0002 0123 1234 5678 9015 4',
      });
      expect(input.iban).toBe(iban);
      expect(await validate(input)).toEqual([]);
    },
  );

  it.each(['912345678', 'PT50000201231234567890155', null])(
    'rejects an invalid reimbursement IBAN: %p',
    async (value) => {
      const errors = await validate(
        plainToInstance(ReimbursementDto, { iban: value }),
      );
      expect(errors.some((error) => error.property === 'iban')).toBe(true);
    },
  );

  it.each(['', undefined])(
    'allows incomplete requests with IBAN %p',
    async (value) => {
      expect(
        await validate(plainToInstance(ReimbursementDto, { iban: value })),
      ).toEqual([]);
    },
  );

  it('allows the member IBAN to be cleared', async () => {
    const input = plainToInstance(UpdateMemberDto, { iban: '' });
    expect(input.iban).toBeNull();
    expect(await validate(input)).toEqual([]);
  });
});
