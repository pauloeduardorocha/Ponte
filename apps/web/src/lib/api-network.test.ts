import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiRequest,
  getAccessToken,
  onSessionExpired,
  setAccessToken,
} from './api';
import {
  recordApiRecovery,
  reportApiFailure,
} from './frontend-error-reporting';
import { retryQuery } from './query-retry';

vi.mock('./frontend-error-reporting', () => ({
  reportApiFailure: vi.fn(),
  recordApiRecovery: vi.fn(),
}));
vi.mock('./app-update', () => ({
  messageAfterUpdateCheck: async (message: string) => message,
}));

describe('Network recovery and diagnostics', () => {
  it('bounds the complete GET retry cycle to 30 seconds', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new TypeError('slow connection failure')),
              14_000,
            ),
          ),
      );
    vi.stubGlobal('fetch', fetch);
    const result = expect(apiRequest('/things')).rejects.toMatchObject({
      details: { kind: 'timeout', attempts: 2 },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await result;
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('bounds a stalled upload to 90 seconds without replaying it', async () => {
    const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetch);
    const result = expect(
      apiRequest('/things', { method: 'POST', body: new FormData() }),
    ).rejects.toMatchObject({
      details: { kind: 'timeout', attempts: 1 },
      message: expect.stringContaining('Confira se o pedido foi guardado'),
    });
    await vi.advanceTimersByTimeAsync(90_000);
    await result;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setAccessToken('original');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setAccessToken(null);
  });
  it('recovers GET with increasing delays and records recovery without creating an error', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const result = apiRequest('/things');
    await vi.advanceTimersByTimeAsync(499);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(recordApiRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/things', attempts: 3 }),
    );
    expect(reportApiFailure).not.toHaveBeenCalled();
  });
  it('reports one final failure without exposing the exception message and prevents Query from retrying it', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('sensitive-token-in-url'));
    vi.stubGlobal('fetch', fetch);
    let failure: unknown;
    const result = apiRequest('/things').catch((error) => {
      failure = error;
    });
    await vi.advanceTimersByTimeAsync(2000);
    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(reportApiFailure).toHaveBeenCalledTimes(1);
    expect(reportApiFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('tentativas=3'),
      }),
    );
    expect(
      JSON.stringify(vi.mocked(reportApiFailure).mock.calls),
    ).not.toContain('sensitive-token');
    expect(failure).toMatchObject({
      status: 0,
      details: { kind: 'network', exception: 'TypeError' },
    });
    expect(retryQuery(0, failure)).toBe(false);
  });
  it.each(['POST', 'PATCH', 'DELETE'] as const)(
    'never repeats a failed %s and warns about an uncertain write outcome',
    async (method) => {
      const fetch = vi.fn().mockRejectedValue(new TypeError('connection lost'));
      vi.stubGlobal('fetch', fetch);
      await expect(
        apiRequest('/things', { method, body: { ok: true } }),
      ).rejects.toMatchObject({
        status: 0,
        message: expect.stringContaining('Confira se o pedido foi guardado'),
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('aborts a stalled GET after 15 seconds without retrying the timeout', async () => {
    const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetch);
    const result = expect(apiRequest('/things')).rejects.toMatchObject({
      status: 0,
      details: { kind: 'timeout', attempts: 1 },
    });
    await vi.advanceTimersByTimeAsync(15000);
    await result;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![1].signal.aborted).toBe(true);
  });
  it('does not issue or retry requests while the browser reports offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(apiRequest('/things')).rejects.toMatchObject({
      details: { kind: 'offline', attempts: 0 },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not retry HTTP failures in the transport', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: 'Unavailable' }, { status: 503 }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(apiRequest('/things')).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('cancels pending retry when the session changes and does not report cancellation as a network error', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('connection lost'));
    vi.stubGlobal('fetch', fetch);
    const result = expect(apiRequest('/things')).rejects.toMatchObject({
      details: { kind: 'cancelled' },
    });
    await vi.advanceTimersByTimeAsync(0);
    setAccessToken(null);
    await vi.advanceTimersByTimeAsync(500);
    await result;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reportApiFailure).not.toHaveBeenCalled();
  });
  it('does not classify JSON serialization failures as network failures', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(
      apiRequest('/things', { method: 'POST', body: circular }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(fetch).not.toHaveBeenCalled();
    expect(reportApiFailure).not.toHaveBeenCalled();
  });
  it('keeps the authenticated token when a refresh has a transport failure, then recovers on the next query', async () => {
    let refreshes = 0;
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);
    const fetch = vi.fn().mockImplementation(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        if (++refreshes === 1) throw new TypeError('connection lost');
        return Response.json({ accessToken: 'fresh' });
      }
      return options.headers.Authorization === 'Bearer fresh'
        ? Response.json({ ok: true })
        : new Response(null, { status: 401 });
    });
    vi.stubGlobal('fetch', fetch);
    try {
      await expect(apiRequest('/things')).rejects.toMatchObject({ status: 0 });
      expect(getAccessToken()).toBe('original');
      expect(listener).not.toHaveBeenCalled();
      await expect(apiRequest('/things')).resolves.toEqual({ ok: true });
      expect(getAccessToken()).toBe('fresh');
    } finally {
      unsubscribe();
    }
  });
});
