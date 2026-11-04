import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
import { canAccessRoute } from '../auth/route-access';

const id = '00000000-0000-4000-8000-000000000001';
const memberId = '00000000-0000-4000-8000-000000000002';
const topic = {
  id,
  topicId: null,
  title: 'Conversar sobre o encontro',
  body: 'Veja https://example.org e @[Maria](' + memberId + ')',
  authorId: 'user-1',
  author: { id: 'user-1', name: 'Ana Souza' },
  mentions: [{ id: memberId, name: 'Maria' }],
  createdAt: '2026-11-04T10:00:00Z',
  deletedAt: null,
  hasImage: false,
  _count: { replies: 0 },
};

describe('Conversation panels', () => {
  beforeEach(resetTestState);

  it('opens a card from home and displays author, date, links and mentions', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      'GET /conversations': { body: { items: [topic], hasMore: false } },
      [`GET /conversations/${id}`]: {
        body: { topic, items: [], hasMore: false },
      },
    });
    renderApp('/');
    fireEvent.click(
      await screen.findByRole('link', { name: /Conversar sobre o encontro/ }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: topic.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ana Souza ·/)).toBeInTheDocument();
    expect(screen.getByText('@Maria')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://example.org' }),
    ).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('creates a topic with a member reference and then replies to the selected conversation', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser()),
      'GET /conversations': { body: { items: [], hasMore: false } },
      'GET /conversations/members': { body: [{ id: memberId, name: 'Maria' }] },
      'POST /conversations': { body: { id } },
      [`GET /conversations/${id}`]: {
        body: { topic, items: [], hasMore: false },
      },
      [`POST /conversations/${id}/replies`]: { body: { id: memberId } },
    });
    renderApp('/');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Nova conversa' }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /Título da conversa/ }),
      {
        target: { value: 'Novo tópico' },
      },
    );
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /Tópico inicial/ }),
      {
        target: { value: 'Olá @Ma' },
      },
    );
    fireEvent.click(await screen.findByRole('button', { name: '@Maria' }));
    expect(
      within(dialog).getByRole('textbox', { name: /Tópico inicial/ }),
    ).toHaveValue('Olá @Maria ');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Criar conversa' }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: topic.title }),
    ).toBeInTheDocument();
    expect(
      requests.find((r) => r.method === 'POST' && r.path === '/conversations')
        ?.body,
    ).toEqual({ title: 'Novo tópico', body: `Olá @[Maria](${memberId}) ` });
    fireEvent.change(screen.getByRole('textbox', { name: /Sua resposta/ }), {
      target: { value: 'Uma resposta' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    await waitFor(() =>
      expect(
        requests.find((r) => r.method === 'POST' && r.path.endsWith('/replies'))
          ?.body,
      ).toEqual({ body: 'Uma resposta' }),
    );
  });

  it('soft-deletes with confirmation and replaces the topic with the tombstone', async () => {
    let deleted = false;
    const requests = mockApi({
      ...sessionRoutes(makeUser()),
      [`GET /conversations/${id}`]: () => ({
        body: {
          topic: deleted
            ? {
                ...topic,
                title: null,
                body: '',
                mentions: [],
                deletedAt: '2026-11-04T12:00:00Z',
              }
            : topic,
          items: [],
          hasMore: false,
        },
      }),
      [`DELETE /conversations/${id}`]: () => {
        deleted = true;
        return { body: { deleted: true } };
      },
    });
    renderApp(`/conversations/${id}`);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Excluir conversa' }),
    );
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Excluir',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'conversa excluída' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('@Maria')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sua resposta')).not.toBeInTheDocument();
  });

  it('shows deleted replies and hides deletion controls from other members', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      [`GET /conversations/${id}`]: {
        body: {
          topic: { ...topic, authorId: 'other' },
          items: [
            {
              ...topic,
              id: memberId,
              topicId: id,
              title: null,
              body: '',
              mentions: [],
              deletedAt: '2026-11-04T12:00:00Z',
            },
          ],
          hasMore: false,
        },
      },
    });
    renderApp(`/conversations/${id}`);
    expect(await screen.findByText('mensagem excluída')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Excluir/ }),
    ).not.toBeInTheDocument();
  });

  it('allows admins to delete someone else’s topic', async () => {
    mockApi({
      ...sessionRoutes({ ...makeUser(), roles: ['ADMIN'] }),
      [`GET /conversations/${id}`]: {
        body: {
          topic: { ...topic, authorId: 'other' },
          items: [],
          hasMore: false,
        },
      },
    });
    renderApp(`/conversations/${id}`);
    expect(
      await screen.findByRole('button', { name: 'Excluir conversa' }),
    ).toBeInTheDocument();
  });

  it('loads images through the protected API and rejects oversized attachments', async () => {
    const image = 'data:image/png;base64,iVBORw0KGgo=';
    mockApi({
      ...sessionRoutes(makeUser()),
      [`GET /conversations/${id}`]: {
        body: {
          topic: { ...topic, hasImage: true },
          items: [],
          hasMore: false,
        },
      },
      [`GET /conversations/${id}/image`]: { body: { image } },
    });
    renderApp(`/conversations/${id}`);
    expect(
      await screen.findByRole('img', { name: 'Imagem da publicação' }),
    ).toHaveAttribute('src', image);
    const file = new File([new Uint8Array(1024 * 1024 + 1)], 'large.png', {
      type: 'image/png',
    });
    fireEvent.change(screen.getByLabelText('Anexar imagem (até 1 MB)'), {
      target: { files: [file] },
    });
    expect(
      await screen.findByText(
        'Escolha uma imagem PNG, JPEG ou WebP de até 1 MB.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Imagem anexada' }),
    ).not.toBeInTheDocument();
  });

  it('opens the page containing a newly submitted reply', async () => {
    const requests = mockApi({
      ...sessionRoutes(makeUser()),
      [`GET /conversations/${id}`]: (request) => ({
        body: {
          topic,
          items:
            request.query.get('page') === '1'
              ? [
                  {
                    ...topic,
                    id: memberId,
                    topicId: id,
                    title: null,
                    body: 'Resposta na segunda página',
                  },
                ]
              : [],
          hasMore: request.query.get('page') !== '1',
        },
      }),
      [`POST /conversations/${id}/replies`]: {
        body: { id: memberId, page: 1 },
      },
    });
    renderApp(`/conversations/${id}`);
    fireEvent.change(
      await screen.findByRole('textbox', { name: /Sua resposta/ }),
      { target: { value: 'Resposta na segunda página' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    await screen.findByText('Página 2');
    expect(
      await screen.findByText('Resposta na segunda página'),
    ).toBeInTheDocument();
    expect(screen.getByText('Página 2')).toBeInTheDocument();
    expect(
      requests.some((r) => r.method === 'GET' && r.query.get('page') === '1'),
    ).toBe(true);
  });

  it('blocks pending accounts before querying conversations', async () => {
    const user = { ...makeUser(), status: 'PENDING_APPROVAL' as const };
    const requests = mockApi(sessionRoutes(user));
    expect(canAccessRoute(`/conversations/${id}`, [], user)).toBe(false);
    renderApp(`/conversations/${id}`);
    expect(
      await screen.findByRole('heading', { name: 'Acesso negado' }),
    ).toBeInTheDocument();
    expect(requests.some((r) => r.path.startsWith('/conversations'))).toBe(
      false,
    );
  });
});
