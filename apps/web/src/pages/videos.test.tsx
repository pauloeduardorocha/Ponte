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
