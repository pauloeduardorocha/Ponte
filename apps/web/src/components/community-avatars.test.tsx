import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
const avatar = 'data:image/jpeg;base64,/9j/2Q==';
const id = '00000000-0000-4000-8000-000000000001';
const topic = {
  id,
  topicId: null,
  title: 'Fotos na conversa',
  body: 'Olá',
  authorId: 'author',
  author: { id: 'author', name: 'Ana Souza', avatar },
  mentions: [],
  createdAt: '2026-11-04T10:00:00Z',
  deletedAt: null,
  hasImage: false,
  _count: { replies: 1 },
};
beforeEach(resetTestState);
it('shows the account, birthday and conversation photos, including comments', async () => {
  const user = { ...makeUser(), name: 'Usuário da sessão', avatar };
  mockApi({
    ...sessionRoutes(user),
    'GET /community/birthdays': {
      body: [
        { id: 'birthday', name: 'Maria Santos', birthday: '04/11', avatar },
      ],
    },
    'GET /conversations': { body: { items: [topic], hasMore: false } },
    ['GET /conversations/' + id]: {
      body: {
        topic,
        items: [
          {
            ...topic,
            id: 'comment',
            topicId: id,
            title: null,
            author: { id: 'reply-author', name: 'João Silva', avatar },
          },
        ],
        hasMore: false,
      },
    },
  });
  renderApp('/');
  expect(
    await screen.findByAltText('Maria Santos', {}, { timeout: 10000 }),
  ).toHaveAttribute('src', avatar);
  expect(
    await screen.findByAltText('Ana Souza', {}, { timeout: 10000 }),
  ).toHaveAttribute('src', avatar);
  expect(
    within(
      screen.getByRole('button', { name: 'Abrir menu da conta' }),
    ).getByRole('img'),
  ).toHaveAttribute('src', avatar);
  fireEvent.click(screen.getByRole('link', { name: /Fotos na conversa/ }));
  expect(
    await screen.findByAltText('João Silva', {}, { timeout: 10000 }),
  ).toHaveAttribute('src', avatar);
  expect(screen.getByAltText('Ana Souza')).toHaveAttribute('src', avatar);
});
it('keeps initials when a birthday member has no account photo', async () => {
  mockApi({
    ...sessionRoutes(makeUser()),
    'GET /conversations': { body: { items: [], hasMore: false } },
    'GET /community/birthdays': {
      body: [
        { id: 'member', name: 'Maria Santos', birthday: '04/11', avatar: null },
      ],
    },
  });
  renderApp('/');
  await screen.findByText('Maria Santos', {}, { timeout: 10000 });
  const row = screen.getByText('Maria Santos').closest('li')!;
  expect(within(row).getByText('M')).toBeInTheDocument();
  expect(within(row).queryByRole('img')).not.toBeInTheDocument();
});
