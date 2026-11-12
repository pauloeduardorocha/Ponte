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
      await screen.findByRole(
        'link',
        { name: /Conversar sobre o encontro/ },
        { timeout: 10000 },
      ),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: topic.title }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ana Souza')).toBeInTheDocument();
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
    renderApp('/conversations');
    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: 'Nova conversa' },
        { timeout: 10000 },
      ),
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
    fireEvent.change(
      screen.getByRole('textbox', { name: /Escreva um comentário/ }),
      {
        target: { value: 'Uma resposta' },
      },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Comentar' }));
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
      await screen.findByRole('button', { name: 'Eliminar conversa' }),
    );
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Eliminar',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'conversa eliminada' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('@Maria')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /Escreva um comentário/ }),
    ).not.toBeInTheDocument();
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
    expect(await screen.findByText('mensagem eliminada')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Eliminar/ }),
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
      await screen.findByRole('button', { name: 'Eliminar conversa' }),
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

  it('appends ten comments at a time without replacing the ones already visible', async () => {
    const comment = (n: number) => ({
      ...topic,
      id: '00000000-0000-4000-8000-' + String(n + 10).padStart(12, '0'),
      topicId: id,
      title: null,
      body: 'Comentário ' + n,
      _count: { replies: 0, children: 0 },
    });
    const requests = mockApi({
      ...sessionRoutes(makeUser()),
      ['GET /conversations/' + id]: (request) => ({
        body: {
          topic,
          items:
            request.query.get('page') === '1'
              ? [comment(1)]
              : Array.from({ length: 10 }, (_, n) => comment(11 - n)),
          hasMore: request.query.get('page') !== '1',
        },
      }),
    });
    renderApp('/conversations/' + id);
    expect(await screen.findByText('Comentário 11')).toBeInTheDocument();
    expect(screen.queryByText('Comentário 1')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Mostrar mais comentários' }),
    );
    expect(await screen.findByText('Comentário 1')).toBeInTheDocument();
    expect(screen.getByText('Comentário 11')).toBeInTheDocument();
    expect(screen.queryByText(/Página [0-9]/)).not.toBeInTheDocument();
    expect(
      requests.some(
        (r) => r.query.get('page') === '1' && r.query.get('order') === 'desc',
      ),
    ).toBe(true);
  });

  it('refreshes cached conversation data manually', async () => {
    let reads = 0;
    mockApi({
      ...sessionRoutes(makeUser()),
      [`GET /conversations/${id}`]: () => ({
        body: {
          topic: {
            ...topic,
            title: ++reads > 1 ? 'Conversa atualizada' : topic.title,
          },
          items: [],
          hasMore: false,
        },
      }),
    });
    renderApp(`/conversations/${id}`);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Atualizar conversa' }),
    );
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Conversa atualizada',
      }),
    ).toBeInTheDocument();
    expect(reads).toBe(2);
  });

  it('replies to a comment and displays the response inside its thread', async () => {
    const comment = {
      ...topic,
      id: memberId,
      topicId: id,
      title: null,
      body: 'Comentário original',
      author: { id: 'other', name: 'Maria Santos' },
      authorId: 'other',
      _count: { replies: 0, children: 0 },
    };
    let saved = false;
    const requests = mockApi({
      ...sessionRoutes(makeUser()),
      [`GET /conversations/${id}`]: {
        body: { topic, items: [comment], hasMore: false },
      },
      [`GET /conversations/${id}/replies`]: {
        body: {
          items: [
            {
              ...comment,
              id: 'reply',
              parentId: memberId,
              body: 'Resposta vinculada',
            },
          ],
          hasMore: false,
        },
      },
      [`POST /conversations/${id}/replies`]: () => {
        saved = true;
        return { body: { id: 'reply', page: 0 } };
      },
    });
    renderApp(`/conversations/${id}`);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Responder a Maria Santos' }),
    );
    fireEvent.change(
      screen.getByRole('textbox', { name: /Sua resposta ao comentário/ }),
      { target: { value: 'Resposta vinculada' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    await waitFor(() => expect(saved).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: /Sua resposta ao comentário/ }),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Resposta vinculada')).toBeInTheDocument();
    expect(
      requests.find((r) => r.method === 'POST' && r.path.endsWith('/replies'))
        ?.body,
    ).toEqual({ body: 'Resposta vinculada', parentId: memberId });
    expect(
      requests
        .find((r) => r.method === 'GET' && r.path.endsWith('/replies'))
        ?.query.get('parentId'),
    ).toBe(memberId);
  });

  it('uses horizontal cards on home with a link to all conversations and no previous/next buttons', async () => {
    mockApi({
      ...sessionRoutes(makeUser(['LIBRARY_BOOK_READ'])),
      'GET /conversations': { body: { items: [topic], hasMore: false } },
    });
    renderApp('/');
    expect(
      await screen.findByRole(
        'link',
        { name: 'Ver mural' },
        { timeout: 10000 },
      ),
    ).toHaveAttribute('href', '/mural');
    const panel = within(
      screen.getByRole('region', { name: 'Painéis de conversas' }),
    );
    expect(
      panel.queryByRole('heading', { name: 'Conversas' }),
    ).not.toBeInTheDocument();
    expect(
      panel.queryByRole('button', { name: 'Nova conversa' }),
    ).not.toBeInTheDocument();
    expect(
      panel.queryByRole('button', { name: /Atualizar/ }),
    ).not.toBeInTheDocument();
    const navigation = screen.getByRole('navigation', {
      name: 'Navegação principal',
    });
    const labels = within(navigation)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels.indexOf('Mural')).toBe(labels.indexOf('Visão geral') + 1);
    expect(labels.indexOf('Biblioteca')).toBe(labels.indexOf('Mural') + 1);
    expect(
      screen.queryByRole('button', { name: 'Conversas anteriores' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Próximas conversas' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Ver mural' }));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Mural',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Conversar sobre o encontro/ }),
    ).toBeInTheDocument();
  });

  it('loads more cards on the all-conversations page', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      'GET /conversations': (request) => ({
        body: {
          items: [
            request.query.get('page') === '1'
              ? { ...topic, id: memberId, title: 'Conversa mais antiga' }
              : topic,
          ],
          hasMore: request.query.get('page') !== '1',
        },
      }),
    });
    renderApp('/mural');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Carregar mais conversas' }),
    );
    expect(
      await screen.findByRole('link', { name: /Conversa mais antiga/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Conversar sobre o encontro/ }),
    ).toBeInTheDocument();
    const refresh = screen.getByRole('button', { name: 'Atualizar conversas' });
    expect(refresh).toHaveTextContent('');
    expect(refresh.querySelector('svg')).toBeInTheDocument();
    expect(refresh.parentElement?.parentElement).toContainElement(
      screen.getByRole('button', { name: 'Nova conversa' }),
    );
    expect(screen.getByRole('link', { name: 'Mural' })).toHaveAttribute(
      'href',
      '/mural',
    );
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
