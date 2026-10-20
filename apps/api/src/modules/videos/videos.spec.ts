import { ServiceUnavailableException } from '@nestjs/common';
import { parseVideos, VideosService, FEED_URL } from './videos.module';

const entry = (id: string, date: string, title = 'Mensagem &amp; família') =>
  `<entry><yt:videoId>${id}</yt:videoId><title>${title}</title><published>${date}</published></entry>`;
const feed = `<feed>${entry('aaaaaaaaaaa', '2026-10-01T10:00:00Z')}${entry('bbbbbbbbbbb', '2026-10-11T10:00:00Z')}</feed>`;

describe('Church videos', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('decodes titles, orders latest first and ignores invalid entries', () => {
    const videos = parseVideos(
      feed.replace('</feed>', `${entry('invalid', 'invalid')}</feed>`),
    );
    expect(videos.map((v) => v.id)).toEqual(['bbbbbbbbbbb', 'aaaaaaaaaaa']);
    expect(videos[0]?.title).toBe('Mensagem & família');
    expect(videos[0]?.url).toBe('https://www.youtube.com/watch?v=bbbbbbbbbbb');
    expect(() => parseVideos('<html>Unavailable</html>')).toThrow();
    expect(parseVideos('<feed></feed>')).toEqual([]);
  });

  it('shares in-flight requests and caches successful responses', async () => {
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(feed));
    const service = new VideosService();
    const [a, b] = await Promise.all([service.latest(), service.latest()]);
    expect(a).toEqual(b);
    expect(await service.latest()).toEqual(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(FEED_URL, expect.any(Object));
  });

  it('retains previous videos when upstream fails, then backs off', async () => {
    const now = Date.now();
    const time = jest.spyOn(Date, 'now').mockReturnValue(now);
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(feed))
      .mockRejectedValue(new Error('offline'));
    const service = new VideosService();
    const first = await service.latest();
    time.mockReturnValue(now + 11 * 60_000);
    const stale = await service.latest();
    expect(stale.items).toEqual(first.items);
    expect(stale.stale).toBe(true);
    await service.latest();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns a controlled error when no cached videos exist', async () => {
    const fetcher = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('offline'));
    const service = new VideosService();
    await expect(service.latest()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.latest()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
