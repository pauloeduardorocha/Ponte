import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { videoPlaylists, type PlaylistVideoFeed } from '@church/shared';
import { youtubePlaylistPage } from './youtube-api';

type Entry = {
  cached?: PlaylistVideoFeed;
  retryAt: number;
  pending?: Promise<PlaylistVideoFeed>;
};

@Injectable()
export class PlaylistVideosService {
  private readonly pages = new Map<string, Entry>();

  async page(
    playlistId: string,
    pageToken?: string,
  ): Promise<PlaylistVideoFeed> {
    if (!videoPlaylists.some((item) => item.id === playlistId))
      throw new NotFoundException('Playlist não encontrada.');
    if (
      pageToken !== undefined &&
      (typeof pageToken !== 'string' || !pageToken || pageToken.length > 1024)
    )
      throw new BadRequestException('Página inválida.');
    const key = JSON.stringify([playlistId, pageToken]);
    let entry = this.pages.get(key);
    if (!entry) {
      // Bound cache growth, including requests with arbitrary continuation tokens.
      if (this.pages.size >= 200)
        this.pages.delete(this.pages.keys().next().value!);
      entry = { retryAt: 0 };
      this.pages.set(key, entry);
    }
    if (Date.now() < entry.retryAt) {
      if (entry.cached) return entry.cached;
      throw new ServiceUnavailableException(
        'Não foi possível carregar a playlist.',
      );
    }
    if (!entry.pending) {
      const current = entry;
      current.pending = this.refresh(current, playlistId, pageToken).finally(
        () => {
          current.pending = undefined;
        },
      );
      return current.pending;
    }
    return entry.pending;
  }

  private async refresh(
    entry: Entry,
    playlistId: string,
    pageToken?: string,
  ): Promise<PlaylistVideoFeed> {
    try {
      const key = process.env.YOUTUBE_API_KEY?.trim();
      if (!key) throw new Error('Missing YouTube API key');
      const page = await youtubePlaylistPage(key, playlistId, pageToken);
      entry.cached = {
        ...page,
        stale: false,
        updatedAt: new Date().toISOString(),
      };
      entry.retryAt = Date.now() + 10 * 60_000;
      return entry.cached;
    } catch {
      entry.retryAt = Date.now() + 60_000;
      if (entry.cached)
        return (entry.cached = { ...entry.cached, stale: true });
      throw new ServiceUnavailableException(
        'Não foi possível carregar a playlist.',
      );
    }
  }
}
