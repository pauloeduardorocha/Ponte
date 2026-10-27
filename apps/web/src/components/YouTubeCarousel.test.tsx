import { screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

beforeEach(resetTestState);

it('shows latest videos to a member without administrative permissions', async () => {
  mockApi({
    ...sessionRoutes(makeUser([])),
    'GET /health': { body: { status: 'ok' } },
    'GET /videos': {
      body: {
        stale: false,
        items: [
          {
            id: 'aaaaaaaaaaa',
            title: 'Reunião Família',
            publishedAt: '2026-10-11T10:00:00Z',
            url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
            thumbnailUrl: 'https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg',
          },
        ],
      },
    },
  });
  renderApp('/');
  const main = await screen.findByRole('main');
  const video = await within(main).findByRole('link', {
    name: 'Assistir: Reunião Família (abre no YouTube)',
  });
  expect(video).toHaveAttribute(
    'href',
    'https://www.youtube.com/watch?v=aaaaaaaaaaa',
  );
  expect(video).toHaveAttribute('target', '_blank');
  expect(
    screen.getByRole('button', { name: 'Próximos vídeos' }),
  ).toBeInTheDocument();
});

it('keeps the channel link available when the feed is empty', async () => {
  mockApi({
    ...sessionRoutes(makeUser([])),
    'GET /health': { body: { status: 'ok' } },
    'GET /videos': { body: { items: [], stale: false } },
  });
  renderApp('/');
  expect(
    await screen.findByText('Ainda não há vídeos disponíveis no canal.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ver canal' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/@IGREJAPONTE',
  );
});
