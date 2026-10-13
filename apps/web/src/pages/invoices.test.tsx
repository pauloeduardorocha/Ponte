import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

describe('Financial invoices tab', () => {
  beforeEach(resetTestState);
  it('lists invoices for readers without querying banking or offering imports', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['FINANCE_INVOICE_READ'])),
      'GET /finance/invoices': {
        body: {
          items: [
            {
              id: 'invoice-1',
              importId: 'source-1',
              issuerName: 'Fornecedor teste',
              issuerTaxId: '123456789',
              number: 'FT 42',
              date: '2026-10-01',
              amount: '25.00',
              currency: 'EUR',
              documentUrl: null,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        },
      },
    });
    renderApp('/finance?tab=invoices');
    expect(await screen.findByText('FT 42')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Faturas' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.queryByRole('button', { name: 'Executar scraper do e-Fatura' }),
    ).not.toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/finance/banking'))).toBe(
      false,
    );
  });

  it('runs the scraper for a processed statement and refreshes the table', async () => {
    let calls = 0;
    const requests = mockApi({
      ...sessionRoutes(
        makeUser([
          'FINANCE_INVOICE_READ',
          'FINANCE_INVOICE_IMPORT',
          'FINANCE_BANK_IMPORT',
          'FINANCE_CONTRIBUTION_READ',
        ]),
      ),
      'GET /finance/banking/pending-classification': { body: { total: 0 } },
      'GET /finance/invoices': () => {
        calls++;
        return { body: { items: [], total: 0, page: 1, pageSize: 20 } };
      },
      'GET /finance/banking/imports': {
        body: {
          items: [
            {
              id: 'bank-1',
              filename: 'outubro.csv',
              status: 'CONFIRMED',
              _count: { transactions: 2 },
            },
            {
              id: 'bank-2',
              filename: 'pendente.csv',
              status: 'UPLOADED',
              _count: { transactions: 0 },
            },
          ],
          total: 2,
          page: 1,
          pageSize: 100,
        },
      },
      'POST /finance/invoices/fetch': { body: { inserted: 2, duplicates: 0 } },
    });
    renderApp('/finance?tab=invoices');
    await screen.findByRole('option', { name: 'outubro.csv' });
    expect(
      screen.queryByRole('option', { name: 'pendente.csv' }),
    ).not.toBeInTheDocument();
    const button = screen.getByRole('button', {
      name: 'Executar scraper do e-Fatura',
    });
    expect(button).toBeDisabled();
    fireEvent.change(
      screen.getByLabelText('Extrato para consulta do e-Fatura'),
      { target: { value: 'bank-1' } },
    );
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText(/^NIF/), {
      target: { value: '123456789' },
    });
    fireEvent.change(screen.getByLabelText(/^Senha das Finanças/), {
      target: { value: 'segredo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar faturas' }));
    await waitFor(() =>
      expect(
        requests.find((r) => r.path === '/finance/invoices/fetch')?.body,
      ).toEqual({
        bankImportId: 'bank-1',
        nif: '123456789',
        password: 'segredo',
      }),
    );
    await waitFor(() => expect(calls).toBeGreaterThan(1));
    expect(screen.getByLabelText(/^Senha das Finanças/)).toHaveValue('');
  });
});
