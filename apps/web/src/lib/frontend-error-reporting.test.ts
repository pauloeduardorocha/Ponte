import { afterEach, describe, expect, it, vi } from 'vitest';

describe('frontend error reporting', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends bounded API failure context without request data or token when anonymous', async () => {
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const reporter = await import('./frontend-error-reporting');
    reporter.initFrontendErrorReporting(() => null);
    reporter.reportApiFailure({
      path: '/api/v1/reimbursements?iban=secret', method: 'POST', status: 503,
      requestId: '12345678-1234-4234-8234-123456789abc', message: 'HTTP 503',
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(options.body));
    expect(url).toBe('/api/v1/client-errors');
    expect(payload).toMatchObject({ eventType: 'api', apiStatus: 503, apiMethod: 'POST', apiPath: '/api/v1/reimbursements' });
    expect(payload.clientRequestId).toBe('12345678-1234-4234-8234-123456789abc');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(payload).not.toHaveProperty('body');
  });
});
