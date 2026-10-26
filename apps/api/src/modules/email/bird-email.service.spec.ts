import { ConfigService } from '@nestjs/config';
import { BirdEmailService } from './bird-email.service';

const message = {
  to: 'recipient@example.org',
  subject: 'Redefinir senha',
  text: 'Link privado',
  html: '<p>Link privado</p>',
};

describe('Bird EU email contract (mocked HTTP)', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  const service = (values = {}) =>
    new BirdEmailService(
      new ConfigService({ BIRD_API_KEY: 'bk_eu1_test-key', ...values }),
    );

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'em_test', status: 'accepted' }), {
        status: 202,
      }),
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it('submits a transactional email to the EU host with tracking disabled', async () => {
    await service().send(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://eu1.platform.bird.com/v1/email/messages');
    expect(request).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer bk_eu1_test-key',
        'Content-Type': 'application/json',
      },
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(request?.body as string)).toEqual({
      from: { email: 'noreply@igrejaponte.com', name: 'Igreja Ponte' },
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
      category: 'transactional',
      track_clicks: false,
      track_opens: false,
    });
  });

  it('allows an explicitly configured verified sender', async () => {
    await service({ BIRD_EMAIL_FROM: 'outro@igrejaponte.com' }).send(message);
    expect(
      JSON.parse(fetchMock.mock.calls[0]![1]?.body as string).from.email,
    ).toBe('outro@igrejaponte.com');
  });

  it('does not send without a private API key', async () => {
    const email = service({ BIRD_API_KEY: '' });
    expect(email.configured).toBe(false);
    await expect(email.send(message)).rejects.toThrow('not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { BIRD_API_KEY: 'bk_us1_other-region' },
    { BIRD_API_KEY: 'access-key' },
    { BIRD_API_KEY: 'bk_eu1_bad\nkey' },
    { BIRD_EMAIL_FROM: 'invalid-sender' },
  ])('rejects invalid configuration without leaking values: %j', (values) => {
    expect(() => service(values)).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([200, 401, 403, 422, 429, 500])(
    'does not treat HTTP %s as accepted or expose provider response content',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response('private provider details', { status }),
      );
      await expect(service().send(message)).rejects.toThrow(
        `Bird did not accept the email (HTTP ${status}).`,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('sanitizes transport/timeout errors and never retries an uncertain send', async () => {
    fetchMock.mockRejectedValue(new Error('bk_eu1_test-key private-link'));
    await expect(service().send(message)).rejects.toThrow(
      'Bird email request failed or timed out.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
