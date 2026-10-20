import {
  Controller,
  Get,
  Injectable,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const CHANNEL_URL = 'https://www.youtube.com/@IGREJAPONTE';
export const FEED_URL =
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCJjDDzfbKwIZoiyIXVhsh0Q';
export type ChurchVideo = {
  id: string;
  title: string;
  publishedAt: string;
  url: string;
  thumbnailUrl: string;
};
type VideoFeed = {
  channelUrl: string;
  items: ChurchVideo[];
  updatedAt: string;
  stale: boolean;
};

export function parseVideos(xml: string): ChurchVideo[] {
  if (XMLValidator.validate(xml) !== true)
    throw new Error('Invalid YouTube feed');
  const parsed = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false,
  }).parse(xml);
  if (!Object.hasOwn(parsed, 'feed')) throw new Error('Missing YouTube feed');
  const entries = parsed.feed.entry ? [parsed.feed.entry].flat() : [];
  const videos = new Map<string, ChurchVideo>();
  for (const entry of entries) {
    const id = entry['yt:videoId'];
    if (
      typeof id !== 'string' ||
      !/^[\w-]{11}$/.test(id) ||
      typeof entry.title !== 'string' ||
      !entry.title.trim() ||
      !Number.isFinite(Date.parse(entry.published))
    )
      continue;
    videos.set(id, {
      id,
      title: entry.title,
      publishedAt: new Date(entry.published).toISOString(),
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  }
  if (entries.length && !videos.size)
    throw new Error('Invalid YouTube entries');
  return [...videos.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 12);
}

@Injectable()
export class VideosService {
  private cached?: VideoFeed;
  private retryAt = 0;
  private pending?: Promise<VideoFeed>;

  async latest(): Promise<VideoFeed> {
    if (Date.now() < this.retryAt) {
      if (this.cached) return this.cached;
      throw new ServiceUnavailableException(
        'Não foi possível carregar os vídeos.',
      );
    }
    if (!this.pending)
      this.pending = this.refresh().finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }

  private async refresh(): Promise<VideoFeed> {
    try {
      const response = await fetch(FEED_URL, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('YouTube unavailable');
      const items = parseVideos(await response.text());
      this.cached = {
        channelUrl: CHANNEL_URL,
        items,
        updatedAt: new Date().toISOString(),
        stale: false,
      };
      this.retryAt = Date.now() + 10 * 60_000;
      return this.cached;
    } catch {
      this.retryAt = Date.now() + 60_000;
      if (this.cached) return (this.cached = { ...this.cached, stale: true });
      throw new ServiceUnavailableException(
        'Não foi possível carregar os vídeos.',
      );
    }
  }
}

// AuthGuard global: disponível a qualquer conta autenticada, sem permissão administrativa.
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}
  @Get() latest() {
    return this.videos.latest();
  }
}

@Module({ controllers: [VideosController], providers: [VideosService] })
export class VideosModule {}
