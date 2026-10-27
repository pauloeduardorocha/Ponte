import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { videoPlaylists } from '@church/shared';
import { PlaylistVideosService } from './playlist-videos.service';
import { youtubePlaylistPage } from './youtube-api';

const playlistId = videoPlaylists[0]!.id;
const item = (id: string, position: number, privacyStatus = 'public') => ({
  snippet: { title: `Mensagem ${position}`, position },
  contentDetails: { videoId: id },
  status: { privacyStatus },
});
beforeEach(() =>
  jest.replaceProperty(process, 'env', {
    ...process.env,
    YOUTUBE_API_KEY: 'test-key',
  }),
);
afterEach(() => jest.restoreAllMocks());

it('keeps playlist order, filters unavailable videos and passes continuation tokens', async () => {
  const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(
    Response.json({
      items: [
        item('bbbbbbbbbbb', 3),
        item('aaaaaaaaaaa', 0),
        item('ccccccccccc', 1, 'private'),
        item('invalid', 2),
      ],
      nextPageToken: 'next-token',
    }),
  );
  const result = await youtubePlaylistPage(
    'test-key',
    playlistId,
    'previous-token',
  );
  expect(result.items.map((v) => [v.id, v.position])).toEqual([
    ['aaaaaaaaaaa', 0],
    ['bbbbbbbbbbb', 3],
  ]);
  expect(result.nextPageToken).toBe('next-token');
  const url = new URL(String(fetcher.mock.calls[0]![0]));
  expect(url.searchParams.get('playlistId')).toBe(playlistId);
  expect(url.searchParams.get('pageToken')).toBe('previous-token');
  expect(url.searchParams.get('maxResults')).toBe('50');
});

it('rejects unknown playlists and invalid page tokens before contacting Google', async () => {
  const fetcher = jest.spyOn(global, 'fetch');
  const service = new PlaylistVideosService();
  await expect(service.page('unknown')).rejects.toBeInstanceOf(
    NotFoundException,
  );
  await expect(
    service.page(playlistId, 'x'.repeat(1025)),
  ).rejects.toBeInstanceOf(BadRequestException);
  await expect(
    service.page(playlistId, ['token'] as unknown as string),
  ).rejects.toBeInstanceOf(BadRequestException);
  expect(fetcher).not.toHaveBeenCalled();
});

it('shares simultaneous requests and isolates cache by playlist and page', async () => {
  const fetcher = jest
    .spyOn(global, 'fetch')
    .mockImplementation(async () =>
      Response.json({ items: [item('aaaaaaaaaaa', 0)] }),
    );
  const service = new PlaylistVideosService();
  const [first, second] = await Promise.all([
    service.page(playlistId),
    service.page(playlistId),
  ]);
  expect(first).toEqual(second);
  await service.page(playlistId);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await service.page(playlistId, 'next');
  await service.page(videoPlaylists[1]!.id);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('keeps stale pages after an outage and backs off', async () => {
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now);
  const fetcher = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(Response.json({ items: [item('aaaaaaaaaaa', 0)] }))
    .mockRejectedValue(new Error('offline'));
  const service = new PlaylistVideosService();
  const first = await service.page(playlistId);
  clock.mockReturnValue(now + 11 * 60_000);
  expect(await service.page(playlistId)).toEqual({ ...first, stale: true });
  await service.page(playlistId);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('returns controlled unavailability without a key and accepts empty playlists', async () => {
  delete process.env.YOUTUBE_API_KEY;
  const service = new PlaylistVideosService();
  await expect(service.page(playlistId)).rejects.toBeInstanceOf(
    ServiceUnavailableException,
  );
  process.env.YOUTUBE_API_KEY = 'test-key';
  jest.spyOn(global, 'fetch').mockResolvedValue(Response.json({ items: [] }));
  expect((await new PlaylistVideosService().page(playlistId)).items).toEqual(
    [],
  );
});
