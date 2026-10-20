import { fireEvent, screen, waitFor } from '@testing-library/react';
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

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

describe('Passkeys in login and account', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetTestState();
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('PublicKeyCredential', class {});
  });

  it('signs in without asking for an email or password', async () => {
    const user = makeUser();
    const requests = mockApi({
      ...anonymousRoutes,
      'POST /auth/passkeys/login/options': {
        body: { challengeId: 'challenge', options: { challenge: 'nonce' } },
      },
      'POST /auth/passkeys/login/verify': {
        body: { accessToken: 'passkey-session', user },
      },
      'GET /auth/me': { body: user },
      'GET /auth/passkeys': { body: [] },
    });
    vi.mocked(startAuthentication).mockResolvedValue({
      id: 'credential',
    } as never);
    renderApp('/account');
    await screen.findByRole('button', {
      name: 'Entrar com biometria ou passkey',
    });
    expect(startAuthentication).not.toHaveBeenCalled();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Entrar com biometria ou passkey',
      }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Minha conta' }),
    ).toBeInTheDocument();
    expect(getAccessToken()).toBe('passkey-session');
    expect(
      requests.find((r) => r.path === '/auth/passkeys/login/verify')?.body,
    ).toEqual({ challengeId: 'challenge', response: { id: 'credential' } });
  });

  function useMobileViewport() {
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

  it('automatically signs in on mobile and returns to the requested page', async () => {
    useMobileViewport();
    const user = makeUser();
    mockApi({
      ...anonymousRoutes,
      'POST /auth/passkeys/login/options': {
        body: { challengeId: 'challenge', options: { challenge: 'nonce' } },
      },
      'POST /auth/passkeys/login/verify': {
        body: { accessToken: 'mobile-session', user },
      },
      'GET /auth/passkeys': { body: [] },
    });
    vi.mocked(startAuthentication).mockResolvedValue({
      id: 'credential',
    } as never);
    renderApp('/account');

    expect(
      await screen.findByRole('heading', { name: 'Minha conta' }),
    ).toBeInTheDocument();
    expect(startAuthentication).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe('mobile-session');
    expect(
      screen.queryByRole('button', { name: 'Entrar com biometria ou passkey' }),
    ).not.toBeInTheDocument();
  });

  it('allows password login after cancelling the automatic mobile prompt without reopening it', async () => {
    useMobileViewport();
    const user = makeUser();
    mockApi({
      ...anonymousRoutes,
      'POST /auth/passkeys/login/options': {
        body: { challengeId: 'challenge', options: {} },
      },
      'POST /auth/login': { body: { accessToken: 'password-session', user } },
      'GET /auth/me': { body: user },
      'GET /auth/passkeys': { body: [] },
    });
    vi.mocked(startAuthentication).mockRejectedValue(
      new DOMException('Cancelled', 'NotAllowedError'),
    );
    renderApp('/account');

    await screen.findByText(/Operação cancelada ou expirada/);
    expect(
      screen.queryByRole('button', { name: 'Entrar com biometria ou passkey' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: 'current-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByRole('heading', { name: 'Minha conta' }),
    ).toBeInTheDocument();
    expect(getAccessToken()).toBe('password-session');
    expect(startAuthentication).toHaveBeenCalledTimes(1);
  });

  it('keeps password login available on mobile without passkey support', async () => {
    useMobileViewport();
    vi.stubGlobal('PublicKeyCredential', undefined);
    const requests = mockApi(anonymousRoutes);
    renderApp('/login');

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeEnabled();
    expect(startAuthentication).not.toHaveBeenCalled();
    expect(
      requests.some((r) => r.path === '/auth/passkeys/login/options'),
    ).toBe(false);
  });

  it('keeps password login available when the device prompt is cancelled', async () => {
    const requests = mockApi({
      ...anonymousRoutes,
      'POST /auth/passkeys/login/options': {
        body: { challengeId: 'challenge', options: {} },
      },
    });
    vi.mocked(startAuthentication).mockRejectedValue(
      new DOMException('Cancelled', 'NotAllowedError'),
    );
    renderApp('/login');
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Entrar com biometria ou passkey',
      }),
    );
    expect(
      await screen.findByText(/Operação cancelada ou expirada/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
    expect(getAccessToken()).toBeNull();
    expect(requests.some((r) => r.path === '/auth/passkeys/login/verify')).toBe(
      false,
    );
  });

  it('registers a passkey with the current password and removes it from the account', async () => {
    let registered = false;
    const requests = mockApi({
      ...sessionRoutes(makeUser()),
      'GET /auth/passkeys': () => ({
        body: registered
          ? [{ id: 'credential', name: 'O meu dispositivo' }]
          : [],
      }),
      'POST /auth/passkeys/register/options': {
        body: { challengeId: 'challenge', options: { challenge: 'nonce' } },
      },
      'POST /auth/passkeys/register/verify': () => {
        registered = true;
        return { body: { message: 'OK' } };
      },
      'DELETE /auth/passkeys/credential': () => {
        registered = false;
        return { status: 204 };
      },
    });
    vi.mocked(startRegistration).mockResolvedValue({
      id: 'credential',
    } as never);
    renderApp('/account');
    await screen.findByText('Nenhuma passkey registada.');
    fireEvent.change(
      screen.getByLabelText('Senha atual para ativar', { exact: false }),
      { target: { value: 'current-password' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Ativar biometria / criar passkey' }),
    );
    await screen.findByText(/Passkey ativada/);
    await waitFor(() =>
      expect(
        screen.getByLabelText('Senha atual para ativar', { exact: false }),
      ).toHaveValue(''),
    );
    expect(
      requests.find((r) => r.path === '/auth/passkeys/register/options')?.body,
    ).toEqual({ password: 'current-password' });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remover O meu dispositivo' }),
    );
    expect(await screen.findByText(/Passkey removida/)).toBeInTheDocument();
  });
});
