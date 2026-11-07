import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

const currency = {
  currency: 'EUR',
  historicalDays: 7,
  averageIncome: 10,
  averageExpenses: 5,
  incomeCategories: [{ name: 'Ofertas', amount: 70 }],
  expenseCategories: [{ name: 'Energia', amount: 35 }],
  incomeCenters: [{ name: 'Sede', amount: 70 }],
  expenseCenters: [{ name: 'Sede', amount: 35 }],
  points: [
    {
      date: '2026-11-07',
      projected: false,
      balance: 135,
      income: 10,
      expenses: 5,
    },
  ],
};
describe('Treasury dashboard', () => {
  beforeEach(resetTestState);
  it('allows a dashboard reader to filter all charts and select a future end', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['FINANCE_DASHBOARD_READ'])),
      'GET /finance/charts': {
        body: { through: '2026-11-07', currencies: [currency] },
      },
    });
    renderApp('/finance?tab=dashboard');
    expect(
      await screen.findByRole('heading', { name: 'Dashboard da tesouraria' }),
    ).toBeVisible();
    expect(
      await screen.findByRole('img', {
        name: /Receitas por categoria: Ofertas/,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('img', { name: /Despesas por centro de custos: Sede/ }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('Data fim'), {
      target: { value: '2099-01-01' },
    });
    expect(await screen.findByText(/intervalo de até 1095 dias/)).toBeVisible();
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 30);
    fireEvent.change(screen.getByLabelText('Data fim'), {
      target: { value: new Date().toISOString().slice(0, 10) },
    });
    fireEvent.change(
      await screen.findByLabelText('Data fim do gráfico de linha (EUR)'),
      { target: { value: future.toISOString().slice(0, 10) } },
    );
    await waitFor(() =>
      expect(
        requests.filter((r) => r.path === '/finance/charts').length,
      ).toBeGreaterThan(1),
    );
    expect(await screen.findByText(/Base da projeção: 7 dias/)).toBeVisible();
    expect(screen.getByLabelText('Data fim')).toHaveValue(
      new Date().toISOString().slice(0, 10),
    );
    expect(
      requests.some(
        (r) =>
          r.path === '/finance/charts' &&
          r.query.get('end') === future.toISOString().slice(0, 10),
      ),
    ).toBe(true);
  });
  it('does not request charts for summary-only readers', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['FINANCE_SUMMARY_READ'])),
      'GET /finance/dashboard': {
        body: { month: '2026-11', balances: [], latestTransactions: [] },
      },
    });
    renderApp('/finance?tab=dashboard');
    await screen.findByText(/Ainda não há data de atualização disponível/);
    expect(requests.some((r) => r.path === '/finance/charts')).toBe(false);
  });
});
