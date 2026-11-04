import { describe, expect, it } from 'vitest';
import { suggestInvoiceExpenses } from './invoice-expense-suggestions';

describe('Invoice movement suggestions', () => {
  const invoice = {
    amount: '20.00',
    currency: 'EUR',
    date: '2026-10-01',
    issuerName: 'Loja Materiais',
    issuerTaxId: '123456789',
    number: 'FT-42',
  };
  const expense = {
    id: 'expense',
    amount: '20',
    date: '2026-10-02',
    account: { currency: 'EUR' },
    description: 'Compra',
  };
  it('ranks matching references and prices before date-only price matches', () => {
    const rows = suggestInvoiceExpenses(invoice, [
      expense,
      { ...expense, id: 'reference', description: 'Pagamento 123456789' },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['reference', 'expense']);
    expect(rows[0]?.reasons).toContain('Referência/NIF na despesa');
  });
  it('allows grouped payments when the issuer matches', () => {
    expect(
      suggestInvoiceExpenses(invoice, [
        { ...expense, amount: '100', description: 'Loja Materiais' },
      ]),
    ).toHaveLength(1);
  });
  it('excludes unrelated amounts, incompatible currencies and dates outside the window', () => {
    expect(
      suggestInvoiceExpenses(invoice, [
        { ...expense, amount: '100' },
        { ...expense, account: { currency: 'BRL' } },
        { ...expense, date: '2026-09-23' },
        { ...expense, date: '2027-01-01' },
      ]),
    ).toEqual([]);
  });
});
