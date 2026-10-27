import { Logger } from '@nestjs/common';
import type { PlaylistVideo, PlaylistVideoPage } from '@church/shared';
import type { ChurchVideo } from './videos.module';

const CHANNEL_ID = 'UCJjDDzfbKwIZoiyIXVhsh0Q';
const logger = new Logger('YouTubeDataApi');
const safeReasons = new Set([
  'accessNotConfigured',
  'keyInvalid',
  'ipRefererBlocked',
  'quotaExceeded',
  'dailyLimitExceeded',
  'forbidden',
  'playlistNotFound',
  'channelNotFound',
  'SERVICE_DISABLED',
  'API_KEY_INVALID',
  'API_KEY_EXPIRED',
  'API_KEY_SERVICE_BLOCKED',
  'API_KEY_HTTP_REFERRER_BLOCKED',
  'API_KEY_IP_ADDRESS_BLOCKED',
  'RATE_LIMIT_EXCEEDED',
]);

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function youtubeApiClient(apiKey: string) {
  const signal = AbortSignal.timeout(8000);
  const get = async (resource: string, params: Record<string, string>) => {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    url.search = new URLSearchParams({ ...params, key: apiKey }).toString();
    const response = await fetch(url.toString(), { signal });
    // Never include Google's error body or request URL (contains the key).
    if (!response.ok) {
      const body = record(await response.json().catch(() => undefined));
      const error = record(body.error);
      const entries = [
        ...(Array.isArray(error.errors) ? error.errors : []),
        ...(Array.isArray(error.details) ? error.details : []),
      ];
      const reasons = [
        ...new Set(
          entries
            .map((entry) => record(entry).reason)
            .filter(
              (reason): reason is string =>
                typeof reason === 'string' && safeReasons.has(reason),
            ),
        ),
      ];
      logger.warn(
        `YouTube ${resource}: HTTP ${response.status}; reason=${reasons.join(',') || 'unknown'}`,
      );
      throw new Error('YouTube Data API unavailable');
    }
    return record(await response.json());
  };

  return get;
}

export async function youtubeApiVideos(apiKey: string): Promise<ChurchVideo[]> {
  const get = youtubeApiClient(apiKey);
  const channel = await get('channels', {
    part: 'contentDetails',
    id: CHANNEL_ID,
  });
  const first = Array.isArray(channel.items) ? record(channel.items[0]) : {};
  const uploads = record(record(first.contentDetails).relatedPlaylists).uploads;
  if (typeof uploads !== 'string' || !uploads)
    throw new Error('Missing YouTube uploads playlist');
  const result = await get('playlistItems', {
    part: 'snippet,contentDetails',
    playlistId: uploads,
    maxResults: '12',
  });
  if (!Array.isArray(result.items))
    throw new Error('Invalid YouTube API items');
  const videos = new Map<string, ChurchVideo>();
  for (const item of result.items) {
    const snippet = record(record(item).snippet);
    const details = record(record(item).contentDetails);
    const id = details.videoId;
    const date = details.videoPublishedAt;
    if (
      typeof id !== 'string' ||
      !/^[\w-]{11}$/.test(id) ||
      typeof snippet.title !== 'string' ||
      !snippet.title.trim() ||
      typeof date !== 'string' ||
      !Number.isFinite(Date.parse(date))
    )
      continue;
    videos.set(id, {
      id,
      title: snippet.title,
      publishedAt: new Date(date).toISOString(),
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  }
  if (result.items.length && !videos.size)
    throw new Error('Invalid YouTube video metadata');
  return [...videos.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 12);
}

export async function youtubePlaylistPage(
  apiKey: string,
  playlistId: string,
  pageToken?: string,
): Promise<PlaylistVideoPage> {
  const get = youtubeApiClient(apiKey);
  const result = await get('playlistItems', {
    part: 'snippet,contentDetails,status',
    playlistId,
    maxResults: '50',
    ...(pageToken ? { pageToken } : {}),
  });
  if (!Array.isArray(result.items))
    throw new Error('Invalid YouTube API items');
  const items: PlaylistVideo[] = [];
  for (const item of result.items) {
    const snippet = record(record(item).snippet);
    const id = record(record(item).contentDetails).videoId;
    if (
      typeof id !== 'string' ||
      !/^[\w-]{11}$/.test(id) ||
      typeof snippet.title !== 'string' ||
      !snippet.title.trim() ||
      !Number.isInteger(snippet.position) ||
      Number(snippet.position) < 0 ||
      record(record(item).status).privacyStatus !== 'public'
    )
      continue;
    items.push({
      id,
      title: snippet.title,
      position: Number(snippet.position),
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  }
  return {
    items: items.sort((a, b) => a.position - b.position),
    ...(typeof result.nextPageToken === 'string' && result.nextPageToken
      ? { nextPageToken: result.nextPageToken }
      : {}),
  };
}
