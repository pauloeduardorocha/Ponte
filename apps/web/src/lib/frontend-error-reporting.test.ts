import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from './app-version';

describe('frontend error reporting', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends bounded API failure context without request data or token when anonymous', async () => {
    vi.resetModules();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const reporter = await import('./frontend-error-reporting');
    reporter.initFrontendErrorReporting(() => null);
    reporter.reportApiFailure({
      path: '/api/v1/reimbursements?iban=secret',
      method: 'POST',
      status: 503,
      requestId: '12345678-1234-4234-8234-123456789abc',
      message: 'HTTP 503',
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(options.body));
    expect(url).toBe('/api/v1/client-errors');
    expect(payload).toMatchObject({
      eventType: 'api',
      apiStatus: 503,
      apiMethod: 'POST',
      apiPath: '/api/v1/reimbursements',
    });
    expect(payload.clientRequestId).toBe(
      '12345678-1234-4234-8234-123456789abc',
    );
    expect(payload.device.appVersion).toBe(APP_VERSION);
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(payload).not.toHaveProperty('body');
    reporter.recordApiRecovery({
      path: '/library/books?search=private-value',
      attempts: 2,
      durationMs: 800,
    });
    reporter.reportApiFailure({
      path: '/another',
      method: 'GET',
      message: 'Later failure',
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const next = JSON.parse(String(fetchMock.mock.calls[1]![1].body));
    expect(next.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining(
            'Consulta GET recuperada: /library/books; tentativas=2',
          ),
        }),
      ]),
    );
    expect(JSON.stringify(next)).not.toContain('private-value');
  });
});
