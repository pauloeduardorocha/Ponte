import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@church/shared';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../../test/utils';
describe('Event manager workspace', () => {
  beforeEach(resetTestState);
  it('shows the event operations menu without global finance or user administration', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser([...ROLE_PERMISSIONS.EVENT_MANAGER])),
      'GET /events': {
        body: {
          items: [{ id: 'e1', title: 'Conferência atribuída' }],
          total: 1,
        },
      },
    });
    renderApp('/my-events');
    expect(
      await screen.findByRole('button', { name: 'Criar evento' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Pagamentos' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Gestores' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Financeiro' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Usuários' }),
    ).not.toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/finance'))).toBe(false);
  });
  it('loads payments for the selected event and permits requests without approval', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser([...ROLE_PERMISSIONS.EVENT_MANAGER])),
      'GET /events': {
        body: { items: [{ id: 'e1', title: 'Conferência' }], total: 1 },
      },
      'GET /events/e1/payments': {
        body: {
          items: [
            { id: 'p1', status: 'CONFIRMED', amount: '25.00', currency: 'EUR' },
          ],
          total: 1,
        },
      },
    });
    renderApp('/my-events?event=e1&section=payments');
    expect(
      await screen.findByRole('button', { name: 'Solicitar reembolso' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Aprovar reembolso' }),
    ).not.toBeInTheDocument();
    expect(requests.some((r) => r.path === '/events/e1/payments')).toBe(true);
  });
  it('does not fetch payment resources for a user without payment permission', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser(['EVENT_READ', 'EVENT_REGISTRATION_READ'])),
      'GET /events': {
        body: { items: [{ id: 'e1', title: 'Conferência' }], total: 1 },
      },
    });
    renderApp('/my-events?event=e1&section=payments');
    await screen.findByText('Meus eventos', { selector: 'h4' });
    await waitFor(() =>
      expect(requests.some((r) => r.path === '/events')).toBe(true),
    );
    expect(requests.some((r) => r.path === '/events/e1/payments')).toBe(false);
    expect(
      screen.queryByRole('button', { name: 'Criar evento' }),
    ).not.toBeInTheDocument();
  });
});
