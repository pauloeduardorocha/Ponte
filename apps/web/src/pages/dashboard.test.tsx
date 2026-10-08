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
  it('offers a personal empty state and never fetches protected indicators for members', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /health': { body: { status: 'ok' } },
    });
    renderApp('/');
    await screen.findByRole('heading', { name: /Bom dia, comunidade/ });
    expect(
      requests.some(
        (r) =>
          r.path.startsWith('/finance') ||
          r.path.startsWith('/library') ||
          r.path.startsWith('/community'),
      ),
    ).toBe(false);
  });
});
