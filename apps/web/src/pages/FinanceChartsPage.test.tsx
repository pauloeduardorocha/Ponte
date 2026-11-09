import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    resetTestState();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  it('opens a separate page from the financial menu and keeps treasury tabs unchanged', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['FINANCE_TRANSACTION_READ'])),
      'GET /finance/incomes': {
        body: { items: [], total: 0, page: 1, pageSize: 20 },
      },
      'GET /finance/charts': { body: { currencies: [] } },
    });
    renderApp('/finance');
    await screen.findByText('Nenhum registro.');
    expect(
      screen.queryByRole('tab', { name: 'Dashboard' }),
    ).not.toBeInTheDocument();
    expect(requests.some((r) => r.path === '/finance/charts')).toBe(false);
    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
    await screen.findByRole('heading', { name: 'Dashboard da tesouraria' });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('redirects the old tab address to the new page', async () => {
    mockApi({
      ...sessionRoutes(makeUser(['FINANCE_TRANSACTION_READ'])),
      'GET /finance/charts': { body: { currencies: [] } },
    });
    renderApp('/finance?tab=dashboard');
    await screen.findByRole('heading', { name: 'Dashboard da tesouraria' });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
  it('allows a detailed financial data reader to filter all charts and select a future end', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['FINANCE_TRANSACTION_READ'])),
      'GET /finance/charts': {
        body: { through: '2026-11-07', currencies: [currency] },
      },
    });
    renderApp('/finance/dashboard');
    expect(
      await screen.findByRole(
        'heading',
        { name: 'Dashboard da tesouraria' },
        { timeout: 10000 },
      ),
    ).toBeVisible();
    expect(
      await screen.findByRole('img', {
        name: /Receitas por categoria: Ofertas/,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('img', { name: /Despesas por centro de custos: Sede/ }),
    ).toBeVisible();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/finance/dashboard',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar Saldo' }));
    expect(
      screen.getByRole('button', { name: 'Mostrar Saldo' }),
    ).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar Saldo' }));
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
  it.each(['FINANCE_SUMMARY_READ', 'FINANCE_DASHBOARD_READ'] as const)(
    'does not request charts with only %s',
    async (permission) => {
      const requests = mockApi({
        ...sessionRoutes(makeUser([permission])),
        'GET /finance/dashboard': {
          body: { month: '2026-11', balances: [], latestTransactions: [] },
        },
      });
      renderApp('/finance/dashboard');
      await screen.findByRole('heading', { name: 'Acesso negado' });
      expect(
        screen.queryByRole('link', { name: 'Dashboard' }),
      ).not.toBeInTheDocument();
      expect(requests.some((r) => r.path === '/finance/charts')).toBe(false);
    },
  );
});
