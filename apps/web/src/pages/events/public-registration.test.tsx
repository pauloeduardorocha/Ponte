import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  mockApi,
  renderApp,
  resetTestState,
  anonymousRoutes,
  sessionRoutes,
  makeUser,
} from '../../test/utils';
const event = {
  name: 'Retiro',
  location: 'Lisboa',
  startsAt: '2030-01-01T10:00:00Z',
  isPaid: false,
  available: 3,
  paymentsReady: false,
  tickets: [],
};
describe('Public event signup', () => {
  beforeEach(resetTestState);
  it('allows an anonymous visitor to register for free without Stripe', async () => {
    const requests = mockApi({
      ...anonymousRoutes,
      'GET /public/events/e1': { body: event },
      'POST /public/events/e1/registrations': {
        body: { status: 'REGISTERED' },
      },
    });
    renderApp('/events/e1/register');
    await screen.findByText('Retiro');
    fireEvent.change(screen.getByLabelText(/Nome/), {
      target: { value: 'Maria' },
    });
    fireEvent.change(screen.getByLabelText(/Email/), {
      target: { value: 'maria@example.org' },
    });
    fireEvent.change(screen.getByLabelText(/Telefone/), {
      target: { value: '912345678' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar inscrição gratuita' }),
    );
    await screen.findByText('Inscrição concluída!');
    expect(
      requests.find(
        (r) => r.method === 'POST' && r.path.endsWith('/registrations'),
      )?.body,
    ).toEqual({
      name: 'Maria',
      email: 'maria@example.org',
      phone: '912345678',
      communicationConsent: false,
    });
  });
  it('fills member data and sends registration to the authenticated member endpoint', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /public/events/e1': { body: event },
      'GET /public/events/e1/profile': {
        body: {
          name: 'Membro Maria',
          email: 'member@example.org',
          phone: '912345678',
        },
      },
      'POST /public/events/e1/member-registrations': {
        body: { status: 'REGISTERED' },
      },
    });
    renderApp('/events/e1/register');
    await screen.findByDisplayValue('Membro Maria');
    expect(screen.getByLabelText(/Nome/)).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirmar inscrição gratuita' }),
    );
    await waitFor(() =>
      expect(
        requests.some(
          (r) =>
            r.method === 'POST' && r.path.endsWith('/member-registrations'),
        ),
      ).toBe(true),
    );
  });
  it('blocks paid signup while Stripe has no credentials', async () => {
    mockApi({
      ...anonymousRoutes,
      'GET /public/events/e1': {
        body: {
          ...event,
          isPaid: true,
          tickets: [
            { id: 't1', name: 'Primeiro lote', price: '20.00', available: 3 },
          ],
        },
      },
    });
    renderApp('/events/e1/register');
    expect(
      await screen.findByRole('button', { name: 'Comprar ingresso' }),
    ).toBeDisabled();
  });
});
