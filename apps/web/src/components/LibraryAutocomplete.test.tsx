import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { LibraryAutocomplete } from './LibraryAutocomplete';
import { mockApi, resetTestState } from '../test/utils';

function Field() {
  const [value, setValue] = useState('');
  return (
    <LibraryAutocomplete
      endpoint="/library/books"
      label="Livro"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}
function setup() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Field />
    </QueryClientProvider>,
  );
}
describe('Library autocomplete', () => {
  beforeEach(resetTestState);
  it('fetches only on opening, loads another page on scrolling and restarts remote search at page one', async () => {
    const requests = mockApi({
      'GET /library/books': ({ query }) => {
        const page = Number(query.get('page'));
        return {
          body: {
            items: [
              {
                id: `book-${page}`,
                title: query.get('search') || `Livro ${page}`,
                author: 'Autora',
              },
            ],
            total: 60,
            page,
            pageSize: 10,
          },
        };
      },
    });
    setup();
    expect(requests).toHaveLength(0);
    const input = screen.getByRole('combobox', { name: 'Livro' });
    fireEvent.mouseDown(input);
    await screen.findByRole('option', { name: 'Livro 1 · Autora' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.query.get('pageSize')).toBe('10');
    fireEvent.scroll(screen.getByRole('listbox'));
    await screen.findByRole('option', { name: 'Livro 2 · Autora' });
    expect(requests).toHaveLength(2);
    fireEvent.change(input, { target: { value: 'Livro remoto' } });
    await waitFor(() =>
      expect(requests.at(-1)?.query.get('search')).toBe('Livro remoto'),
    );
    expect(requests.at(-1)?.query.get('page')).toBe('1');
    expect(requests).toHaveLength(3);
    fireEvent.click(
      await screen.findByRole('option', { name: 'Livro remoto · Autora' }),
    );
    expect(input).toHaveValue('Livro remoto · Autora');
  });
  it('shows request errors and allows searching again', async () => {
    mockApi({
      'GET /library/books': ({ query }) =>
        query.get('search')
          ? {
              body: {
                items: [{ id: 'b1', title: 'Recuperado', author: 'Autora' }],
                total: 1,
                page: 1,
                pageSize: 10,
              },
            }
          : { status: 503, body: { message: 'Pesquisa indisponível' } },
    });
    setup();
    const input = screen.getByRole('combobox', { name: 'Livro' });
    fireEvent.mouseDown(input);
    expect(
      await screen.findByText('Pesquisa indisponível'),
    ).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Recuperado' } });
    expect(
      await screen.findByRole('option', { name: 'Recuperado · Autora' }),
    ).toBeInTheDocument();
  });
});
