import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

describe('Personal notification inbox', () => {
  beforeEach(resetTestState);
  it('shows the unread badge and refreshes it after marking a message as read', async () => {
    let readAt: string | null = null;
    const requests = mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /operations/inbox': () => ({
        body: {
          items: [
            {
              id: 'message',
              subject: 'Olá',
              content: 'Mensagem pessoal',
              sentAt: '2026-10-20T12:00:00Z',
              readAt,
            },
          ],
          total: 1,
        },
      }),
      'GET /operations/inbox/unread': () => ({
        body: { count: readAt ? 0 : 1 },
      }),
      'POST /operations/inbox/message/read': () => {
        readAt = '2026-10-20T12:01:00Z';
        return { body: { count: 1 } };
      },
    });
    renderApp('/inbox');
    expect(await screen.findByText('Não lida')).toBeInTheDocument();
    expect(
      screen.getByText(/Este navegador não disponibiliza notificações push/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como lida' }));
    await waitFor(() =>
      expect(screen.queryByText('Não lida')).not.toBeInTheDocument(),
    );
    expect(
      requests.some(
        (r) =>
          r.path === '/operations/inbox/message/read' && r.method === 'POST',
      ),
    ).toBe(true);
    expect(
      requests.filter((r) => r.path === '/operations/inbox/unread').length,
    ).toBeGreaterThan(1);
  });
  it('marks all messages as read without passing a recipient from the browser', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /operations/inbox': {
        body: {
          items: [
            {
              id: 'message',
              content: 'Mensagem',
              subject: null,
              sentAt: '2026-10-20T12:00:00Z',
              readAt: null,
            },
          ],
          total: 1,
        },
      },
      'GET /operations/inbox/unread': { body: { count: 1 } },
      'POST /operations/inbox/read-all': { body: { count: 1 } },
    });
    renderApp('/inbox');
    await screen.findByText('Mensagem');
    fireEvent.click(
      screen.getByRole('button', { name: 'Marcar todas como lidas' }),
    );
    await waitFor(() =>
      expect(
        requests.some(
          (r) =>
            r.path === '/operations/inbox/read-all' &&
            r.method === 'POST' &&
            r.body === undefined,
        ),
      ).toBe(true),
    );
  });
});
