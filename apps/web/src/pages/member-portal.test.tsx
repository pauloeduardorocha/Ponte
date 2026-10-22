import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MEMBER_PERMISSIONS } from '@church/shared';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
describe('Basic member experience', () => {
  beforeEach(resetTestState);
  it('lists events and links to self registration', async () => {
    mockApi({
      ...sessionRoutes(makeUser([...MEMBER_PERMISSIONS])),
      'GET /member-portal/events': {
        body: { items: [{ id: 'e1', name: 'Encontro' }], total: 1 },
      },
    });
    renderApp('/events');
    expect(await screen.findByText('Encontro')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ver evento e inscrever-se' }),
    ).toHaveAttribute('href', '/events/e1/register');
    expect(
      screen.queryByRole('button', { name: 'Cadastrar' }),
    ).not.toBeInTheDocument();
  });
  it('reserves a book without choosing another member', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser([...MEMBER_PERMISSIONS])),
      'GET /library/books': {
        body: { items: [{ id: 'b1', title: 'Livro' }], total: 1 },
      },
      'POST /member-portal/reservations': { status: 201, body: {} },
    });
    renderApp('/library');
    fireEvent.click(await screen.findByRole('button', { name: 'Reservar' }));
    expect(await screen.findByText('Reserva realizada.')).toBeInTheDocument();
    expect(
      requests.find((r) => r.path === '/member-portal/reservations')?.body,
    ).toEqual({ bookId: 'b1' });
    expect(requests.some((r) => r.path === '/library/members')).toBe(false);
  });
  it('shows book covers, full details and paginated circulation for catalog readers', async () => {
    const book = {
      id: 'b1',
      title: 'Livro completo',
      author: 'Autora',
      registrationNumber: '00001',
      collection: 'Coleção Ponte',
      categories: [
        {
          categoryCode: '54',
          isPrimary: true,
          reviewedAt: null,
          category: { code: '54', name: 'Liderança', parentCode: '50' },
        },
      ],
      cover: 'https://example.com/cover.jpg',
      quantity: 2,
      available: 1,
      subtitle: 'Subtítulo',
      description: 'Descrição completa',
      isbn: '123456',
      publisher: 'Editora Ponte',
      edition: '2',
      year: 2026,
      language: 'pt',
      pages: 150,
      category: 'Ficção',
      keywords: ['leitura'],
    };
    const requests = mockApi({
      ...sessionRoutes(makeUser(['LIBRARY_BOOK_READ'])),
      'GET /library/books': { body: { items: [book], total: 1 } },
      'GET /library/books/b1': { body: book },
      'GET /library/books/b1/history': ({ query }) => ({
        body: {
          items: [
            {
              id: 'l1',
              borrowedAt: '2026-10-01T12:00:00Z',
              dueAt: '2026-10-15T12:00:00Z',
              returnedAt: null,
              status: 'ACTIVE',
              renewedCount: 1,
            },
          ],
          total: 21,
          page: Number(query.get('page')),
          pageSize: 20,
        },
      }),
    });
    renderApp('/library');
    expect(
      await screen.findByRole('img', { name: 'Capa de Livro completo' }),
    ).toHaveAttribute('src', book.cover);
    expect(
      screen.getByText('Exemplares: 2 · Disponíveis: 1'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reservar' }),
    ).not.toBeInTheDocument();
    expect(requests.some((r) => r.path.endsWith('/history'))).toBe(false);
    expect(
      requests.find((r) => r.path === '/library/books')?.query.get('pageSize'),
    ).toBe('10');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Por página' }));
    fireEvent.click(await screen.findByRole('option', { name: '50' }));
    await waitFor(() =>
      expect(
        requests
          .filter((r) => r.path === '/library/books')
          .at(-1)
          ?.query.get('pageSize'),
      ).toBe('50'),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ver detalhes' }),
    );
    const dialog = within(screen.getByRole('dialog'));
    expect(await dialog.findByText('Editora Ponte')).toBeInTheDocument();
    expect(dialog.getByText('123456')).toBeInTheDocument();
    expect(dialog.getByText('00001')).toBeInTheDocument();
    expect(dialog.getByText('Coleção Ponte')).toBeInTheDocument();
    expect(
      dialog.getByText(/54 — Liderança · Tema principal · Proposta por rever/),
    ).toBeInTheDocument();
    expect(dialog.getByText('150')).toBeInTheDocument();
    expect(await dialog.findByText('Renovações: 1')).toBeInTheDocument();
    fireEvent.click(
      dialog.getByRole('button', { name: 'Próxima página do histórico' }),
    );
    await waitFor(() =>
      expect(
        requests
          .filter((r) => r.path.endsWith('/history'))
          .at(-1)
          ?.query.get('page'),
      ).toBe('2'),
    );
    fireEvent.mouseDown(
      await dialog.findByRole('combobox', { name: 'Por página' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: '50' }));
    await waitFor(() => {
      const last = requests.filter((r) => r.path.endsWith('/history')).at(-1);
      expect(last?.query.get('pageSize')).toBe('50');
      expect(last?.query.get('page')).toBe('1');
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Fechar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Histórico de empréstimos' }),
    );
    expect(
      await within(screen.getByRole('dialog')).findByText('Renovações: 1'),
    ).toBeInTheDocument();
    expect(
      requests.some((r) =>
        ['/library/loans', '/library/members', '/library/copies'].includes(
          r.path,
        ),
      ),
    ).toBe(false);
  });
  it('handles missing and broken covers and an empty loan history', async () => {
    mockApi({
      ...sessionRoutes(makeUser(['LIBRARY_BOOK_READ'])),
      'GET /library/books': {
        body: {
          items: [
            { id: 'b1', title: 'Sem imagem' },
            {
              id: 'b2',
              title: 'Imagem quebrada',
              cover: 'https://example.com/broken.jpg',
            },
          ],
          total: 2,
        },
      },
      'GET /library/books/b1': { body: { id: 'b1', title: 'Sem imagem' } },
      'GET /library/books/b1/history': {
        body: { items: [], total: 0, page: 1, pageSize: 20 },
      },
    });
    renderApp('/library');
    expect(await screen.findByText('Sem capa')).toBeInTheDocument();
    fireEvent.error(
      screen.getByRole('img', { name: 'Capa de Imagem quebrada' }),
    );
    expect(screen.getAllByText('Sem capa')).toHaveLength(2);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Ver detalhes' })[0]!,
    );
    expect(
      await within(screen.getByRole('dialog')).findByText(
        'Este livro ainda não possui empréstimos.',
      ),
    ).toBeInTheDocument();
  });
  it('lets readers retry a failed history request without losing book details', async () => {
    let attempts = 0;
    mockApi({
      ...sessionRoutes(makeUser(['LIBRARY_BOOK_READ'])),
      'GET /library/books': {
        body: { items: [{ id: 'b1', title: 'Livro' }], total: 1 },
      },
      'GET /library/books/b1': {
        body: { id: 'b1', title: 'Livro', isbn: 'ISBN-RETRY' },
      },
      'GET /library/books/b1/history': () =>
        ++attempts === 1
          ? {
              status: 503,
              body: { message: 'Histórico temporariamente indisponível' },
            }
          : { body: { items: [], total: 0, page: 1, pageSize: 20 } },
    });
    renderApp('/library');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ver detalhes' }),
    );
    const dialog = within(screen.getByRole('dialog'));
    expect(
      await dialog.findByText('Histórico temporariamente indisponível'),
    ).toBeInTheDocument();
    expect(dialog.getByText('ISBN-RETRY')).toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Tentar novamente' }));
    expect(
      await dialog.findByText('Este livro ainda não possui empréstimos.'),
    ).toBeInTheDocument();
  });
  it('shows group participants and details only for the own group', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser([...MEMBER_PERMISSIONS])),
      'GET /member-portal/small-groups': {
        body: {
          items: [
            {
              id: 'g1',
              name: 'Meu grupo',
              canViewDetails: true,
              members: [{ member: { id: 'm1', name: 'Ana' } }],
            },
            { id: 'g2', name: 'Outro grupo', canViewDetails: false },
          ],
          total: 2,
        },
      },
      'GET /member-portal/small-groups/g1': {
        body: {
          id: 'g1',
          name: 'Meu grupo',
          address: 'Rua da Ponte',
          meetingDay: 2,
          meetingTime: '20:00',
        },
      },
    });
    renderApp('/small-groups');
    expect(await screen.findByText('Integrantes: Ana')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Detalhes do meu grupo' }),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Detalhes do meu grupo' }),
    );
    expect(
      await screen.findByText('Endereço: Rua da Ponte'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        requests.some((r) => r.path === '/member-portal/small-groups/g2'),
      ).toBe(false),
    );
  });
  it('shows finance aggregates without transactions or account lookup', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser([...MEMBER_PERMISSIONS])),
      'GET /finance/dashboard': {
        body: {
          month: '2026-01',
          balances: [
            { currency: 'EUR', income: '100', expenses: '20', balance: '80' },
          ],
          trend: [],
          latestTransactions: [],
        },
      },
    });
    renderApp('/finance');
    expect((await screen.findAllByText('Receitas')).length).toBeGreaterThan(0);
    expect(
      screen.queryByText('Últimos lançamentos do período'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Movimentos pendentes de revisão'),
    ).not.toBeInTheDocument();
    expect(
      requests.some((r) =>
        ['/finance/incomes', '/finance/expenses', '/finance/accounts'].includes(
          r.path,
        ),
      ),
    ).toBe(false);
  });
});
