import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
    'GET /finance/banking/pending-classification': { body: { total: 0 } },
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
async function uploadStatement() {
  await screen.findByRole('combobox', { name: 'Conta bancária' });
  await waitFor(() =>
    expect(
      screen.getByRole('combobox', { name: 'Conta bancária' }),
    ).toBeEnabled(),
  );
  select('Conta bancária', 'Millennium (EUR)');
  fireEvent.change(screen.getByLabelText('Extrato bancário'), {
    target: {
      files: [new File(['date,amount'], 'extrato.csv', { type: 'text/csv' })],
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Importar extrato' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
  await screen.findByRole('dialog', { name: 'Categorizar movimentação' });
}
describe('Bank statement review', () => {
  beforeEach(resetTestState);
  it('suggests invoices inside categorization and shows saved associations immediately', async () => {
    const invoice = {
      id: 'invoice-1',
      importId: 'source-1',
      issuerName: 'Fornecedor',
      issuerTaxId: '123456789',
      number: 'FT 42',
      date: '2026-10-07',
      amount: '25.10',
      currency: 'EUR',
      documentUrl: null,
      score: 95,
    };
    const requests = mockApi({
      ...routes(),
      'GET /finance/invoices/suggestions/transaction-1': { body: [invoice] },
      'POST /finance/invoices/invoice-1/association': {
        body: { ...invoice, bankTransactionId: row.id, associatedBy: 'user-1' },
      },
      'DELETE /finance/invoices/invoice-1/association': { body: invoice },
    });
    renderApp('/finance?tab=banking');
    await uploadStatement();
    const dialog = screen.getByRole('dialog', {
      name: 'Categorizar movimenta\u00e7\u00e3o',
    });
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Associar FT 42' }),
    );
    expect(await within(dialog).findByText('Fatura associada')).toBeVisible();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(
      requests.find(
        (r) => r.method === 'POST' && r.path.endsWith('/association'),
      )?.body,
    ).toEqual({ transactionId: row.id });
    expect(
      within(dialog).queryByRole('button', { name: 'Associar FT 42' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Remover associa\u00e7\u00e3o',
      }),
    );
    await waitFor(() =>
      expect(
        within(dialog).queryByText('Fatura associada'),
      ).not.toBeInTheDocument(),
    );
    expect(
      await within(dialog).findByRole('button', { name: 'Associar FT 42' }),
    ).toBeVisible();
  });
  it('searches and selects a member in one field and saves the selected member', async () => {
    const requests = mockApi({
      ...routes(),
      'GET /finance/banking/members': (request) => ({
        body: page(
          request.query.get('search') === 'Maria'
            ? [{ id: 'member-2', name: 'Maria Costa' }]
            : [{ id: 'member-1', name: 'Jo\u00e3o Silva' }],
        ),
      }),
      'GET /finance/cost-centers': {
        body: page([{ id: 'center-1', name: 'Comunidade' }]),
      },
    });
    renderApp('/finance?tab=banking');
    await uploadStatement();
    expect(screen.queryByLabelText('Pesquisar membro')).not.toBeInTheDocument();
    const memberField = screen.getByRole('combobox', { name: 'Membro' });
    fireEvent.focus(memberField);
    fireEvent.change(memberField, { target: { value: 'Maria' } });
    await waitFor(() =>
      expect(requests.some((r) => r.query.get('search') === 'Maria')).toBe(
        true,
      ),
    );
    fireEvent.click(
      await screen.findByRole(
        'option',
        { name: 'Maria Costa' },
        { timeout: 3000 },
      ),
    );
    expect(memberField).toHaveValue('Maria Costa');
    await waitFor(() =>
      expect(
        requests.some(
          (request) =>
            request.path === '/finance/banking/members' &&
            !request.query.get('search'),
        ),
      ).toBe(true),
    );
    expect(memberField).toHaveValue('Maria Costa');
    select('Categoria', 'D\u00edzimos');
    await screen.findByRole('option', { name: 'Comunidade' });
    fireEvent.change(
      screen.getByRole('combobox', { name: /Centro de custo/ }),
      {
        target: { value: 'center-1' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pr\u00f3xima' }));
    await waitFor(() =>
      expect(
        requests.find((request) => request.path === '/finance/banking/classify')
          ?.body,
      ).toMatchObject({ memberId: 'member-2' }),
    );
  });
  it('selects suggested members in the same searchable field and clears the association', async () => {
    mockApi(routes());
    renderApp('/finance?tab=banking');
    await uploadStatement();
    fireEvent.click(await screen.findByRole('button', { name: 'Associar' }));
    expect(screen.getByRole('combobox', { name: 'Membro' })).toHaveValue(
      'Jo\u00e3o Silva',
    );
    expect(
      screen.getByRole('combobox', { name: 'Tipo da contribui\u00e7\u00e3o' }),
    ).toBeVisible();
    fireEvent.focus(screen.getByRole('combobox', { name: 'Membro' }));
    fireEvent.click(screen.getByTitle('Ignorar associa\u00e7\u00e3o'));
    expect(screen.getByRole('combobox', { name: 'Membro' })).toHaveValue('');
    expect(
      screen.queryByRole('combobox', {
        name: 'Tipo da contribui\u00e7\u00e3o',
      }),
    ).not.toBeInTheDocument();
  });
  it('keeps the upload screen free of movements and only loads history on demand', async () => {
    const requests = mockApi(routes());
    renderApp('/finance?tab=banking');
    await screen.findByRole('button', { name: 'Importar extrato' });
    expect(screen.queryByText(row.description)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Pesquisar movimentos'),
    ).not.toBeInTheDocument();
    expect(
      requests.some((r) => r.path === '/finance/banking/transactions'),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole('button', { name: 'Histórico de importações' }),
    );
    const importRow = await screen.findByRole('row', {
      name: /millennium.xlsx/,
    });
    expect(within(importRow).getByText(/Importado/)).toBeVisible();
    const openImport = within(importRow).getByRole('button', {
      name: 'Abrir importação',
    });
    expect(openImport).toBeVisible();
    expect(openImport.closest('td')).toBe(importRow.lastElementChild);
  });
  it('saves category and cost center per movement, advances, and completes the queue', async () => {
    const requests = mockApi({
      ...routes(),
      'GET /finance/banking/transactions': {
        body: page([
          row,
          { ...row, id: 'transaction-2', description: 'Segunda receita' },
        ]),
      },
      'GET /finance/cost-centers': {
        body: page([{ id: 'center-1', name: 'Comunidade' }]),
      },
    });
    renderApp('/finance?tab=banking');
    await uploadStatement();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
    select('Categoria', 'Dízimos');
    await screen.findByRole('option', { name: 'Comunidade' });
    fireEvent.change(
      screen.getByRole('combobox', { name: /Centro de custo/ }),
      { target: { value: 'center-1' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByRole('heading', { name: 'Segunda receita' });
    expect(
      requests.find((r) => r.path === '/finance/banking/classify')?.body,
    ).toEqual({
      ids: ['transaction-1'],
      classification: 'INCOME',
      customDescription: row.description,
      categoryId: 'category-1',
      costCenterId: 'center-1',
      acceptDuplicate: false,
    });
    expect(screen.getByText('Movimento 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
    select('Categoria', 'Dízimos');
    fireEvent.change(
      screen.getByRole('combobox', { name: /Centro de custo/ }),
      { target: { value: 'center-1' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByText(
      'Revisão concluída. Todas as movimentações foram percorridas. Os movimentos pulados continuam pendentes de categorização.',
    );
  });
  it('can stop without saving the current movement and provides ledger links', async () => {
    const requests = mockApi(routes());
    renderApp('/finance?tab=banking');
    await uploadStatement();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar depois' }));
    await screen.findByText(
      'Progresso salvo. Continue pelo menu Receitas ou Despesas, editando os itens normalmente.',
    );
    expect(requests.some((r) => r.path === '/finance/banking/classify')).toBe(
      false,
    );
    expect(
      await screen.findByRole('link', { name: 'Ir para Receitas' }),
    ).toHaveAttribute('href', '/finance?tab=incomes');
  });
  it('keeps the movement open if saving fails and requires duplicate acceptance', async () => {
    mockApi({
      ...routes(),
      'GET /finance/banking/transactions': {
        body: page([
          {
            ...row,
            status: 'POSSIBLE_DUPLICATE',
            categoryId: 'category-1',
            costCenterId: 'center-1',
            duplicateReason: 'Possível duplicidade',
          },
        ]),
      },
      'GET /finance/cost-centers': {
        body: page([{ id: 'center-1', name: 'Comunidade' }]),
      },
      'POST /finance/banking/classify': {
        status: 409,
        body: { message: 'Não foi possível salvar' },
      },
    });
    renderApp('/finance?tab=banking');
    await uploadStatement();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Revisei e aceito/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByText('Não foi possível salvar');
    expect(screen.getByText('Movimento 1 de 1')).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: 'Categorizar movimentação' }),
    ).toBeInTheDocument();
  });
  it('warns about a possible replica and discards it without category, cost center or duplicate acceptance', async () => {
    const requests = mockApi({
      ...routes(),
      'GET /finance/banking/transactions': {
        body: page([
          {
            ...row,
            status: 'POSSIBLE_DUPLICATE',
            duplicateReason: 'Mesmo valor e referência',
          },
          { ...row, id: 'transaction-2', description: 'Próximo movimento' },
        ]),
      },
    });
    renderApp('/finance?tab=banking');
    await uploadStatement();
    expect(screen.getByText('Possível réplica')).toBeInTheDocument();
    expect(screen.getByText('Mesmo valor e referência')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Descartar movimento' }),
    );
    await screen.findByRole('heading', { name: 'Próximo movimento' });
    expect(
      requests.find((r) => r.path === '/finance/banking/classify')?.body,
    ).toEqual({
      ids: ['transaction-1'],
      classification: 'IGNORE',
      customDescription: row.description,
      acceptDuplicate: false,
    });
    expect(
      screen.queryByRole('button', { name: 'Descartar movimento' }),
    ).not.toBeInTheDocument();
  });
  it('opens pending movements from Finance across imports and pages and refreshes the count after saving', async () => {
    let total = 2;
    const uncategorized = {
      ...row,
      categoryId: '00000000-0000-4000-8000-000000000001',
      category: {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Sem categoria',
      },
    };
    const requests = mockApi({
      ...routes(),
      'GET /finance/incomes': { body: page([]) },
      'GET /finance/banking/pending-classification': () => ({
        body: { total },
      }),
      'GET /finance/banking/transactions': (r) => ({
        body: {
          items:
            r.query.get('page') === '2'
              ? [
                  {
                    ...uncategorized,
                    id: 'transaction-2',
                    description: 'Outro extrato',
                    import: { ...row.import, id: 'import-2' },
                  },
                ]
              : [uncategorized],
          total: 2,
          page: Number(r.query.get('page')),
          pageSize: 1,
        },
      }),
      'GET /finance/cost-centers': {
        body: page([{ id: 'center-1', name: 'Comunidade' }]),
      },
      'POST /finance/banking/classify': () => {
        total--;
        return { body: { count: 1 } };
      },
    });
    renderApp('/finance?tab=incomes');
    await screen.findByText('2 movimentos aguardam categorização');
    fireEvent.click(
      screen.getByRole('button', { name: 'Categorizar movimentos' }),
    );
    await screen.findByRole('dialog', { name: 'Categorizar movimentação' });
    expect(screen.getByText('Movimento 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
    const loads = requests.filter(
      (r) => r.path === '/finance/banking/transactions',
    );
    expect(loads).toHaveLength(2);
    expect(
      loads.every(
        (r) =>
          r.query.get('pendingClassification') === 'true' &&
          !r.query.has('importId'),
      ),
    ).toBe(true);
    expect(
      screen.queryByRole('dialog', { name: 'Buscar faturas deste extrato?' }),
    ).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Categoria' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Dízimos' }));
    await screen.findByRole('option', { name: 'Comunidade' });
    fireEvent.change(
      screen.getByRole('combobox', { name: /Centro de custo/ }),
      { target: { value: 'center-1' } },
    );
    expect(screen.getByRole('textbox', { name: 'Descrição' })).toHaveValue(
      row.description,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Descrição' }), {
      target: { value: '  Oferta da comunidade  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByRole('heading', { name: 'Outro extrato' });
    expect(screen.getByRole('textbox', { name: 'Descrição' })).toHaveValue(
      'Outro extrato',
    );
    expect(
      requests.find((r) => r.path === '/finance/banking/classify')?.body,
    ).toMatchObject({ customDescription: 'Oferta da comunidade' });
    await screen.findByText('1 movimento aguarda categorização');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar depois' }));
    await screen.findByRole('button', { name: 'Categorizar movimentos' });
    expect(
      requests.filter((r) => r.path === '/finance/banking/classify'),
    ).toHaveLength(1);
  });
  it('skips movements without saving and keeps them pending after review', async () => {
    const requests = mockApi({
      ...routes(),
      'GET /finance/incomes': { body: page([]) },
      'GET /finance/banking/pending-classification': { body: { total: 2 } },
      'GET /finance/banking/transactions': {
        body: page([
          row,
          { ...row, id: 'transaction-2', description: 'Outro extrato' },
        ]),
      },
    });
    renderApp('/finance?tab=incomes');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Categorizar movimentos' }),
    );
    await screen.findByRole('dialog', { name: 'Categorizar movimentação' });
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Descrição' }), {
      target: { value: 'Alteração não salva' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
    await screen.findByRole('heading', { name: 'Outro extrato' });
    expect(screen.getByText('Movimento 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Descrição' })).toHaveValue(
      'Outro extrato',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
    await screen.findByText(/Revisão concluída/);
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Categorizar movimentação' }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText('2 movimentos aguardam categorização'),
    ).toBeInTheDocument();
    expect(
      requests.filter((r) => r.path === '/finance/banking/classify'),
    ).toHaveLength(0);
  });
  it('hides the pending alert when there are no movements to categorize', async () => {
    mockApi({ ...routes(), 'GET /finance/incomes': { body: page([]) } });
    renderApp('/finance?tab=incomes');
    await screen.findByText('Nenhum registro.');
    expect(
      screen.queryByRole('button', { name: 'Categorizar movimentos' }),
    ).not.toBeInTheDocument();
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
