import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

describe('Cost centers', () => {
  beforeEach(resetTestState);
  it('offers registered cost centers when creating a movement', async () => {
    const requests = mockApi({
      ...sessionRoutes(
        makeUser([
          'FINANCE_TRANSACTION_READ',
          'FINANCE_TRANSACTION_CREATE',
          'FINANCE_CATEGORY_READ',
          'FINANCE_ACCOUNT_READ',
        ]),
      ),
      'GET /finance/incomes': {
        body: { items: [], total: 0, page: 1, pageSize: 20 },
      },
      'GET /finance/categories': {
        body: { items: [], total: 0, page: 1, pageSize: 20 },
      },
      'GET /finance/accounts': {
        body: { items: [], total: 0, page: 1, pageSize: 20 },
      },
      'GET /finance/cost-centers': {
        body: {
          items: [{ id: 'center-1', name: 'Missões' }],
          total: 1,
          page: 1,
          pageSize: 20,
        },
      },
    });
    renderApp('/finance?tab=incomes');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cadastrar receitas' }),
    );
    const select = await screen.findByRole('combobox', {
      name: 'Centro de custo',
    });
    expect(
      await screen.findByRole('option', { name: 'Missões' }),
    ).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'center-1' } });
    expect(select).toHaveValue('center-1');
    await waitFor(() =>
      expect(requests.some((r) => r.path === '/finance/cost-centers')).toBe(
        true,
      ),
    );
  });
  it('shows the cost center register with existing category permissions', async () => {
    mockApi({
      ...sessionRoutes(
        makeUser(['FINANCE_CATEGORY_READ', 'FINANCE_CATEGORY_WRITE']),
      ),
      'GET /finance/cost-centers': {
        body: {
          items: [{ id: 'center-1', name: 'Missões' }],
          total: 1,
          page: 1,
          pageSize: 20,
        },
      },
    });
    renderApp('/finance?tab=cost-centers');
    expect(await screen.findByText('Missões')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cadastrar centros de custos' }),
    ).toBeInTheDocument();
  });
});
