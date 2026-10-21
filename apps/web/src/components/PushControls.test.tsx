import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

describe('Push controls in the personal inbox', () => {
  const requestPermission = vi.fn();
  const unsubscribe = vi.fn();
  let subscribed = false;
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/test',
    options: {},
    toJSON: () => ({
      keys: { p256dh: 'public', auth: 'auth' },
      expirationTime: null,
    }),
    unsubscribe,
  };
  const subscribe = vi.fn();
  beforeEach(() => {
    resetTestState();
    subscribed = false;
    requestPermission.mockReset().mockResolvedValue('granted');
    unsubscribe.mockReset().mockImplementation(async () => {
      subscribed = false;
      return true;
    });
    subscribe.mockReset().mockImplementation(async () => {
      subscribed = true;
      return subscription;
    });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('Notification', { requestPermission });
    vi.stubGlobal('PushManager', class {});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getRegistration: async () => ({
          active: {},
          pushManager: {
            subscribe,
            getSubscription: async () => (subscribed ? subscription : null),
          },
        }),
      },
    });
  });
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    vi.unstubAllGlobals();
  });
  function routes(enabled = true) {
    return {
      ...sessionRoutes(makeUser([])),
      'GET /operations/inbox': { body: { items: [], total: 0 } },
      'GET /operations/inbox/unread': { body: { count: 0 } },
      'GET /operations/push/config': {
        body: { enabled, publicKey: enabled ? 'AQID' : null },
      },
      'POST /operations/push/subscriptions': { body: { subscribed: true } },
      'DELETE /operations/push/subscriptions': { body: { subscribed: false } },
    };
  }
  it('opts in only after a click and allows disabling this browser again', async () => {
    const requests = mockApi(routes());
    renderApp('/inbox');
    const button = await screen.findByRole('button', {
      name: 'Ativar notificações neste dispositivo',
    });
    await waitFor(() => expect(button).toBeEnabled());
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(button);
    const disable = await screen.findByRole('button', {
      name: 'Desativar notificações neste dispositivo',
    });
    expect(requestPermission).toHaveBeenCalledOnce();
    expect(
      requests.find(
        (r) =>
          r.method === 'POST' && r.path === '/operations/push/subscriptions',
      )?.body,
    ).toEqual({
      endpoint: subscription.endpoint,
      keys: { p256dh: 'public', auth: 'auth' },
    });
    await waitFor(() => expect(disable).toBeEnabled());
    fireEvent.click(disable);
    await screen.findByRole('button', {
      name: 'Ativar notificações neste dispositivo',
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('keeps opt-in disabled when the server has no VAPID configuration', async () => {
    mockApi(routes(false));
    renderApp('/inbox');
    await screen.findByText(/As notificações push ainda não estão disponíveis/);
    expect(
      screen.getByRole('button', {
        name: 'Ativar notificações neste dispositivo',
      }),
    ).toBeDisabled();
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('explains denied permission without registering a device', async () => {
    const requests = mockApi(routes());
    requestPermission.mockResolvedValue('denied');
    renderApp('/inbox');
    const button = await screen.findByRole('button', {
      name: 'Ativar notificações neste dispositivo',
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText(/Permita notificações nas definições/);
    expect(subscribe).not.toHaveBeenCalled();
    expect(
      requests.some(
        (r) =>
          r.method === 'POST' && r.path === '/operations/push/subscriptions',
      ),
    ).toBe(false);
  });
});
