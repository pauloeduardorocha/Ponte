import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
describe('Finance permissions and dashboard', () => {
  beforeEach(resetTestState);
  it('denies users without financial access and does not query finance', async () => {
    const requests = mockApi(sessionRoutes(makeUser(['MEMBER_READ'])));
    renderApp('/finance');
    expect(
      await screen.findByText('Sem permissão financeira.'),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/finance'))).toBe(false);
  });
  it('renders separate currencies and never queries contributions without permission', async () => {
    const requests = mockApi({
      ...sessionRoutes(
        makeUser(['FINANCE_DASHBOARD_READ', 'FINANCE_TRANSACTION_READ']),
      ),
      'GET /finance/dashboard': {
        body: {
          month: '2026-10',
          balances: [
            {
              currency: 'EUR',
              income: '100',
              expenses: '20',
              balance: '80',
              pendingIncome: '3',
              pendingExpenses: '5',
            },
          ],
          latestTransactions: [],
        },
      },
      'GET /finance/incomes': {
        body: { items: [], total: 0, page: 1, pageSize: 20 },
      },
    });
    renderApp('/finance');
    expect(await screen.findByText(/80,00/)).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Contribuições' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Receitas' }));
    await waitFor(() =>
      expect(requests.some((r) => r.path === '/finance/incomes')).toBe(true),
    );
    expect(requests.some((r) => r.path === '/finance/contributions')).toBe(
      false,
    );
    expect(
      screen.queryByRole('button', { name: /Cadastrar/ }),
    ).not.toBeInTheDocument();
  });
  it('confirms account deletion and refreshes the list', async () => {
    let exists = true;
    const account = {
      id: 'account-1',
      name: 'Conta de teste',
      bank: 'Banco',
      currency: 'EUR',
      status: 'ACTIVE',
      openingBalance: '0',
    };
    const requests = mockApi({
      ...sessionRoutes(
        makeUser(['FINANCE_ACCOUNT_READ', 'FINANCE_ACCOUNT_WRITE']),
      ),
      'GET /finance/accounts': () => ({
        body: {
          items: exists ? [account] : [],
          total: exists ? 1 : 0,
          page: 1,
          pageSize: 20,
        },
      }),
      'DELETE /finance/accounts/account-1': () => {
        exists = false;
        return { body: account };
      },
    });
    renderApp('/finance?tab=accounts');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Excluir conta' }),
    );
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await screen.findByText('Conta bancária excluída.');
    await screen.findByText('Nenhum registro.');
    expect(requests.filter((r) => r.method === 'DELETE')).toHaveLength(1);
  });
  it('hides account deletion from read-only users', async () => {
    mockApi({
      ...sessionRoutes(makeUser(['FINANCE_ACCOUNT_READ'])),
      'GET /finance/accounts': {
        body: {
          items: [
            { id: 'account-1', name: 'Conta de teste', status: 'ACTIVE' },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        },
      },
    });
    renderApp('/finance?tab=accounts');
    await screen.findByText('Conta de teste');
    expect(
      screen.queryByRole('button', { name: 'Excluir conta' }),
    ).not.toBeInTheDocument();
  });
});
