import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  anonymousRoutes,
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
import { videoPlaylists } from '../lib/video-playlists';

describe('Video playlists', () => {
  beforeEach(resetTestState);

  it('shows every playlist in the menu and catalog to an account without permissions', async () => {
    mockApi(sessionRoutes(makeUser([])));
    renderApp('/videos');
    expect(
      await screen.findByRole('heading', { name: 'Vídeos', level: 1 }),
    ).toBeInTheDocument();
    const navigation = screen.getByRole('list', { name: 'Vídeos' });
    for (const playlist of videoPlaylists) {
      expect(
        within(navigation).getByRole('link', { name: playlist.title }),
      ).toHaveAttribute('href', `/videos/${playlist.id}`);
      expect(
        screen.getByRole('heading', { name: playlist.title, level: 2 }),
      ).toBeInTheDocument();
    }
  });

  it('opens only the selected playlist and replaces the player when navigating', async () => {
    mockApi(sessionRoutes(makeUser([])));
    const [first, second] = videoPlaylists;
    renderApp(`/videos/${first.id}`);
    const player = await screen.findByTitle(
      `Vídeos da playlist: ${first.title}`,
    );
    expect(new URL(player.getAttribute('src')!).searchParams.get('list')).toBe(
      first.id,
    );
    expect(
      new URL(player.getAttribute('src')!).searchParams.get('autoplay'),
    ).toBe('0');
    fireEvent.click(
      within(screen.getByRole('list', { name: 'Vídeos' })).getByRole('link', {
        name: second.title,
      }),
    );
    const nextPlayer = await screen.findByTitle(
      `Vídeos da playlist: ${second.title}`,
    );
    expect(
      new URL(nextPlayer.getAttribute('src')!).searchParams.get('list'),
    ).toBe(second.id);
    expect(
      screen.queryByTitle(`Vídeos da playlist: ${first.title}`),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir no YouTube' }),
    ).toHaveAttribute(
      'href',
      `https://www.youtube.com/playlist?list=${second.id}`,
    );
  });

  it('selects a video beside the player, loads more and resets selection on navigation', async () => {
    const [first, second] = videoPlaylists;
    const video = (id: string, title: string, position: number) => ({
      id,
      title,
      position,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
    mockApi({
      ...sessionRoutes(makeUser([])),
      [`GET /videos/playlists/${first.id}`]: (request) => ({
        body: {
          items: request.query.get('pageToken')
            ? [video('ccccccccccc', 'Mensagem três', 2)]
            : [
                video('aaaaaaaaaaa', 'Mensagem um', 0),
                video('bbbbbbbbbbb', 'Mensagem dois', 1),
              ],
          nextPageToken: request.query.get('pageToken')
            ? undefined
            : 'next-token',
          stale: false,
        },
      }),
      [`GET /videos/playlists/${second.id}`]: {
        body: { items: [], stale: false },
      },
    });
    renderApp(`/videos/${first.id}`);
    const message = await screen.findByRole('button', {
      name: /Mensagem dois/,
    });
    fireEvent.click(message);
    expect(message).toHaveAttribute('aria-pressed', 'true');
    const player = screen.getByTitle(`Vídeos da playlist: ${first.title}`);
    const src = new URL(player.getAttribute('src')!);
    expect(src.pathname).toBe('/embed/bbbbbbbbbbb');
    expect(src.searchParams.get('list')).toBe(first.id);
    expect(src.searchParams.get('index')).toBe('1');
    fireEvent.click(
      screen.getByRole('button', { name: 'Carregar mais vídeos' }),
    );
    expect(
      await screen.findByRole('button', { name: /Mensagem três/ }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('list', { name: 'Vídeos' })).getByRole('link', {
        name: second.title,
      }),
    );
    const next = await screen.findByTitle(
      `Vídeos da playlist: ${second.title}`,
    );
    expect(
      new URL(next.getAttribute('src')!).searchParams.get('autoplay'),
    ).toBe('0');
    expect(
      screen.queryByRole('button', { name: /Mensagem dois/ }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        'Não há vídeos públicos disponíveis nesta playlist.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the player and YouTube link usable if the list fails', async () => {
    const first = videoPlaylists[0];
    mockApi({
      ...sessionRoutes(makeUser([])),
      [`GET /videos/playlists/${first.id}`]: { status: 503 },
    });
    renderApp(`/videos/${first.id}`);
    expect(
      await screen.findByRole('button', { name: 'Tentar novamente' }),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle(`Vídeos da playlist: ${first.title}`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Abrir no YouTube' }),
    ).toBeInTheDocument();
  });

  it('handles an unknown playlist without embedding arbitrary content', async () => {
    mockApi(sessionRoutes(makeUser([])));
    renderApp('/videos/unknown');
    expect(
      await screen.findByRole('heading', { name: 'Playlist não encontrada' }),
    ).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('requires login for playlist pages', async () => {
    mockApi(anonymousRoutes);
    renderApp(`/videos/${videoPlaylists[0].id}`);
    expect(
      await screen.findByRole('button', { name: 'Entrar' }),
    ).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
  });
});
