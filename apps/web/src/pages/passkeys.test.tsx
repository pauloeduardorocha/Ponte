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
