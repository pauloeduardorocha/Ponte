type Invoice = {
  amount: string;
  currency: string;
  date: string;
  issuerName: string;
  issuerTaxId: string;
  number: string;
};
type Expense = {
  id: string;
  amount?: string;
  date?: string;
  description?: string;
  account?: { currency: string };
};
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export function suggestInvoiceExpenses<T extends Expense>(
  invoice: Invoice,
  expenses: T[],
) {
  return expenses
    .flatMap((expense) => {
      if (
        Number(invoice.amount) <= 0 ||
        expense.account?.currency !== invoice.currency ||
        !expense.date
      )
        return [];
      const difference =
        (new Date(expense.date).getTime() - new Date(invoice.date).getTime()) /
        86400000;
      if (!Number.isFinite(difference) || difference < -7 || difference > 90)
        return [];
      const days = Math.abs(difference);
      const description = normalize(expense.description ?? '');
      const reference = [invoice.number, invoice.issuerTaxId].some(
        (value) =>
          normalize(value).length >= 3 &&
          description.includes(normalize(value)),
      );
      const name = normalize(invoice.issuerName);
      const issuer = name.length >= 5 && description.includes(name);
      const equalAmount = Number(invoice.amount) === Number(expense.amount);
      if (!equalAmount && !reference && !issuer) return [];
      return [
        {
          ...expense,
          score:
            (equalAmount ? 50 : 0) +
            (reference ? 35 : issuer ? 20 : 0) +
            (days <= 3 ? 15 : days <= 7 ? 10 : 0),
          days,
          reasons: [
            equalAmount
              ? 'Valor e moeda iguais'
              : 'Valor diferente; confira pagamento agrupado',
            `Diferença de ${Math.round(days)} dias`,
            ...(reference ? ['Referência/NIF na despesa'] : []),
            ...(issuer ? ['Emitente na descrição'] : []),
          ],
        },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.days - b.days || a.id.localeCompare(b.id),
    );
}
