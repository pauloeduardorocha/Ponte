import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
describe('Permission scoped dashboard', () => {
  beforeEach(resetTestState);
  it('shows real administrative indicators with links and avoids ungranted finance/library queries', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['MEMBER_READ', 'VISITOR_READ', 'EVENT_READ'])),
      'GET /health': { body: { status: 'ok' } },
      'GET /community/dashboard': {
        body: {
          members: [
            { status: 'ACTIVE', _count: { _all: 2 } },
            { status: 'INACTIVE', _count: { _all: 1 } },
          ],
          visitors: [{ status: 'NEW', _count: { _all: 4 } }],
          events: 1,
          upcomingEvents: [],
        },
      },
    });
    renderApp('/');
    await screen.findByRole('main');
    expect(
      await screen.findByRole('link', {
        name: 'Membros ativos: 2. Abrir lista',
      }),
    ).toHaveAttribute('href', '/members?status=ACTIVE');
    expect(
      screen.getByRole('link', { name: 'Visitantes: 4. Abrir lista' }),
    ).toHaveAttribute('href', '/visitors');
    expect(
      screen.getByRole('link', { name: 'Próximos eventos: 1. Abrir lista' }),
    ).toHaveAttribute('href', '/events?status=SCHEDULED');
    expect(
      requests.some(
        (r) => r.path.startsWith('/finance') || r.path.startsWith('/library'),
      ),
    ).toBe(false);
  });
  it('shows birthdays to a member without administrative permissions', async () => {
    mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /community/birthdays': {
        body: [{ id: 'birthday', name: 'Maria Santos', birthday: '27/10' }],
      },
    });
    renderApp('/');
    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText('27/10')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Aniversariantes da semana' }),
    ).toBeInTheDocument();
  });
  it('shows an empty birthday card', async () => {
    mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /community/birthdays': { body: [] },
    });
    renderApp('/');
    expect(
      await screen.findByText('Nenhum aniversariante nesta semana.'),
    ).toBeInTheDocument();
  });
  it('offers a personal empty state and never fetches protected indicators for members', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /health': { body: { status: 'ok' } },
    });
    renderApp('/');
    await screen.findByRole('heading', { name: /Bom dia, A Ponte/ });
    expect(
      requests.some(
        (r) =>
          r.path.startsWith('/finance') ||
          r.path.startsWith('/library') ||
          r.path === '/community/dashboard',
      ),
    ).toBe(false);
  });
});

describe('Personal member dashboard', () => {
  beforeEach(resetTestState);
  const empty = {
    upcomingSchedules: [],
    groups: [],
    reimbursements: [],
    upcomingEvents: [],
    reservations: [],
    loans: [],
    fines: [],
  };
  it('shows personal sections in order and hides optional sections when empty', async () => {
    mockApi({
      ...sessionRoutes(makeUser(['COMMUNITY_READ'])),
      'GET /health': { body: { status: 'ok' } },
      'GET /member-portal/dashboard': { body: empty },
    });
    renderApp('/');
    await screen.findByRole('heading', { name: 'Meu grupo familiar' });
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Últimos vídeos da igreja',
      'Aniversariantes da semana',
      'Próximas escalas',
      'Meu grupo familiar',
      'Próximos eventos',
    ]);
    expect(screen.queryByText('Reembolsos pendentes')).not.toBeInTheDocument();
    expect(screen.queryByText('Minha biblioteca')).not.toBeInTheDocument();
  });
  it('includes reimbursements before events and all library categories afterwards', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['COMMUNITY_READ'])),
      'GET /health': { body: { status: 'ok' } },
      'GET /member-portal/dashboard': {
        body: {
          ...empty,
          upcomingSchedules: [
            {
              id: 's',
              title: 'Louvor',
              date: '2027-01-01T10:00:00Z',
              ministry: null,
            },
          ],
          groups: [
            {
              id: 'g',
              name: 'Grupo da Ana',
              meetingDay: 2,
              meetingTime: '20:00',
              address: null,
              leader: null,
            },
          ],
          reimbursements: [
            { id: 'r', purpose: 'Transporte', amount: '12', currency: 'EUR' },
          ],
          upcomingEvents: [
            {
              id: 'e',
              name: 'Encontro',
              startsAt: '2027-01-02T10:00:00Z',
              location: 'Igreja',
            },
          ],
          reservations: [
            {
              id: 'r',
              book: { title: 'Livro reservado' },
              status: 'READY',
              expiresAt: '2027-01-03T10:00:00Z',
            },
          ],
          loans: [
            {
              id: 'l',
              bookCopy: { book: { title: 'Livro emprestado' } },
              status: 'ACTIVE',
              dueAt: '2027-01-03T10:00:00Z',
            },
          ],
          fines: [
            {
              id: 'f',
              amount: '10',
              paidAmount: '3',
              discount: '2',
              loan: { bookCopy: { book: { title: 'Livro com multa' } } },
            },
          ],
        },
      },
    });
    renderApp('/');
    await screen.findByText('Grupo da Ana');
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Últimos vídeos da igreja',
      'Aniversariantes da semana',
      'Próximas escalas',
      'Meu grupo familiar',
      'Reembolsos pendentes',
      'Próximos eventos',
      'Minha biblioteca',
    ]);
    expect(screen.getByText(/Reserva: Livro reservado/)).toBeInTheDocument();
    expect(
      screen.getByText(/Empréstimo: Livro emprestado/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Saldo pendente: 5,00/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver reembolso' })).toHaveAttribute(
      'href',
      '/reimbursements?request=r',
    );
    expect(
      requests.some(
        (r) => r.path === '/library/loans' || r.path === '/finance/dashboard',
      ),
    ).toBe(false);
  });
});
