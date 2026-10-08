import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@church/shared';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
const row = {
  id: 'transaction-1',
  date: '2026-10-07',
  amount: '25.10',
  direction: 'CREDIT',
  description: 'João Silva dízimo',
  reference: 'REF1',
  status: 'RECONCILED',
  category: { id: 'category-1', name: 'Dízimos' },
  rowNumber: 9,
  import: {
    id: 'import-1',
    filename: 'millennium.xlsx',
    status: 'CONFIRMED',
    account: { currency: 'EUR' },
  },
  reconciliations: [],
};
const imported = {
  id: 'import-1',
  filename: 'millennium.xlsx',
  status: 'CONFIRMED',
  accountId: 'account-1',
  summary: { registered: 1, ignored: 0, pending: 0 },
  _count: { transactions: 1 },
};
const page = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 20,
});
function routes() {
  return {
    ...sessionRoutes(
      makeUser(PERMISSIONS.filter((p) => p.startsWith('FINANCE_'))),
    ),
    'GET /finance/banking/imports': { body: page([imported]) },
    'GET /finance/banking/transactions': { body: page([row]) },
    'GET /finance/banking/imports/import-1': { body: imported },
    'GET /finance/accounts': {
      body: page([{ id: 'account-1', name: 'Millennium', currency: 'EUR' }]),
    },
    'GET /finance/categories': {
      body: page([{ id: 'category-1', name: 'Dízimos', kind: 'INCOME' }]),
    },
    'GET /finance/banking/members': {
      body: page([{ id: 'member-1', name: 'João Silva' }]),
    },
    'GET /finance/banking/transactions/transaction-1/suggestions': {
      body: [{ id: 'member-1', name: 'João Silva', confidence: 95 }],
    },
    'POST /finance/banking/classify': { body: { count: 1 } },
    'POST /finance/banking/imports': { status: 201, body: imported },
    'POST /finance/banking/imports/import-1/confirm': {
      body: { id: 'import-1', status: 'CONFIRMED' },
    },
    'POST /finance/banking/reconcile': { body: { items: [] } },
    'POST /finance/banking/undo': { body: { count: 1 } },
  };
}
function select(label: string, option: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}
describe('Bank statement review', () => {
  beforeEach(resetTestState);
  it('shows invoice suggestions and associates only after explicit confirmation', async () => {
    const invoice = {
      id: 'invoice-1',
      importId: 'invoice-import-1',
      issuerName: 'Energia',
      issuerTaxId: '123456789',
      number: 'FT/99',
      amount: '25.10',
      date: '2026-10-07',
      currency: 'EUR',
      documentUrl: 'https://faturas.portaldasfinancas.gov.pt/detalhe?id=99',
      score: 70,
      reasons: ['Valor e moeda iguais'],
    };
    const requests = mockApi({
      ...routes(),
      'GET /finance/invoices/suggestions/transaction-1': { body: [invoice] },
      'GET /finance/invoices': { body: page([invoice]) },
      'POST /finance/invoices/invoice-1/association': { body: invoice },
    });
    renderApp('/finance?tab=banking');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Associar fatura' }),
    );
    await screen.findByText('Energia · FT/99');
    expect(
      screen.getByRole('link', { name: 'Abrir fatura no portal' }),
    ).toHaveAttribute('href', invoice.documentUrl);
    expect(requests.some((r) => r.path.endsWith('/association'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Associar FT/99' }));
    await waitFor(() =>
      expect(
        requests.find((r) => r.path.endsWith('/association'))?.body,
      ).toEqual({ transactionId: row.id }),
    );
  });
  it('fetches invoices with credentials and the selected import, without exporting JSON', async () => {
    const requests = mockApi({
      ...routes(),
      'POST /finance/invoices/fetch': { body: { inserted: 2, duplicates: 0 } },
      'GET /finance/banking/imports/import-1': {
        body: {
          ...imported,
          period: { start: '2026-08-01', end: '2026-10-07' },
        },
      },
    });
    renderApp('/finance?tab=banking&importId=import-1');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Buscar faturas no e-Fatura' }),
    );
    await screen.findByText('Período: 2026-08-01 a 2026-10-07');
    fireEvent.change(screen.getByRole('textbox', { name: /^NIF/ }), {
      target: { value: '123456789' },
    });
    fireEvent.change(screen.getByLabelText(/Senha das Finanças/), {
      target: { value: 'test-secret' },
    });
    fireEvent.submit(document.getElementById('efatura-fetch')!);
    await waitFor(() =>
      expect(
        requests.find((r) => r.path === '/finance/invoices/fetch')?.body,
      ).toEqual({
        bankImportId: 'import-1',
        nif: '123456789',
        password: 'test-secret',
      }),
    );
    expect(screen.getByLabelText(/Senha das Finanças/)).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: 'Exportar período para o scraper' }),
    ).not.toBeInTheDocument();
  });
  it('saves a quick category for just the chosen movement and keeps association explicit', async () => {
    const requests = mockApi(routes());
    renderApp('/finance?tab=banking');
    await screen.findByRole('heading', { name: row.description });
    fireEvent.mouseDown(
      screen.getByRole('combobox', {
        name: `Categoria rápida — ${row.description}`,
      }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Dízimos' }));
    await waitFor(() =>
      expect(
        requests.find((r) => r.path === '/finance/banking/classify')?.body,
      ).toEqual({
        ids: ['transaction-1'],
        classification: 'INCOME',
        categoryId: 'category-1',
        acceptDuplicate: false,
      }),
    );
    expect(
      await screen.findByText(
        'Categoria salva. Continue com o próximo movimento.',
      ),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path.endsWith('/suggestions'))).toBe(false);
  });
  it('selects only credits and sends paginated search/type filters to the server', async () => {
    const requests = mockApi({
      ...routes(),
      'GET /finance/banking/transactions': {
        body: page([
          row,
          { ...row, id: 'debit-1', direction: 'DEBIT', description: 'Energia' },
        ]),
      },
    });
    renderApp('/finance?tab=banking');
    await screen.findByRole('heading', { name: row.description });
    fireEvent.click(
      screen.getByRole('button', { name: 'Selecionar créditos' }),
    );
    expect(
      screen.getByRole('checkbox', { name: `Selecionar ${row.description}` }),
    ).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Selecionar Energia' }),
    ).not.toBeChecked();
    select('Itens por página', '100');
    select('Crédito / débito', 'Débitos (despesas)');
    fireEvent.change(screen.getByLabelText('Pesquisar movimentos'), {
      target: { value: 'Energia' },
    });
    await waitFor(() =>
      expect(
        requests
          .filter((r) => r.path === '/finance/banking/transactions')
          .at(-1)
          ?.query.get('search'),
      ).toBe('Energia'),
    );
    const query = requests
      .filter((r) => r.path === '/finance/banking/transactions')
      .at(-1)?.query;
    expect(query?.get('pageSize')).toBe('100');
    expect(query?.get('direction')).toBe('DEBIT');
  });
  it('classifies a debit inline without using the bulk selection', async () => {
    const requests = mockApi({
      ...routes(),
      'GET /finance/banking/transactions': {
        body: page([
          row,
          {
            ...row,
            id: 'transaction-2',
            direction: 'DEBIT',
            description: 'Energia',
            category: null,
          },
        ]),
      },
      'GET /finance/categories': {
        body: page([
          { id: 'expense-category', name: 'Energia', kind: 'EXPENSE' },
        ]),
      },
      'GET /finance/suppliers': { body: page([]) },
    });
    renderApp('/finance?tab=banking');
    expect(await screen.findByText('Crédito +25.10 EUR')).toBeInTheDocument();
    expect(screen.getByText('Débito −25.10 EUR')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'João Silva dízimo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Categoria: Dízimos')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Selecionar João Silva dízimo' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar despesa' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(requests.some((r) => r.path === '/finance/categories')).toBe(true),
    );
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Categoria' }));
    await screen.findByRole('option', { name: 'Energia' });
    fireEvent.click(screen.getByRole('option', { name: 'Energia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(
        requests.find((r) => r.path === '/finance/banking/classify')?.body,
      ).toMatchObject({
        ids: ['transaction-2'],
        classification: 'EXPENSE',
        categoryId: 'expense-category',
      }),
    );
  });
  it('imports automatically and requires explicit member association', async () => {
    const requests = mockApi(routes());
    renderApp('/finance?tab=banking');
    expect(await screen.findByText('João Silva dízimo')).toBeInTheDocument();
    select('Conta bancária', 'Millennium (EUR)');
    fireEvent.change(screen.getByLabelText('Extrato bancário'), {
      target: {
        files: [
          new File(['sample'], 'millennium.xlsx', {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Importar extrato' }));
    await waitFor(() =>
      expect(
        requests.some(
          (r) => r.method === 'POST' && r.path === '/finance/banking/imports',
        ),
      ).toBe(true),
    );
    expect(
      requests.some(
        (r) => r.path === '/finance/incomes' && r.method === 'POST',
      ),
    ).toBe(false);
    await screen.findByText(
      '1 registros cadastrados; 0 ignorados; 0 aguardando revisão. Você pode categorizar agora ou depois.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Selecionar João Silva dízimo' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Categorizar selecionados' }),
    );
    expect(
      await screen.findByText('João Silva · 95% de correspondência'),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path === '/finance/banking/classify')).toBe(
      false,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Associar' }));
    select('Categoria', 'Dízimos');
    select('Tipo da contribuição', 'Dízimo');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(
        requests.find((r) => r.path === '/finance/banking/classify')?.body,
      ).toMatchObject({
        ids: ['transaction-1'],
        classification: 'INCOME',
        categoryId: 'category-1',
        memberId: 'member-1',
        contributionType: 'TITHE',
      }),
    );
  });
  it('uses a history dialog and has no confirmation or reconciliation step', async () => {
    const requests = mockApi(routes());
    renderApp('/finance?tab=banking');
    await screen.findByRole('heading', { name: row.description });
    expect(
      screen.queryByRole('combobox', { name: 'Importação' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: /Conciliar|Confirmar importação|Desfazer conciliação/,
      }),
    ).not.toBeInTheDocument();
    expect(requests.some((r) => r.path === '/finance/banking/imports')).toBe(
      false,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Histórico de importações' }),
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: /millennium.xlsx · Importado/,
      }),
    );
    await waitFor(() =>
      expect(
        requests
          .filter((r) => r.path === '/finance/banking/transactions')
          .at(-1)
          ?.query.get('importId'),
      ).toBe('import-1'),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });
  it('links a possible duplicate to an existing income without a reconciliation step', async () => {
    const requests = mockApi({
      ...routes(),
      'GET /finance/banking/transactions': {
        body: page([
          {
            ...row,
            status: 'POSSIBLE_DUPLICATE',
            import: { ...row.import, accountId: 'account-1' },
          },
        ]),
      },
      'GET /finance/incomes': {
        body: page([
          {
            id: 'income-1',
            description: 'Receita manual',
            amount: '25.10',
            date: '2026-10-07',
            status: 'COMPLETED',
          },
        ]),
      },
      'POST /finance/banking/transactions/transaction-1/link': {
        body: { id: 'transaction-1' },
      },
    });
    renderApp('/finance?tab=banking');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Vincular a receita existente',
      }),
    );
    await screen.findByRole('option', { name: /Receita manual/ });
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Receita existente' }),
      { target: { value: 'income-1' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Vincular registro' }));
    await waitFor(() =>
      expect(
        requests.find((r) => r.path.endsWith('/transaction-1/link'))?.body,
      ).toEqual({ incomeId: 'income-1' }),
    );
    expect(requests.some((r) => r.path.endsWith('/reconcile'))).toBe(false);
  });
  it('hides banking and makes no bank queries without contribution permissions', async () => {
    const requests = mockApi({
      ...sessionRoutes(
        makeUser(['FINANCE_TRANSACTION_READ', 'FINANCE_BANK_IMPORT']),
      ),
      'GET /finance/incomes': { body: page([]) },
    });
    renderApp('/finance');
    await screen.findByText('Nenhum registro.');
    expect(
      screen.queryByRole('tab', { name: 'Importação bancária' }),
    ).not.toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/finance/banking'))).toBe(
      false,
    );
  });
});
