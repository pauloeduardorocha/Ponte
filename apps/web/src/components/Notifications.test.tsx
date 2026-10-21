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
  it('removes a personal message and refreshes the inbox and unread badge', async () => {
    let deleted = false;
    const message = {
      id: 'message',
      subject: 'Aviso',
      content: 'Mensagem a apagar',
      sentAt: '2026-10-20T12:00:00Z',
      readAt: null,
    };
    const requests = mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /operations/inbox': () => ({
        body: { items: deleted ? [] : [message], total: deleted ? 0 : 1 },
      }),
      'GET /operations/inbox/unread': () => ({
        body: { count: deleted ? 0 : 1 },
      }),
      'DELETE /operations/inbox/message': () => {
        deleted = true;
        return { body: { count: 1 } };
      },
    });
    renderApp('/inbox');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Apagar mensagem: Aviso' }),
    );
    expect(
      await screen.findByText('Você ainda não tem mensagens internas.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Mensagem a apagar')).not.toBeInTheDocument();
    expect(requests.find((r) => r.method === 'DELETE')).toMatchObject({
      path: '/operations/inbox/message',
      body: undefined,
    });
    await waitFor(() =>
      expect(
        requests.filter((r) => r.path === '/operations/inbox/unread').length,
      ).toBeGreaterThan(1),
    );
  });
  it('keeps a message visible and allows retry if deletion fails', async () => {
    mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /operations/inbox': {
        body: {
          items: [
            {
              id: 'message',
              subject: 'Aviso',
              content: 'Preservar mensagem',
              sentAt: '2026-10-20T12:00:00Z',
              readAt: null,
            },
          ],
          total: 1,
        },
      },
      'GET /operations/inbox/unread': { body: { count: 1 } },
      'DELETE /operations/inbox/message': {
        status: 500,
        body: { message: 'Falha ao apagar' },
      },
    });
    renderApp('/inbox');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Apagar mensagem: Aviso' }),
    );
    expect(await screen.findByText('Falha ao apagar')).toBeInTheDocument();
    expect(screen.getByText('Preservar mensagem')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apagar mensagem: Aviso' }),
    ).toBeEnabled();
  });
  it('returns to the previous page after deleting the last message on a page', async () => {
    let deleted = false;
    const requests = mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /operations/inbox': (request) => ({
        body: {
          items: [
            {
              id: request.query.get('page') === '2' ? 'last' : 'first',
              subject:
                request.query.get('page') === '2' ? 'Última' : 'Primeira',
              content: 'Mensagem',
              sentAt: '2026-10-20T12:00:00Z',
              readAt: null,
            },
          ],
          total: deleted ? 25 : 26,
        },
      }),
      'GET /operations/inbox/unread': { body: { count: 26 } },
      'DELETE /operations/inbox/last': () => {
        deleted = true;
        return { body: { count: 1 } };
      },
    });
    renderApp('/inbox');
    await screen.findByText('Primeira');
    fireEvent.click(
      screen.getByRole('button', { name: /próxima página|next page/i }),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Apagar mensagem: Última' }),
    );
    expect(await screen.findByText('Primeira')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        requests
          .filter((r) => r.path === '/operations/inbox')
          .at(-1)
          ?.query.get('page'),
      ).toBe('1'),
    );
  });
});
