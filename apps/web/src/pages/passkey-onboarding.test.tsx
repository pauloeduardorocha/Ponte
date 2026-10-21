import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import {
  anonymousRoutes,
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
import { getAccessToken } from '../lib/api';
import {
  rememberPasskey,
  shouldOfferPasskey,
  shouldStartPasskeyLogin,
} from '../lib/passkey-preferences';

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

const platformAvailable = vi.fn();
function installPlatform() {
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal(
    'PublicKeyCredential',
    class {
      static isUserVerifyingPlatformAuthenticatorAvailable = platformAvailable;
    },
  );
}

function mockLogin() {
  const user = makeUser();
  const requests = mockApi({
    ...anonymousRoutes,
    'POST /auth/login': { body: { accessToken: 'password-session', user } },
    'GET /auth/me': { body: user },
    'GET /auth/passkeys': { body: [] },
    'POST /auth/passkeys/register/options': {
      body: {
        challengeId: 'register-challenge',
        options: {
          challenge: 'nonce',
          authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
          },
        },
      },
    },
    'POST /auth/passkeys/register/verify': { body: { message: 'OK' } },
    'POST /auth/passkeys/login/options': {
      body: { challengeId: 'login-challenge', options: { challenge: 'nonce' } },
    },
    'POST /auth/passkeys/login/verify': {
      body: { accessToken: 'passkey-session', user },
    },
    'POST /auth/logout': { status: 204 },
  });
  return { user, requests };
}

async function signIn() {
  fireEvent.change(await screen.findByLabelText('E-mail'), {
    target: { value: makeUser().email },
  });
  fireEvent.change(screen.getByLabelText('Senha', { exact: true }), {
    target: { value: 'current-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await screen.findByRole('heading', { name: 'Minha conta', hidden: true });
}

function mobileViewport() {
  vi.mocked(window.matchMedia).mockImplementation((media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('Passkey invitation after password login', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetTestState();
    localStorage.clear();
    sessionStorage.clear();
    platformAvailable.mockResolvedValue(true);
    installPlatform();
  });

  it.each(['desktop', 'mobile'])(
    'offers enrollment after password login on %s and automatically authenticates on the next visit',
    async (viewport) => {
      if (viewport === 'mobile') mobileViewport();
      const { requests, user } = mockLogin();
      vi.mocked(startRegistration).mockResolvedValue({
        id: 'new-credential',
      } as never);
      renderApp('/account?from=test');

      // First-time visitors can type their password without a biometric interruption.
      await screen.findByRole('button', { name: 'Entrar' });
      expect(startAuthentication).not.toHaveBeenCalled();
      await signIn();
      const invitation = await screen.findByRole('dialog', {
        name: 'Entrar mais rápido neste dispositivo?',
      });
      expect(startRegistration).not.toHaveBeenCalled();
      fireEvent.click(
        within(invitation).getByRole('button', {
          name: 'Ativar neste dispositivo',
        }),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      expect(startRegistration).toHaveBeenCalledWith({
        optionsJSON: {
          challenge: 'nonce',
          authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
            authenticatorAttachment: 'platform',
          },
        },
      });
      expect(
        requests.find((r) => r.path === '/auth/passkeys/register/options')
          ?.body,
      ).toEqual({ password: 'current-password' });
      expect(
        requests.find((r) => r.path === '/auth/passkeys/register/verify')?.body,
      ).toEqual({
        challengeId: 'register-challenge',
        response: { id: 'new-credential' },
        name: 'Este dispositivo',
      });
      expect(shouldOfferPasskey(user.id)).toBe(false);
      expect(shouldStartPasskeyLogin()).toBe(true);
      expect(JSON.stringify({ ...localStorage })).not.toContain(
        'current-password',
      );
      expect(JSON.stringify({ ...sessionStorage })).not.toContain(
        'current-password',
      );

      // A fresh app visit restores the local preference, but still verifies on the server.
      resetTestState();
      installPlatform();
      if (viewport === 'mobile') mobileViewport();
      mockLogin();
      vi.mocked(startAuthentication).mockResolvedValue({
        id: 'new-credential',
      } as never);
      renderApp('/account?from=test');
      await screen.findByRole('heading', { name: 'Minha conta' });
      expect(startAuthentication).toHaveBeenCalledTimes(1);
      expect(getAccessToken()).toBe('passkey-session');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );

  it('postpones the invitation for 30 days for this account and browser', async () => {
    const { user, requests } = mockLogin();
    renderApp('/account');
    await signIn();
    fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(shouldOfferPasskey(user.id)).toBe(false);
    expect(shouldOfferPasskey('another-user')).toBe(true);
    expect(startRegistration).not.toHaveBeenCalled();
    expect(
      requests.some((r) => r.path === '/auth/passkeys/register/options'),
    ).toBe(false);

    const now = Date.now();
    const date = vi
      .spyOn(Date, 'now')
      .mockReturnValue(now + 31 * 24 * 60 * 60 * 1000);
    expect(shouldOfferPasskey(user.id)).toBe(true);
    date.mockRestore();
  });

  it('allows retry after cancelling enrollment and marks the device only after server verification', async () => {
    const { user } = mockLogin();
    vi.mocked(startRegistration).mockRejectedValueOnce(
      new DOMException('Cancelled', 'NotAllowedError'),
    );
    renderApp('/account');
    await signIn();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ativar neste dispositivo' }),
    );
    await screen.findByText(/Operação cancelada ou expirada/);
    expect(shouldStartPasskeyLogin()).toBe(false);
    expect(shouldOfferPasskey(user.id)).toBe(true);
    expect(getAccessToken()).toBe('password-session');
    vi.mocked(startRegistration).mockResolvedValueOnce({
      id: 'new-credential',
    } as never);
    fireEvent.click(
      screen.getByRole('button', { name: 'Ativar neste dispositivo' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(shouldStartPasskeyLogin()).toBe(true);
  });

  it('keeps the session after server rejection without remembering an unverified passkey', async () => {
    const user = makeUser();
    mockApi({
      ...anonymousRoutes,
      'POST /auth/login': { body: { accessToken: 'password-session', user } },
      'GET /auth/me': { body: user },
      'GET /auth/passkeys': { body: [] },
      'POST /auth/passkeys/register/options': {
        body: { challengeId: 'challenge', options: {} },
      },
      'POST /auth/passkeys/register/verify': {
        status: 400,
        body: { message: 'Passkey inválida' },
      },
    });
    vi.mocked(startRegistration).mockResolvedValue({
      id: 'unverified',
    } as never);
    renderApp('/account');
    await signIn();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Ativar neste dispositivo' }),
    );
    await screen.findByText('Passkey inválida');
    expect(shouldStartPasskeyLogin()).toBe(false);
    expect(getAccessToken()).toBe('password-session');
  });

  it.each([false, 'error'])(
    'does not offer enrollment when platform availability is %s',
    async (available) => {
      if (available === 'error')
        platformAvailable.mockRejectedValue(new Error('Unavailable'));
      else platformAvailable.mockResolvedValue(false);
      mockLogin();
      renderApp('/account');
      await signIn();
      await waitFor(() => expect(platformAvailable).toHaveBeenCalled());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(getAccessToken()).toBe('password-session');
    },
  );

  it('does not invite again on session restoration or after a passkey login', async () => {
    mockApi({
      ...sessionRoutes(makeUser()),
      'GET /auth/passkeys': { body: [] },
    });
    renderApp('/account');
    await screen.findByRole('heading', { name: 'Minha conta' });
    expect(platformAvailable).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not automatically sign back in after an explicit logout', async () => {
    const user = makeUser();
    rememberPasskey(user.id, 'existing');
    mockApi({ ...sessionRoutes(user), 'GET /auth/passkeys': { body: [] } });
    renderApp('/account');
    await screen.findByRole('heading', { name: 'Minha conta' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Abrir menu da conta' }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }));
    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeEnabled();
    expect(startAuthentication).not.toHaveBeenCalled();
    expect(shouldStartPasskeyLogin()).toBe(false);
  });
});
