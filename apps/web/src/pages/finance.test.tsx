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
  it('exposes bank attachment controls after categorization from expenses', async () => {
    mockApi({
      ...sessionRoutes(
        makeUser([
          'FINANCE_TRANSACTION_READ',
          'FINANCE_BANK_IMPORT',
          'FINANCE_CONTRIBUTION_READ',
          'FINANCE_ATTACHMENT_READ',
          'FINANCE_ATTACHMENT_WRITE',
        ]),
      ),
      'GET /finance/banking/pending-classification': { body: { total: 0 } },
      'GET /finance/expenses': {
        body: {
          items: [
            {
              id: 'expense-1',
              description: 'Despesa importada',
              bankTransactionId: 'movement-1',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        },
      },
      'GET /finance/expenses/expense-1/attachments': {
        body: [{ id: 'legacy-1', filename: 'expense.pdf', size: 8 }],
      },
      'GET /finance/banking/transactions/movement-1/attachments': {
        body: [{ id: 'bank-1', filename: 'bank.pdf', size: 8 }],
      },
    });
    renderApp('/finance?tab=expenses');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Anexos bancários' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Renomear bank.pdf' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Excluir bank.pdf' }),
    ).toBeVisible();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Documentos' }));
    expect(
      await screen.findByRole('button', { name: 'Renomear expense.pdf' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Excluir expense.pdf' }),
    ).toBeVisible();
  });
  it('opens a bank attachment deep link even after classification is complete', async () => {
    mockApi({
      ...sessionRoutes(
        makeUser(['FINANCE_BANK_IMPORT', 'FINANCE_CONTRIBUTION_READ']),
      ),
      'GET /finance/banking/pending-classification': { body: { total: 0 } },
      'GET /finance/banking/transactions/movement-1/attachments': {
        body: [{ id: 'bank-1', filename: 'bank.pdf', size: 8 }],
      },
    });
    renderApp('/finance?tab=banking&transactionId=movement-1');
    expect(
      await screen.findByRole('button', { name: 'Renomear bank.pdf' }),
    ).toBeVisible();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
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
