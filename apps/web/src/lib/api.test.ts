import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiRequest,
  getAccessToken,
  onSessionExpired,
  refreshSession,
  setAccessToken,
} from './api';
import { mockApi } from '../test/utils';

describe('apiRequest', () => {
  beforeEach(() => setAccessToken(null));
  afterEach(() => vi.unstubAllGlobals());

  it('sends credentials and the bearer token', async () => {
    const requests = mockApi({ 'GET /ping': { body: { ok: true } } });
    setAccessToken('token-a');

    await expect(apiRequest('/ping')).resolves.toEqual({ ok: true });
    expect(requests[0]?.credentials).toBe('include');
    expect(requests[0]?.headers.Authorization).toBe('Bearer token-a');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const requests = mockApi({
      'GET /ping': (request) =>
        request.headers.Authorization === 'Bearer token-b'
          ? { body: { ok: true } }
          : { status: 401 },
      'POST /auth/refresh': {
        body: { accessToken: 'token-b', user: { id: '1' } },
      },
    });
    setAccessToken('token-a');

    const results = await Promise.all([
      apiRequest('/ping'),
      apiRequest('/ping'),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(requests.filter((r) => r.path === '/auth/refresh')).toHaveLength(1);
    expect(getAccessToken()).toBe('token-b');
  });

  it('notifies session expiration when refresh fails', async () => {
    mockApi({
      'GET /ping': { status: 401 },
      'POST /auth/refresh': { status: 401 },
    });
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);
    setAccessToken('token-a');

    await expect(apiRequest('/ping')).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    unsubscribe();
  });

  it('exposes API error messages', async () => {
    mockApi({
      'POST /things': { status: 400, body: { message: ['name is required'] } },
    });

    await expect(
      apiRequest('/things', { method: 'POST', body: {} }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'name is required',
    });
  });

  it('does not hide network or server errors during restoration', async () => {
    mockApi({
      'POST /auth/refresh': { status: 503, body: { message: 'Unavailable' } },
    });
    await expect(refreshSession()).rejects.toMatchObject({ status: 503 });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(refreshSession()).rejects.toMatchObject({ status: 0 });
  });

  it('does not restore a token from an in-flight refresh after logout', async () => {
    let release: (() => void) | undefined;
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApi({
      'POST /auth/refresh': async () => {
        await delayed;
        return { body: { accessToken: 'late-token', user: { id: '1' } } };
      },
    });
    const restoring = refreshSession();
    setAccessToken(null);
    release?.();
    await expect(restoring).resolves.toBeNull();
    expect(getAccessToken()).toBeNull();
  });
});
