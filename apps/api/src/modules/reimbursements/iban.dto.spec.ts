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
        categoryId: '63b80123-eefa-4f48-a877-6cfdcdd4b724',
        name: 'Maria',
        email: 'maria@example.com',
        iban: 'pt50 0002 0123 1234 5678 9015 4',
      });
      expect(input.iban).toBe(iban);
      expect(await validate(input)).toEqual([]);
    },
  );

  it.each(['912345678', 'PT50000201231234567890155', null, '', undefined])(
    'rejects an invalid reimbursement IBAN: %p',
    async (value) => {
      const errors = await validate(
        plainToInstance(ReimbursementDto, { iban: value }),
      );
      expect(errors.some((error) => error.property === 'iban')).toBe(true);
    },
  );

  it.each(['', undefined, null, 'invalid'])(
    'requires a category UUID: %p',
    async (categoryId) => {
      const errors = await validate(
        plainToInstance(ReimbursementDto, { iban, categoryId }),
      );
      expect(errors.some((error) => error.property === 'categoryId')).toBe(
        true,
      );
    },
  );

  it('allows the member IBAN to be cleared', async () => {
    const input = plainToInstance(UpdateMemberDto, { iban: '' });
    expect(input.iban).toBeNull();
    expect(await validate(input)).toEqual([]);
  });
});
