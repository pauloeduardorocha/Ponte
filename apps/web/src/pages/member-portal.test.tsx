import { fireEvent, screen, waitFor } from '@testing-library/react';
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
