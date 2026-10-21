import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

describe('First authenticated visit notification invitation', () => {
  let permission: NotificationPermission;
  let subscribed: boolean;
  const requestPermission = vi.fn();
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/test',
    options: {},
    toJSON: () => ({ keys: { p256dh: 'public', auth: 'auth' } }),
    unsubscribe: vi.fn(),
  };
  beforeEach(() => {
    resetTestState();
    localStorage.removeItem('ponte:push-invitation:v1:user-1');
    permission = 'default';
    subscribed = false;
    requestPermission.mockReset().mockImplementation(async () => {
      permission = 'granted';
      return permission;
    });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', {
      requestPermission,
      get permission() {
        return permission;
      },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getRegistration: async () => ({
          active: {},
          pushManager: {
            getSubscription: async () => (subscribed ? subscription : null),
            subscribe: async () => {
              subscribed = true;
              return subscription;
            },
          },
        }),
      },
    });
  });
  afterEach(() => {
    resetTestState();
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  });
  function routes() {
    return {
      ...sessionRoutes(makeUser([])),
      'GET /operations/inbox': { body: { items: [], total: 0 } },
      'GET /operations/inbox/unread': { body: { count: 0 } },
      'GET /operations/push/config': {
        body: { enabled: true, publicKey: 'AQID' },
      },
      'POST /operations/push/subscriptions': { body: { subscribed: true } },
    };
  }
  it('invites after sign-in, asks browser permission only after a click, and saves the subscription', async () => {
    const requests = mockApi(routes());
    renderApp('/inbox');
    const dialog = await screen.findByRole('dialog', {
      name: 'Fique por dentro das novidades da igreja',
    });
    expect(
      within(dialog).getByText(/As notificações são importantes/),
    ).toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Ativar notificações' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(
      requests.some(
        (r) =>
          r.method === 'POST' && r.path === '/operations/push/subscriptions',
      ),
    ).toBe(true);
    expect(localStorage.getItem('ponte:push-invitation:v1:user-1')).toBe(
      'seen',
    );
  });
  it('remembers postponement on this device while preserving the inbox reminder', async () => {
    mockApi(routes());
    const view = renderApp('/inbox');
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Agora não' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Ative as notificações para ficar por dentro/),
    ).toBeInTheDocument();
    view.unmount();
    renderApp('/inbox');
    await screen.findByRole('heading', { name: 'Minhas notificações' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('does not ask again when browser notifications are already blocked', async () => {
    permission = 'denied';
    mockApi(routes());
    renderApp('/inbox');
    await screen.findByText(/As notificações estão bloqueadas neste navegador/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('does not invite devices that already have notifications active', async () => {
    permission = 'granted';
    subscribed = true;
    mockApi(routes());
    renderApp('/inbox');
    await screen.findByRole('button', {
      name: 'Desativar notificações neste dispositivo',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('offers notifications after the first successful password login', async () => {
    const user = makeUser([]);
    mockApi({
      ...routes(),
      'POST /auth/refresh': { status: 401 },
      'POST /auth/login': { body: { accessToken: 'login-token', user } },
    });
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText(/E-mail/), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText(/^Senha/), {
      target: { value: 'password123' },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(
      await screen.findByRole('dialog', {
        name: 'Fique por dentro das novidades da igreja',
      }),
    ).toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('queues the notification invitation after passkey enrollment instead of stacking dialogs', async () => {
    const user = makeUser([]);
    vi.stubGlobal(
      'PublicKeyCredential',
      class {
        static isUserVerifyingPlatformAuthenticatorAvailable = async () => true;
      },
    );
    mockApi({
      ...routes(),
      'POST /auth/refresh': { status: 401 },
      'POST /auth/login': { body: { accessToken: 'login-token', user } },
    });
    renderApp('/login');
    fireEvent.change(await screen.findByLabelText(/E-mail/), {
      target: { value: user.email },
    });
    fireEvent.change(screen.getByLabelText(/^Senha/), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    const passkey = await screen.findByRole('dialog');
    expect(within(passkey).getByText(/Ative uma passkey/)).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', {
        name: 'Fique por dentro das novidades da igreja',
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(passkey).getByRole('button', { name: 'Agora não' }));
    expect(
      await screen.findByRole('dialog', {
        name: 'Fique por dentro das novidades da igreja',
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
