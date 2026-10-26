import { Logger } from '@nestjs/common';
import { youtubeApiVideos } from './youtube-api';
import { VideosService } from './videos.module';

const channel = {
  items: [{ contentDetails: { relatedPlaylists: { uploads: 'uploads-id' } } }],
};
const item = (id: string, date: string) => ({
  snippet: { title: 'Mensagem & família', publishedAt: '2026-10-26T12:00:00Z' },
  contentDetails: { videoId: id, videoPublishedAt: date },
});
const items = [
  item('aaaaaaaaaaa', '2026-10-01T10:00:00Z'),
  item('bbbbbbbbbbb', '2026-10-11T10:00:00Z'),
];

afterEach(() => jest.restoreAllMocks());

it('logs only HTTP status and recognized Google reasons without exposing credentials', async () => {
  const warn = jest
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation(() => undefined);
  jest.spyOn(global, 'fetch').mockResolvedValue(
    Response.json(
      {
        error: {
          message: 'sensitive-key',
          errors: [
            { reason: 'accessNotConfigured' },
            { reason: 'sensitive-key' },
          ],
          details: [
            { reason: 'SERVICE_DISABLED', metadata: { key: 'sensitive-key' } },
          ],
        },
      },
      { status: 403 },
    ),
  );
  await expect(youtubeApiVideos('sensitive-key')).rejects.toThrow(
    'YouTube Data API unavailable',
  );
  expect(warn).toHaveBeenCalledWith(
    'YouTube channels: HTTP 403; reason=accessNotConfigured,SERVICE_DISABLED',
  );
  expect(JSON.stringify(warn.mock.calls)).not.toContain('sensitive-key');
});

it('uses official API with the uploads playlist and actual video dates, then caches', async () => {
  jest.replaceProperty(process, 'env', {
    ...process.env,
    YOUTUBE_API_KEY: 'test-key',
  });
  const fetcher = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(Response.json(channel))
    .mockResolvedValueOnce(
      Response.json({
        items: [...items, item('invalid', 'invalid'), items[0]],
      }),
    );
  const service = new VideosService();
  const result = await service.latest();
  expect(result.items.map((v) => v.id)).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa']);
  expect(result.items[0]).toMatchObject({
    title: 'Mensagem & família',
    publishedAt: '2026-10-11T10:00:00.000Z',
  });
  expect(await service.latest()).toEqual(result);
  expect(fetcher).toHaveBeenCalledTimes(2);
  const urls = fetcher.mock.calls.map(([url]) => new URL(String(url)));
  expect(urls[0]?.pathname).toBe('/youtube/v3/channels');
  expect(urls[1]?.searchParams.get('playlistId')).toBe('uploads-id');
  expect(urls[1]?.searchParams.get('part')).toBe('snippet,contentDetails');
  expect(urls[1]?.searchParams.get('maxResults')).toBe('12');
  expect(urls[1]?.searchParams.get('key')).toBe('test-key');
});

it('preserves stale cache and backs off if the official API fails', async () => {
  jest.replaceProperty(process, 'env', {
    ...process.env,
    YOUTUBE_API_KEY: 'test-key',
  });
  const now = Date.now();
  const time = jest.spyOn(Date, 'now').mockReturnValue(now);
  const fetcher = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(Response.json(channel))
    .mockResolvedValueOnce(Response.json({ items }))
    .mockResolvedValue(new Response('secret upstream error', { status: 403 }));
  const service = new VideosService();
  const first = await service.latest();
  time.mockReturnValue(now + 11 * 60_000);
  expect(await service.latest()).toEqual({ ...first, stale: true });
  await service.latest();
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('accepts an empty playlist but rejects malformed and unavailable responses', async () => {
  const fetcher = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(Response.json(channel))
    .mockResolvedValueOnce(Response.json({ items: [] }));
  expect(await youtubeApiVideos('test-key')).toEqual([]);
  fetcher
    .mockResolvedValueOnce(Response.json(channel))
    .mockResolvedValueOnce(
      Response.json({ items: [item('invalid', 'invalid')] }),
    );
  await expect(youtubeApiVideos('test-key')).rejects.toThrow(
    'Invalid YouTube video metadata',
  );
  fetcher.mockResolvedValueOnce(Response.json({ items: [] }));
  await expect(youtubeApiVideos('test-key')).rejects.toThrow(
    'Missing YouTube uploads playlist',
  );
  fetcher.mockResolvedValueOnce(new Response('test-key', { status: 403 }));
  await expect(youtubeApiVideos('test-key')).rejects.toThrow(
    'YouTube Data API unavailable',
  );
});
