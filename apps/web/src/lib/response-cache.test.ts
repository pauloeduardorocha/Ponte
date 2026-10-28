import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  activateResponseCache,
  beginResponseCacheMutation,
  clearResponseCache,
  invalidateResponseCache,
  readResponseCache,
  responseCacheTicket,
  writeResponseCache,
} from './response-cache';
import { apiRequest, setAccessToken } from './api';
import { createQueryClient } from './query-client';

const alice = { id: 'alice', permissions: ['read'] };
const url = '/api/v1/finance/accounts';
const path = '/finance/accounts';
function response(value = 1, policy = 'private, max-age=3600') {
  return new Response(JSON.stringify({ value }), {
    headers: {
      'content-type': 'application/json',
      'cache-control': policy,
      vary: 'Authorization, Cookie',
    },
  });
}

describe('persistent private response cache', () => {
  let stores: Map<string, Map<string, Response>>;
  beforeEach(async () => {
    stores = new Map();
    vi.stubGlobal('crypto', webcrypto);
    vi.stubGlobal('caches', {
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        const rows = stores.get(name)!;
        return {
          match: async (key: string) => rows.get(key)?.clone(),
          put: async (key: string, value: Response) => {
            rows.set(key, value.clone());
          },
          delete: async (key: string) => rows.delete(key),
          keys: async () => [...rows.keys()].map((key) => new Request(key)),
        };
      },
    });
    await clearResponseCache();
    await activateResponseCache(alice);
  });
  afterEach(async () => {
    setAccessToken(null);
    await clearResponseCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  async function save() {
    await writeResponseCache(url, path, response(), responseCacheTicket());
  }
  async function read() {
    return readResponseCache(url, path, responseCacheTicket());
  }

  it('survives activation after reload for the verified same account, without storing credentials', async () => {
    await save();
    await activateResponseCache(alice);
    expect(await (await read())?.json()).toEqual({ value: 1 });
    const stored = [...stores.values()][0]!;
    expect([...stored.keys()]).toEqual([
      new URL(url, window.location.origin).href,
    ]);
    expect([...stored.values()][0]!.headers.has('vary')).toBe(false);
  });
  it('expires at the server TTL, without stale offline fallback', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await save();
    vi.spyOn(Date, 'now').mockReturnValue(now + 3600000);
    expect(await read()).toBeUndefined();
  });
  it('isolates pages/filters and caps the server TTL at the route policy', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    await writeResponseCache(
      `${url}?page=1`,
      `${path}?page=1`,
      response(1, 'private, max-age=86400'),
      responseCacheTicket(),
    );
    await writeResponseCache(
      `${url}?page=2`,
      `${path}?page=2`,
      response(2),
      responseCacheTicket(),
    );
    expect(
      await (
        await readResponseCache(
          `${url}?page=2`,
          `${path}?page=2`,
          responseCacheTicket(),
        )
      )?.json(),
    ).toEqual({ value: 2 });
    expect(await read()).toBeUndefined();
    clock.mockReturnValue(now + 3600000);
    expect(
      await readResponseCache(
        `${url}?page=1`,
        `${path}?page=1`,
        responseCacheTicket(),
      ),
    ).toBeUndefined();
  });
  it('reads valid cached data offline without issuing a network request', async () => {
    await save();
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    setAccessToken('test-token');
    await expect(apiRequest(path)).resolves.toEqual({ value: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('cancels a write if logout occurs while cache invalidation is pending', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    setAccessToken('test-token');
    const writing = apiRequest(path, { method: 'POST', body: {} });
    setAccessToken(null);
    await expect(writing).rejects.toThrow('A sessão mudou');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves the original timestamp in React Query after loading a persisted response', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    await save();
    clock.mockReturnValue(now + 1800000);
    setAccessToken('test-token');
    const client = createQueryClient();
    const options = {
      queryKey: ['finance', 'accounts'],
      queryFn: () => apiRequest(path),
    };
    try {
      await client.fetchQuery(options);
      expect(client.getQueryState(options.queryKey)?.dataUpdatedAt).toBe(now);
      clock.mockReturnValue(now + 3600001);
      expect(
        client
          .getQueryCache()
          .find({ queryKey: options.queryKey })
          ?.isStaleByTime(3600000),
      ).toBe(true);
    } finally {
      client.clear();
    }
  });
  it('discards old data after account/permission changes and logout', async () => {
    await save();
    await activateResponseCache({ ...alice, permissions: [] });
    expect(await read()).toBeUndefined();
    await save();
    await activateResponseCache({ ...alice, id: 'bob' });
    expect(await read()).toBeUndefined();
    await save();
    await clearResponseCache();
    expect(await read()).toBeUndefined();
    expect(stores.size).toBe(0);
  });
  it('prevents an in-flight old read from repopulating after mutation/manual invalidation', async () => {
    const ticket = responseCacheTicket();
    await save();
    await invalidateResponseCache();
    await writeResponseCache(url, path, response(), ticket);
    expect(await read()).toBeUndefined();
  });
  it('does not reuse or persist reads during a write or after its completion', async () => {
    await save();
    const finish = await beginResponseCacheMutation();
    const duringWrite = responseCacheTicket();
    expect(await read()).toBeUndefined();
    await writeResponseCache(url, path, response(), duringWrite);
    await finish();
    await writeResponseCache(url, path, response(), duringWrite);
    expect(await read()).toBeUndefined();
    await save();
    expect(await read()).toBeDefined();
  });
  it.each([
    ['/library/books/availability', 'private, max-age=3600'],
    ['/library/books?available=true', 'private, max-age=3600'],
    [path, 'no-store'],
    [path, 'public, max-age=3600'],
  ])(
    'refuses critical paths and disallowed server policy: %s %s',
    async (candidate, policy) => {
      await writeResponseCache(
        candidate,
        candidate,
        response(1, policy),
        responseCacheTicket(),
      );
      expect(
        await readResponseCache(candidate, candidate, responseCacheTicket()),
      ).toBeUndefined();
    },
  );
  it('does not cache an error even when it includes max-age', async () => {
    await writeResponseCache(
      url,
      path,
      new Response('{}', { status: 403, headers: response().headers }),
      responseCacheTicket(),
    );
    expect(await read()).toBeUndefined();
  });
  it('uses cached API reads and invalidates them before an uncertain write', async () => {
    const fetch = vi.fn().mockImplementation(async () => response());
    vi.stubGlobal('fetch', fetch);
    setAccessToken('test-token');
    await apiRequest(path);
    await apiRequest(path);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cache: 'no-store' }),
    );
    fetch.mockResolvedValueOnce(new Response('{}', { status: 400 }));
    await expect(
      apiRequest(path, { method: 'POST', body: {} }),
    ).rejects.toThrow();
    await apiRequest(path);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('continues without persistent storage when it is unavailable', async () => {
    vi.stubGlobal('caches', undefined);
    await save();
    expect(await read()).toBeUndefined();
  });
});
