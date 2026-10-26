import type { ChurchVideo } from './videos.module';

const CHANNEL_ID = 'UCJjDDzfbKwIZoiyIXVhsh0Q';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function youtubeApiVideos(apiKey: string): Promise<ChurchVideo[]> {
  const signal = AbortSignal.timeout(8000);
  const get = async (resource: string, params: Record<string, string>) => {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    url.search = new URLSearchParams({ ...params, key: apiKey }).toString();
    const response = await fetch(url.toString(), { signal });
    // Never include Google's error body or request URL (contains the key).
    if (!response.ok) throw new Error('YouTube Data API unavailable');
    return record(await response.json());
  };

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
