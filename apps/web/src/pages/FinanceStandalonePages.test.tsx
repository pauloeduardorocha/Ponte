import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
import type { Permission } from '../lib/types';

describe('Separate financial pages', () => {
  beforeEach(resetTestState);

  it('opens reports as a separate page for detailed financial readers', async () => {
    const requests = mockApi(
      sessionRoutes(makeUser(['FINANCE_TRANSACTION_READ'])),
    );
    renderApp('/finance/reports');
    await screen.findByRole('heading', {
      name: 'Relatórios financeiros',
      level: 1,
    });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Relatórios' })).toHaveAttribute(
      'href',
      '/finance/reports',
    );
    expect(requests.some((r) => r.path.startsWith('/finance/banking'))).toBe(
      false,
    );
  });

  it.each(['/finance/banking', '/finance?tab=banking'])(
    'opens banking at %s with the existing permission pair',
    async (route) => {
      mockApi(
        sessionRoutes(
          makeUser(['FINANCE_BANK_IMPORT', 'FINANCE_CONTRIBUTION_READ']),
        ),
      );
      renderApp(route);
      await screen.findByRole('heading', {
        name: 'Importação bancária',
        level: 1,
      });
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Ir para Receitas' }),
      ).toHaveAttribute('href', '/finance?tab=incomes');
      expect(
        screen.getByRole('link', { name: 'Ir para Despesas' }),
      ).toHaveAttribute('href', '/finance?tab=expenses');
    },
  );

  it('redirects the legacy reports tab to the dedicated page', async () => {
    mockApi(sessionRoutes(makeUser(['FINANCE_TRANSACTION_READ'])));
    renderApp('/finance?tab=reports');
    await screen.findByRole('heading', {
      name: 'Relatórios financeiros',
      level: 1,
    });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it.each<[string, Permission[]]>([
    ['/finance/reports', ['FINANCE_SUMMARY_READ']],
    ['/finance/reports', ['FINANCE_DASHBOARD_READ']],
    ['/finance/banking', ['FINANCE_BANK_IMPORT']],
    ['/finance/banking', ['FINANCE_CONTRIBUTION_READ']],
    ['/finance/banking', ['FINANCE_TRANSACTION_READ']],
    ['/finance?tab=banking&transactionId=private-id', ['FINANCE_BANK_IMPORT']],
  ])(
    'rejects %s with %j before financial queries',
    async (route, permissions) => {
      const requests = mockApi(sessionRoutes(makeUser(permissions)));
      renderApp(route);
      await screen.findByRole('heading', { name: 'Acesso negado' });
      expect(requests.some((r) => r.path.startsWith('/finance'))).toBe(false);
    },
  );

  it('keeps reports and banking out of the treasury tabs', async () => {
    mockApi({
      ...sessionRoutes(
        makeUser([
          'FINANCE_TRANSACTION_READ',
          'FINANCE_BANK_IMPORT',
          'FINANCE_CONTRIBUTION_READ',
        ]),
      ),
      'GET /finance/incomes': {
        body: { items: [], total: 0, page: 1, pageSize: 20 },
      },
      'GET /finance/banking/pending-classification': { body: { total: 0 } },
    });
    renderApp('/finance');
    await screen.findByText('Nenhum registo.');
    expect(
      screen.queryByRole('tab', { name: 'Relatórios' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Importação bancária' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Relatórios' })).toHaveAttribute(
      'href',
      '/finance/reports',
    );
    expect(
      screen.getByRole('link', { name: 'Importação bancária' }),
    ).toHaveAttribute('href', '/finance/banking');
  });
});
