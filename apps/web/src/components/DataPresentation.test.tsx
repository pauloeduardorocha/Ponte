import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MoneyTrend } from './DataPresentation';

it('shows category values and the monthly total on hover and keyboard focus', async () => {
  render(
    <MoneyTrend
      currency="EUR"
      rows={[
        {
          month: '2026-10',
          income: '100',
          expenses: '20',
          incomeCategories: [
            { id: 'tithe', name: 'Dï¿½zimos', amount: '70' },
            { id: 'offering', name: 'Ofertas', amount: '30' },
          ],
          expenseCategories: [{ id: 'rent', name: 'Aluguel', amount: '20' }],
        },
      ]}
    />,
  );
  expect(screen.getByText('Ofertas')).toBeInTheDocument();
  expect(screen.queryByText(/Receitas ·|Despesas ·/)).not.toBeInTheDocument();
  const tithe = screen.getByLabelText(/2026-10, Receitas, Dï¿½zimos:/);
  fireEvent.mouseOver(tithe);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    /Dï¿½zimos:.*70.*Total:.*100/,
  );
  expect(screen.getByRole('tooltip')).not.toHaveTextContent(/2026-10|Receitas/);
  fireEvent.mouseLeave(tithe);
  await waitFor(() =>
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
  );
  const rent = screen.getByLabelText(/2026-10, Despesas, Aluguel:/);
  fireEvent.keyDown(document.body, { key: 'Tab' });
  rent.focus();
  fireEvent.focus(rent);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    /Aluguel:.*20.*Total:.*20/,
  );
  expect(screen.getByRole('tooltip')).not.toHaveTextContent(/2026-10|Despesas/);
});
