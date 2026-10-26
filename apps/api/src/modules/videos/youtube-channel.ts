import type { ChurchVideo } from './videos.module';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pageData(html: string, name: string): unknown {
  const json = html.match(
    new RegExp(`(?:var\\s+)?${name}\\s*=\\s*(\\{.*?\\});`, 's'),
  )?.[1];
  if (!json) throw new Error('Missing YouTube page data');
  return JSON.parse(json) as unknown;
}

export function channelVideoIds(html: string): string[] {
  const ids = new Set<string>();
  function visit(value: unknown) {
    if (ids.size >= 12) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = record(value);
    const lockup = record(node.lockupViewModel);
    const id =
      lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO'
        ? lockup.contentId
        : record(node.videoRenderer).videoId;
    if (typeof id === 'string' && /^[\w-]{11}$/.test(id)) ids.add(id);
    Object.values(node).forEach(visit);
  }
  visit(pageData(html, 'ytInitialData'));
  if (!ids.size) throw new Error('Missing channel videos');
  return [...ids];
}

export function watchVideo(html: string, expectedId: string): ChurchVideo {
  const player = record(pageData(html, 'ytInitialPlayerResponse'));
  const details = record(player.videoDetails);
  const metadata = record(record(player.microformat).playerMicroformatRenderer);
  const date = metadata.publishDate;
  if (
    details.videoId !== expectedId ||
    typeof details.title !== 'string' ||
    !details.title.trim() ||
    typeof date !== 'string' ||
    !Number.isFinite(Date.parse(date))
  ) {
    throw new Error('Invalid video metadata');
  }
  return {
    id: expectedId,
    title: details.title,
    publishedAt: new Date(date).toISOString(),
    url: `https://www.youtube.com/watch?v=${expectedId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${expectedId}/hqdefault.jpg`,
  };
}

export async function channelVideos(
  channelUrl: string,
): Promise<ChurchVideo[]> {
  const signal = AbortSignal.timeout(8000);
  const response = await fetch(`${channelUrl}/videos`, { signal });
  if (!response.ok) throw new Error('Channel unavailable');
  const ids = channelVideoIds(await response.text());
  const items: ChurchVideo[] = [];
  // Bound concurrency and keep one deadline for the entire fallback.
  for (let index = 0; index < ids.length; index += 4) {
    const batch = await Promise.allSettled(
      ids.slice(index, index + 4).map(async (id) => {
        const video = await fetch(`https://www.youtube.com/watch?v=${id}`, {
          signal,
        });
        if (!video.ok) throw new Error('Video unavailable');
        return watchVideo(await video.text(), id);
      }),
    );
    for (const result of batch) {
      if (result.status === 'fulfilled') items.push(result.value);
    }
  }
  if (!items.length) throw new Error('Channel videos unavailable');
  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
