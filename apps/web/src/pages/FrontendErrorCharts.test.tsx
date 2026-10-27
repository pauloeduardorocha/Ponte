import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { mockApi, resetTestState } from '../test/utils';
import { FrontendErrorCharts } from './FrontendErrorCharts';

function show() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FrontendErrorCharts />
    </QueryClientProvider>,
  );
}

describe('Frontend error charts', () => {
  beforeEach(resetTestState);
  it('shows global totals, type percentages, daily values and rankings', async () => {
    mockApi({
      'GET /audit/frontend-errors/stats': {
        body: {
          rows: [
            { kind: 'metrics', label: 'total', count: 100 },
            { kind: 'metrics', label: 'today', count: 8 },
            { kind: 'metrics', label: 'users', count: 3 },
            { kind: 'metrics', label: 'serverErrors', count: 20 },
            { kind: 'types', label: 'api', count: 80 },
            { kind: 'types', label: 'runtime', count: 20 },
            { kind: 'timeline', label: '2026-10-27', count: 8 },
            { kind: 'timeline', label: '2026-10-26', count: 0 },
            { kind: 'routes', label: '/videos', count: 20 },
            { kind: 'http', label: '401', count: 60 },
            { kind: 'versions', label: '1.1.7', count: 80 },
          ],
        },
      },
    });
    show();
    expect(await screen.findByText('API: 80 (80.0%)')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('/videos')).toBeInTheDocument();
    expect(
      screen.getByText('2026-10-26: 0 erros', { selector: 'li' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Timeline de erros por dia' }),
    ).toBeInTheDocument();
  });
  it('handles an empty period without invalid chart values', async () => {
    mockApi({ 'GET /audit/frontend-errors/stats': { body: { rows: [] } } });
    show();
    expect(
      await screen.findByText('Nenhum erro registrado no período.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Gráfico de pizza.*sem ocorrências/ }),
    ).toBeInTheDocument();
  });
  it('shows a separate error when statistics fail', async () => {
    mockApi({ 'GET /audit/frontend-errors/stats': { status: 500 } });
    show();
    expect(
      await screen.findByText(/Não foi possível carregar os gráficos/),
    ).toBeInTheDocument();
  });
});
