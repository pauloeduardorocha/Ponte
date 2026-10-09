import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@church/shared';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../../test/utils';
import { fineBalance } from '../../lib/library-api';

const book = {
  id: 'b1',
  title: 'Livro Ponte',
  author: 'Autora Ponte',
  category: 'Comunidade',
  quantity: 2,
  available: 1,
  cover: 'https://example.com/capa.png',
  keywords: [],
};
const copy = {
  id: 'c1',
  bookId: 'b1',
  assetCode: 'EX-01',
  condition: 'GOOD',
  location: 'Sala 1',
  status: 'AVAILABLE',
  book,
};
const loan = {
  id: 'l1',
  memberId: 'm1',
  bookCopyId: 'c1',
  status: 'ACTIVE',
  renewedCount: 0,
  borrowedAt: '2026-10-01T12:00:00Z',
  dueAt: '2026-10-15T12:00:00Z',
  returnedAt: null,
  bookCopy: copy,
  member: { id: 'm1', name: 'Ana Biblioteca' },
  createdBy: 'u1',
  returnedBy: null,
  observations: null,
};
const fine = {
  id: 'f1',
  loanId: 'l1',
  amount: '0.30',
  paidAmount: '0.10',
  discount: '0',
  status: 'OPEN',
  payments: [],
  adjustments: [],
  loan,
};
const reservation = {
  id: 'r1',
  memberId: 'm1',
  bookId: 'b1',
  bookCopyId: 'c1',
  status: 'READY',
  book,
  bookCopy: copy,
  member: loan.member,
  createdAt: loan.borrowedAt,
  expiresAt: loan.dueAt,
  holdUntil: loan.dueAt,
};
const settings = {
  defaultLoanDays: 14,
  maxBooks: 3,
  maxRenewals: 2,
  graceDays: 0,
  dailyFine: '1',
  blockOverdue: true,
  holdDays: 2,
  reservationDays: 30,
};
const page = (items: unknown[], total = items.length) => ({
  items,
  total,
  page: 1,
  pageSize: 20,
});
const staff = PERMISSIONS.filter((code) => code.startsWith('LIBRARY_'));
function routes() {
  return {
    ...sessionRoutes(makeUser([...staff])),
    'GET /library/books': { body: page([book]) },
    'GET /library/copies': { body: page([copy]) },
    'GET /library/loans': { body: page([loan]) },
    'GET /library/fines': { body: page([fine]) },
    'GET /library/reservations': { body: page([reservation]) },
    'GET /library/settings': { body: settings },
    'GET /library/members': {
      body: page([{ id: 'm1', name: 'Ana Biblioteca', status: 'ACTIVE' }]),
    },
    'GET /library/dashboard': {
      body: {
        totalBooks: 1,
        totalCopies: 2,
        available: 1,
        loaned: 1,
        overdue: 0,
        pendingFines: '0.20',
        mostBorrowed: [{ bookId: 'b1', title: 'Livro popular', count: 2 }],
      },
    },
  };
}
async function selectEntity(name: string, value: string) {
  const select = within(screen.getByRole('dialog')).getByRole('combobox', {
    name: new RegExp(`^${name}`),
  });
  await waitFor(() =>
    expect(
      within(select).getByRole('option', {
        name:
          name === 'Membro' ? 'Ana Biblioteca' : 'Livro Ponte · Autora Ponte',
      }),
    ).toBeInTheDocument(),
  );
  fireEvent.change(select, { target: { value } });
}
async function tab(name: string) {
  fireEvent.click(await screen.findByRole('tab', { name }));
}
function fill(name: string, value: string) {
  const dialog = screen.queryByRole('dialog');
  const scope = dialog ? within(dialog) : screen;
  fireEvent.change(scope.getByLabelText(new RegExp(`^${name}`)), {
    target: { value },
  });
}
async function confirm() {
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Confirmar',
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  // MUI restores the background's accessibility after its exit transition.
  await screen.findByRole('main');
}

describe('Library frontend', () => {
  beforeEach(resetTestState);
  it('validates required library fields before sending a mutation', async () => {
    const requests = mockApi(routes());
    renderApp('/library');
    fireEvent.click(await screen.findByRole('button', { name: 'Novo livro' }));
    const dialog = screen.getByRole('dialog');
    const title = within(dialog).getByLabelText(/^Título/);
    const form = title.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(
      await within(dialog).findAllByText('Campo obrigatório'),
    ).toHaveLength(2);
    expect(
      requests.filter(
        (entry) =>
          entry.method === 'POST' && entry.path.startsWith('/library/'),
      ),
    ).toHaveLength(0);
    expect(dialog).toBeInTheDocument();
  });
  it('lists covers, quantity, availability and filters/paginates through the API layer', async () => {
    const requests = mockApi({
      ...routes(),
      'GET /library/books': { body: page([book], 30) },
    });
    renderApp('/library');
    expect(await screen.findByText('Livro Ponte')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Capa de Livro Ponte' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Exemplares: 2 · Disponíveis: 1'),
    ).toBeInTheDocument();
    fill('Pesquisa', 'ponte');
    fill('Autor', 'autora');
    fill('Categoria', 'Comunidade');
    fireEvent.mouseDown(
      screen.getByRole('combobox', { name: 'Disponibilidade' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: 'Disponível' }));
    await waitFor(() =>
      expect(requests.at(-1)?.query.get('available')).toBe('true'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(requests.at(-1)?.query.get('page')).toBe('2'));
    expect(requests.at(-1)?.query.get('search')).toBe('ponte');
  });
  it('creates a full book and copy, and surfaces API errors instead of closing the form', async () => {
    const requests = mockApi({
      ...routes(),
      'POST /library/books': {
        status: 409,
        body: { message: 'ISBN duplicado' },
      },
      'POST /library/books/b1/copies': { status: 201, body: copy },
    });
    renderApp('/library');
    fireEvent.click(await screen.findByRole('button', { name: 'Novo livro' }));
    fill('Título', 'Novo título');
    fill('Autor', 'Nova autora');
    fill('ISBN', 'ISBN-1');
    fill('Páginas', '123');
    fill('Palavras-chave', 'ponte, teste');
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Confirmar',
      }),
    );
    expect(await screen.findByText('ISBN duplicado')).toBeInTheDocument();
    expect(
      requests.find((r) => r.method === 'POST' && r.path === '/library/books')
        ?.body,
    ).toMatchObject({
      title: 'Novo título',
      author: 'Nova autora',
      pages: 123,
      keywords: ['ponte', 'teste'],
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancelar',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Novo exemplar' }));
    fill('Código patrimonial', 'NEW-1');
    fill('Localização', 'Sala nova');
    fill('Código de barras', 'BC');
    await confirm();
    expect(
      requests.find((r) => r.path === '/library/books/b1/copies')?.body,
    ).toMatchObject({
      assetCode: 'NEW-1',
      location: 'Sala nova',
      barcode: 'BC',
    });
  });
  it('hides actions and never requests private resources for catalog-only users', async () => {
    const requests = mockApi({
      ...routes(),
      ...sessionRoutes(makeUser(['LIBRARY_BOOK_READ'])),
    });
    renderApp('/library');
    expect(await screen.findByText('Livro Ponte')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Novo livro' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Multas' }),
    ).not.toBeInTheDocument();
    expect(
      requests.filter((r) => r.path.startsWith('/library/')).map((r) => r.path),
    ).toEqual(['/library/books']);
  });
  it('does not expose or request library history to MEMBER_READ alone', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['MEMBER_READ'])),
      'GET /members/m1': {
        body: {
          id: 'm1',
          name: 'Ana Biblioteca',
          email: null,
          phone: null,
          status: 'ACTIVE',
          birthDate: null,
          notes: null,
          createdAt: loan.borrowedAt,
          updatedAt: loan.borrowedAt,
        },
      },
    });
    renderApp('/members/m1');
    expect(
      await screen.findByRole('heading', { name: 'Ana Biblioteca' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Histórico da biblioteca'),
    ).not.toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/library'))).toBe(false);
  });
  it('borrows the copy (not book), returns and renews through confirmation dialogs', async () => {
    const requests = mockApi({
      ...routes(),
      'POST /library/loans': { status: 201, body: loan },
      'POST /library/loans/l1/return': { status: 201, body: loan },
      'POST /library/loans/l1/renew': { status: 201, body: loan },
    });
    renderApp('/library');
    await tab('Exemplares');
    expect(await screen.findByText('Livro Ponte · EX-01')).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Emprestar' }).at(-1)!,
    );
    await selectEntity('Membro', 'm1');
    await confirm();
    expect(
      requests.find((r) => r.method === 'POST' && r.path === '/library/loans')
        ?.body,
    ).toEqual({ memberId: 'm1', bookCopyId: 'c1' });
    await tab('Empréstimos');
    fireEvent.click(await screen.findByRole('button', { name: 'Renovar' }));
    await confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Devolver' }));
    await confirm();
    expect(
      requests.some(
        (r) => r.path === '/library/loans/l1/return' && r.method === 'POST',
      ),
    ).toBe(true);
    expect(
      requests.some(
        (r) => r.path === '/library/loans/l1/renew' && r.method === 'POST',
      ),
    ).toBe(true);
  });
  it('retains a payment idempotency key for retry and requires reasons for adjustments', async () => {
    let attempts = 0;
    const requests = mockApi({
      ...routes(),
      'POST /library/fines/f1/payments': () =>
        ++attempts === 1
          ? { status: 500, body: { message: 'Tente novamente' } }
          : { status: 201, body: { id: 'p1', amount: '0.10' } },
      'POST /library/fines/f1/adjustments': { status: 201, body: fine },
    });
    renderApp('/library');
    await tab('Multas');
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar' }));
    fill('Valor decimal', '0.10');
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Confirmar',
      }),
    );
    expect(await screen.findByText('Tente novamente')).toBeInTheDocument();
    await confirm();
    const payments = requests.filter(
      (r) => r.path === '/library/fines/f1/payments',
    );
    expect(payments[0]?.body).toEqual(payments[1]?.body);
    expect(payments[0]?.body).toMatchObject({
      amount: '0.10',
      idempotencyKey: expect.any(String),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Perdoar' }));
    expect(screen.getByLabelText(/Justificativa/)).toBeRequired();
    fill('Justificativa', 'Aprovado pela biblioteca');
    await confirm();
    expect(
      requests.find((r) => r.path === '/library/fines/f1/adjustments')?.body,
    ).toEqual({ kind: 'FORGIVE', justification: 'Aprovado pela biblioteca' });
  });
  it('reserves, cancels and lends the allocated copy to the next member', async () => {
    const requests = mockApi({
      ...routes(),
      'POST /library/reservations': { status: 201, body: reservation },
      'POST /library/reservations/r1/cancel': {
        status: 201,
        body: reservation,
      },
      'POST /library/loans': { status: 201, body: loan },
    });
    renderApp('/library');
    await tab('Reservas');
    fireEvent.click(await screen.findByRole('button', { name: 'Reservar' }));
    await selectEntity('Membro', 'm1');
    await selectEntity('Livro', 'b1');
    await confirm();
    fireEvent.click(screen.getByRole('button', { name: 'Emprestar reserva' }));
    await confirm();
    expect(
      requests.find((r) => r.method === 'POST' && r.path === '/library/loans')
        ?.body,
    ).toEqual({ memberId: 'm1', bookCopyId: 'c1' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    await confirm();
    expect(
      requests.some((r) => r.path === '/library/reservations/r1/cancel'),
    ).toBe(true);
  });
  it('edits settings using numeric limits and decimal money strings', async () => {
    const requests = mockApi({
      ...routes(),
      'PATCH /library/settings': { body: settings },
    });
    renderApp('/library');
    await tab('Configurações');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar configurações' }),
    );
    fill('Prazo de empréstimo', '21');
    fill('Multa diária decimal', '0.25');
    await confirm();
    expect(requests.find((r) => r.method === 'PATCH')?.body).toMatchObject({
      defaultLoanDays: 21,
      dailyFine: '0.25',
      blockOverdue: true,
    });
  });
  it('shows complete maintenance and member histories only with the proper permission', async () => {
    mockApi({
      ...routes(),
      'GET /library/copies/c1/history': {
        body: {
          copy,
          loans: [{ ...loan, fine }],
          reservations: [reservation],
          events: [
            {
              id: 'e1',
              action: 'LIBRARY_COPY_UPDATE',
              createdAt: loan.borrowedAt,
              actorId: 'u1',
              metadata: { justification: 'Manutenção' },
            },
          ],
        },
      },
      'GET /library/members/m1/history': {
        body: { loans: [{ ...loan, fine }], reservations: [reservation] },
      },
    });
    renderApp('/library');
    await tab('Exemplares');
    fireEvent.click(await screen.findByRole('button', { name: 'Histórico' }));
    expect(await screen.findByText(/LIBRARY_COPY_UPDATE/)).toBeInTheDocument();
    expect(screen.getByText(/Saldo 0.20/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await tab('Membros / histórico');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Histórico da biblioteca' }),
    );
    expect(await screen.findByText(/Multa: OPEN/)).toBeInTheDocument();
  });
  it('supports restricted fine-read users without other queries or payment actions', async () => {
    const requests = mockApi({
      ...routes(),
      ...sessionRoutes(makeUser(['LIBRARY_FINE_READ'])),
    });
    renderApp('/library');
    expect(await screen.findByText(/Saldo 0.20/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Pagar' }),
    ).not.toBeInTheDocument();
    expect(
      requests.filter((r) => r.path.startsWith('/library/')).map((r) => r.path),
    ).toEqual(['/library/fines']);
    const resources = screen.getByRole('button', { name: 'Recursos' });
    expect(resources).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(resources);
    expect(
      await screen.findByRole('link', { name: 'Biblioteca' }),
    ).toBeInTheDocument();
  });
  it('formats money using integer cents', () => {
    expect(
      fineBalance({ amount: '0.30', paidAmount: '0.10', discount: '0.10' }),
    ).toBe('0.10');
    expect(
      fineBalance({ amount: '9999999999.99', paidAmount: '0', discount: '0' }),
    ).toBe('9999999999.99');
  });
});
