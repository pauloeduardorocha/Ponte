import { channelVideoIds, channelVideos, watchVideo } from './youtube-channel';
import { FEED_URL, VideosService } from './videos.module';

const channel =
  '<script>var ytInitialData = {"contents":[{"lockupViewModel":{"contentId":"aaaaaaaaaaa","contentType":"LOCKUP_CONTENT_TYPE_VIDEO"}},{"videoRenderer":{"videoId":"bbbbbbbbbbb"}},{"videoRenderer":{"videoId":"invalid"}},{"videoRenderer":{"videoId":"aaaaaaaaaaa"}}]};</script>';
const watch = (id: string) =>
  `<script>var ytInitialPlayerResponse = ${JSON.stringify({ videoDetails: { videoId: id, title: 'Mensagem & família' }, microformat: { playerMicroformatRenderer: { publishDate: '2026-10-25T10:00:00Z' } } })};</script>`;

afterEach(() => jest.restoreAllMocks());

it('reads both channel layouts, deduplicates and rejects invalid video IDs', () => {
  expect(channelVideoIds(channel)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  expect(() => channelVideoIds('<html>Consent</html>')).toThrow();
});

it('uses real publication dates and rejects mismatched watch metadata', () => {
  expect(watchVideo(watch('aaaaaaaaaaa'), 'aaaaaaaaaaa')).toMatchObject({
    title: 'Mensagem & família',
    publishedAt: '2026-10-25T10:00:00.000Z',
  });
  expect(() => watchVideo(watch('bbbbbbbbbbb'), 'aaaaaaaaaaa')).toThrow();
  expect(() =>
    watchVideo(
      watch('aaaaaaaaaaa').replace('2026-10-25T10:00:00Z', 'invalid'),
      'aaaaaaaaaaa',
    ),
  ).toThrow();
});

it('recovers from a live-feed 404 through channel metadata and caches the result', async () => {
  const fetcher = jest
    .spyOn(global, 'fetch')
    .mockImplementation(async (url) => {
      if (url === FEED_URL) return new Response('', { status: 404 });
      if (String(url).endsWith('/videos')) return new Response(channel);
      return new Response(watch(new URL(String(url)).searchParams.get('v')!));
    });
  const service = new VideosService();
  const result = await service.latest();
  expect(result.stale).toBe(false);
  expect(result.items.map((v) => v.id)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
  expect(await service.latest()).toEqual(result);
  expect(fetcher).toHaveBeenCalledTimes(4);
});

it('keeps available videos when an individual watch page fails', async () => {
  jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
    if (String(url).endsWith('/videos')) return new Response(channel);
    if (String(url).includes('bbbbbbbbbbb'))
      return new Response('', { status: 404 });
    return new Response(watch('aaaaaaaaaaa'));
  });
  expect(
    (await channelVideos('https://www.youtube.com/@IGREJAPONTE')).map(
      (v) => v.id,
    ),
  ).toEqual(['aaaaaaaaaaa']);
});
