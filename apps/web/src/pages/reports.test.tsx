import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, beforeEach, expect } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
const report = {
  report: 'incomes',
  filters: { report: 'incomes', start: '2026-10-01', end: '2026-10-07' },
  church: { name: 'Igreja' },
  member: null,
  purpose: 'Apoio fiscal',
  basis: 'Data do lançamento',
  observations: '',
  count: 1,
  totals: [
    { currency: 'EUR', income: '25.10', expenses: '0.00', net: '25.10' },
  ],
  groups: [],
  balances: [],
  rows: [
    {
      id: 'income-1',
      kind: 'INCOME',
      date: '2026-10-07',
      amount: '25.10',
      currency: 'EUR',
      direction: 'CREDIT',
      description: 'Receita',
      account: 'Banco',
      category: 'Dízimos',
      member: '',
      supplier: '',
      contributionType: '',
      origin: 'Manual',
      reference: 'REF1',
      status: 'COMPLETED',
      bankTransactionId: null,
      contributionId: null,
    },
  ],
};
describe('Reports page', () => {
  beforeEach(resetTestState);
  it('generates filtered reports and links each row to its ledger', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['FINANCE_TRANSACTION_READ'])),
      'GET /finance/reports/lookups': { body: [] },
      'GET /finance/reports': { body: report },
    });
    renderApp('/finance?tab=reports');
    const generate = await screen.findByRole('button', {
      name: 'Gerar relatório',
    });
    fireEvent.change(screen.getByLabelText('Centro de custo'), {
      target: { value: 'Sede' },
    });
    fireEvent.click(generate);
    expect(
      await screen.findByRole('link', { name: 'Abrir origem' }),
    ).toHaveAttribute('href', '/finance?tab=incomes&record=income-1');
    await waitFor(() =>
      expect(
        requests
          .find((r) => r.path === '/finance/reports')
          ?.query.get('costCenter'),
      ).toBe('Sede'),
    );
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeEnabled();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Relatório' }));
    expect(
      screen.queryByRole('option', { name: 'Contribuições por membro' }),
    ).not.toBeInTheDocument();
  });
  it('allows viewing member reports but disables exports without the export permission', async () => {
    mockApi({
      ...sessionRoutes(
        makeUser(['FINANCE_TRANSACTION_READ', 'FINANCE_CONTRIBUTION_READ']),
      ),
      'GET /finance/reports/lookups': { body: [] },
      'GET /finance/reports': { body: { ...report, report: 'tithes' } },
    });
    renderApp('/finance?tab=reports');
    await screen.findByRole('button', { name: 'Gerar relatório' });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Relatório' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dízimos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar relatório' }));
    expect(
      await screen.findByRole('button', { name: 'Exportar XLSX' }),
    ).toBeDisabled();
  });
});
