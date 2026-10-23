import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/api';
import { reimbursementFileRequest } from './api';

vi.mock('../../lib/frontend-error-reporting', () => ({
  reportApiFailure: vi.fn(),
}));
import { reportApiFailure } from '../../lib/frontend-error-reporting';

describe('reimbursement transport', () => {
  beforeEach(() => {
    setAccessToken('expired');
    vi.clearAllMocks();
  });
  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('refreshes an expired session and resends the same multipart documents', async () => {
    const body = new FormData();
    body.append(
      'files',
      new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' }),
    );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: 'fresh' })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'saved' })));
    vi.stubGlobal('fetch', fetch);
    expect(await (await reimbursementFileRequest('', body)).json()).toEqual({
      id: 'saved',
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[1]?.[0]).toBe('/api/v1/auth/refresh');
    const retry = fetch.mock.calls[2]?.[1];
    expect(retry).toMatchObject({
      method: 'POST',
      body,
      credentials: 'include',
    });
    expect(retry.headers.Authorization).toBe('Bearer fresh');
    expect(retry.headers['Content-Type']).toBeUndefined();
  });

  it('explains a non-JSON 503, records edge correlation and never retries the write', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response('<html>Unavailable</html>', {
        status: 503,
        headers: { 'x-vercel-id': 'cdg1::test-request' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const body = new FormData();
    body.append('files', new File(['receipt'], 'receipt.pdf'));
    await expect(reimbursementFileRequest('', body)).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('Confira se o pedido foi guardado'),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(reportApiFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        status: 503,
        requestId: 'cdg1::test-request',
        message: expect.stringContaining('anexosBytes=7'),
      }),
    );
  });

  it('preserves binary downloads and gives a readable network error', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('binary'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    expect(
      await (
        await reimbursementFileRequest('/id/attachments/file/download')
      ).text(),
    ).toBe('binary');
    await expect(
      reimbursementFileRequest('', new FormData()),
    ).rejects.toMatchObject({
      status: 0,
      message: 'Não foi possível conectar ao servidor.',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
