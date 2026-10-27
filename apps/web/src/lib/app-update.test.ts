import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from './app-version';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function setup(version: unknown = '99.0.0') {
  vi.resetModules();
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ version }), { status: 200 }),
    );
  vi.stubGlobal('fetch', fetch);
  return { ...(await import('./app-update')), fetch };
}

describe('Version check after errors', () => {
  it('compares semantic versions and shares concurrent checks without reloading', async () => {
    const {
      checkForAppUpdate,
      subscribeToAppUpdate,
      getAvailableVersion,
      fetch,
    } = await setup();
    const listener = vi.fn();
    const unsubscribe = subscribeToAppUpdate(listener);
    expect(
      await Promise.all([checkForAppUpdate(), checkForAppUpdate()]),
    ).toEqual(['99.0.0', '99.0.0']);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]![0]).toMatch(/^\/app-version.json\?t=/);
    expect(fetch.mock.calls[0]![1]).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
    });
    expect(getAvailableVersion()).toBe('99.0.0');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it.each([APP_VERSION, '0.9.9', 'invalid', null])(
    'keeps the original error for version %s',
    async (version) => {
      const { messageAfterUpdateCheck, fetch } = await setup(version);
      expect(await messageAfterUpdateCheck('original')).toBe('original');
      expect(await messageAfterUpdateCheck('another')).toBe('another');
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('falls back on failed checks and limits the check to 2.5 seconds', async () => {
    const { messageAfterUpdateCheck, fetch } = await setup();
    fetch.mockRejectedValueOnce(new Error('offline'));
    expect(await messageAfterUpdateCheck('original')).toBe('original');
    vi.resetModules();
    vi.useFakeTimers();
    fetch.mockImplementation(() => new Promise(() => {}));
    const update = await import('./app-update');
    const pending = update.messageAfterUpdateCheck('original');
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toBe('original');
  });

  it('preserves errors when the response is not JSON', async () => {
    const { messageAfterUpdateCheck, fetch } = await setup();
    fetch.mockResolvedValueOnce(new Response('<html>fallback</html>'));
    expect(await messageAfterUpdateCheck('original')).toBe('original');
  });

  it('offers an update before rejecting failed writes without repeating the write', async () => {
    const update = await setup();
    const { apiRequest } = await import('./api');
    update.fetch.mockImplementation(async (url: string) =>
      url.startsWith('/app-version.json')
        ? new Response(JSON.stringify({ version: '99.0.0' }))
        : new Response(JSON.stringify({ message: 'Original server error' }), {
            status: 503,
          }),
    );
    await expect(
      apiRequest('/things', { method: 'POST', body: { name: 'test' } }),
    ).rejects.toMatchObject({ status: 503, message: update.UPDATE_MESSAGE });
    expect(
      update.fetch.mock.calls.filter(([url]) =>
        String(url).includes('/things'),
      ),
    ).toHaveLength(1);
  });

  it('does not replace validation or permission errors with update prompts', async () => {
    const update = await setup();
    const { apiRequest } = await import('./api');
    update.fetch.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Permissão insuficiente' }), {
        status: 403,
      }),
    );
    await expect(apiRequest('/things')).rejects.toMatchObject({
      status: 403,
      message: 'Permissão insuficiente',
    });
    expect(update.fetch).toHaveBeenCalledOnce();
  });
});
