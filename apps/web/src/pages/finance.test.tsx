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
  it.each(['incomes', 'expenses'])(
    'removes status from %s lists and forms',
    async (route) => {
      mockApi({
        ...sessionRoutes(
          makeUser(['FINANCE_TRANSACTION_READ', 'FINANCE_TRANSACTION_CREATE']),
        ),
        [`GET /finance/${route}`]: {
          body: {
            items: [
              {
                id: 'movement-1',
                description: 'Movimento de teste',
                status: 'COMPLETED',
              },
            ],
            total: 1,
            page: 1,
            pageSize: 20,
          },
        },
      });
      renderApp(`/finance?tab=${route}`);
      await screen.findByText('Movimento de teste');
      expect(screen.queryByText('Concluído')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^Cadastrar/ }));
      await screen.findByRole('dialog');
      expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    },
  );
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
  it('reviews undocumented expenses and associates a suggested invoice', async () => {
    const expense = {
      id: 'expense-1',
      description: 'Compra de material',
      amount: '20.00',
      date: '2026-10-14',
      account: { currency: 'EUR' },
    };
    const invoice = {
      id: 'invoice-1',
      importId: 'import-1',
      issuerName: 'Loja',
      issuerTaxId: '123456789',
      number: 'FT-1',
      date: '2026-10-14',
      amount: '20.00',
      currency: 'EUR',
      documentUrl: null,
    };
    const requests = mockApi({
      ...sessionRoutes(
        makeUser([
          'FINANCE_TRANSACTION_READ',
          'FINANCE_ATTACHMENT_READ',
          'FINANCE_ATTACHMENT_WRITE',
          'FINANCE_INVOICE_READ',
          'FINANCE_INVOICE_ASSOCIATE',
        ]),
      ),
      'GET /finance/expenses': {
        body: { items: [expense], total: 1, page: 1, pageSize: 20 },
      },
      'GET /finance/expenses/expense-1/attachments': { body: [] },
      'GET /finance/invoices': {
        body: { items: [], total: 0, page: 1, pageSize: 100 },
      },
      'GET /finance/invoices/expense-suggestions/expense-1': {
        body: [invoice],
      },
      'POST /finance/invoices/invoice-1/expense-association': {
        body: { ...invoice, expenseId: expense.id },
      },
    });
    renderApp('/finance?tab=expenses');
    await screen.findByText('1 despesa sem anexo nem fatura associada');
    fireEvent.click(screen.getByRole('button', { name: 'Anexar documento' }));
    await screen.findByRole('dialog');
    expect(
      await screen.findByLabelText('Selecionar anexos'),
    ).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Associar FT-1' }),
    );
    await waitFor(() =>
      expect(
        requests.some(
          (r) =>
            r.method === 'POST' &&
            r.path === '/finance/invoices/invoice-1/expense-association',
        ),
      ).toBe(true),
    );
    expect(
      requests.find(
        (r) =>
          r.method === 'POST' &&
          r.path === '/finance/invoices/invoice-1/expense-association',
      )?.body,
    ).toEqual({ expenseId: expense.id });
    fireEvent.click(screen.getByRole('button', { name: 'Concluir revisão' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
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
    const balance = await screen.findByText(/80,00/);
    expect(balance).toBeInTheDocument();
    const cards = balance.closest('.metric-grid')!;
    expect(cards.children).toHaveLength(3);
    expect(cards.children[0]).toHaveTextContent('Receitas');
    expect(cards.children[1]).toHaveTextContent('Despesas');
    expect(cards.children[2]).toHaveTextContent('Saldo');
    expect(screen.queryByText('Receitas pendentes')).not.toBeInTheDocument();
    expect(screen.queryByText('Despesas pendentes')).not.toBeInTheDocument();
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
