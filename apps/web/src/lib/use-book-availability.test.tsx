import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQueryClient } from './query-client';
import { useBookAvailability } from './use-book-availability';
import { mockApi, resetTestState } from '../test/utils';

beforeEach(resetTestState);
afterEach(() => vi.restoreAllMocks());
function Probe() {
  const query = useBookAvailability(['b1']);
  return (
    <p>
      {query.isError
        ? 'Indisponível'
        : query.isFetching
          ? 'Verificando'
          : `Disponíveis: ${query.values.get('b1')?.available}`}
    </p>
  );
}
it('does not present old availability as current when offline', async () => {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  const requests = mockApi({});
  const client = createQueryClient();
  client.setQueryData(
    ['library', 'availability', 'b1'],
    [{ bookId: 'b1', available: 99 }],
  );
  const view = render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  await screen.findByText('Indisponível');
  expect(screen.queryByText('Disponíveis: 99')).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
  view.unmount();
  client.clear();
});
it('fetches live availability even when catalogue and previous counts are fresh in cache', async () => {
  const requests = mockApi({
    'GET /library/books/availability': {
      body: [{ bookId: 'b1', quantity: 2, available: 0 }],
    },
  });
  const client = createQueryClient();
  client.setQueryData(['library', 'books', 1], {
    items: [{ id: 'b1', available: 99 }],
  });
  client.setQueryData(
    ['library', 'availability', 'b1'],
    [{ bookId: 'b1', available: 99 }],
  );
  const view = render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  await screen.findByText('Disponíveis: 0');
  expect(requests).toHaveLength(1);
  expect(requests[0]?.query.get('ids')).toBe('b1');
  expect(client.getQueryData(['library', 'books', 1])).toEqual({
    items: [{ id: 'b1', available: 99 }],
  });
  view.unmount();
  client.clear();
});
it('does not present previously cached availability as current when the live request fails', async () => {
  mockApi({ 'GET /library/books/availability': { status: 403 } });
  const client = createQueryClient();
  client.setQueryData(
    ['library', 'availability', 'b1'],
    [{ bookId: 'b1', available: 99 }],
  );
  const view = render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
  await screen.findByText('Indisponível');
  expect(screen.queryByText('Disponíveis: 99')).not.toBeInTheDocument();
  view.unmount();
  client.clear();
});
