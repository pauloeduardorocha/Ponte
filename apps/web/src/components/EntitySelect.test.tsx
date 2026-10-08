import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntitySelect } from './EntitySelect';
import { mockApi, resetTestState } from '../test/utils';
function show(props: Parameters<typeof EntitySelect>[0]) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <EntitySelect {...props} />
    </QueryClientProvider>,
  );
}
describe('Entity selectors', () => {
  beforeEach(resetTestState);
  it('includes subsequent pages and submits the selected entity identifier', async () => {
    const requests = mockApi({
      'GET /finance/members': (r) => ({
        body: {
          items:
            r.query.get('page') === '1'
              ? [{ id: 'm1', name: 'Ana' }]
              : [{ id: 'm2', name: 'Bruno' }],
          total: 2,
          page: Number(r.query.get('page')),
          pageSize: 1,
        },
      }),
    });
    const onChange = vi.fn((event) => event.target.value);
    show({
      endpoint: '/finance/members',
      label: 'Membro',
      value: '',
      onChange,
    });
    expect(
      await screen.findByRole('option', { name: 'Bruno' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Membro' }), {
      target: { value: 'm2' },
    });
    expect(onChange).toHaveReturnedWith('m2');
    expect(requests.map((r) => r.query?.get('page'))).toEqual(['1', '2']);
  });
  it('shows lookup failures without allowing a manual GUID', async () => {
    mockApi({ 'GET /library/members': { status: 403 } });
    show({ endpoint: '/library/members', label: 'Membro', value: '' });
    expect(
      await screen.findByText(
        'Você não tem permissão para realizar esta ação.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Membro' })).toBeDisabled();
  });
});
