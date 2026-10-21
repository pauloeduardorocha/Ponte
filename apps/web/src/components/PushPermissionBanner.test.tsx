import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';

describe('Dismissible notification header', () => {
  let permission: NotificationPermission;
  let subscribed: boolean;
  const requestPermission = vi.fn();
  beforeEach(() => {
    resetTestState();
    localStorage.setItem('ponte:push-invitation:v1:user-1', 'seen');
    localStorage.removeItem('ponte:push-banner:v1:user-1');
    permission = 'default';
    subscribed = false;
    requestPermission.mockReset().mockImplementation(async () => {
      permission = 'granted';
      return permission;
    });
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/test',
      options: {},
      toJSON: () => ({ keys: { p256dh: 'public', auth: 'auth' } }),
    };
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
    mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /operations/inbox': { body: { items: [], total: 0 } },
      'GET /operations/inbox/unread': { body: { count: 0 } },
      'GET /operations/push/config': {
        body: { enabled: true, publicKey: 'AQID' },
      },
      'POST /operations/push/subscriptions': { body: { subscribed: true } },
    });
  });
  afterEach(() => {
    resetTestState();
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  });
  it('appears in the header across pages and remembers dismissal while preserving inbox controls', async () => {
    const view = renderApp('/account');
    const banner = await screen.findByRole('alert', {
      name: 'Aviso de notificações',
    });
    expect(banner.closest('header')).not.toBeNull();
    expect(
      within(banner).getByText(/importantes para acompanhar as novidades/),
    ).toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: 'Notificações' }));
    await screen.findByRole('heading', { name: 'Minhas notificações' });
    expect(
      screen.getByRole('alert', { name: 'Aviso de notificações' }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Dispensar aviso de notificações' }),
    );
    expect(
      screen.queryByRole('alert', { name: 'Aviso de notificações' }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem('ponte:push-banner:v1:user-1')).toBe(
      'dismissed',
    );
    expect(
      screen.getByRole('button', {
        name: 'Ativar notificações neste dispositivo',
      }),
    ).toBeInTheDocument();
    view.unmount();
    // Recreate routes without clearing the stored dismissal.
    mockApi({
      ...sessionRoutes(makeUser([])),
      'GET /operations/push/config': {
        body: { enabled: true, publicKey: 'AQID' },
      },
    });
    renderApp('/account');
    await screen.findByRole('heading', { name: 'Minha conta' });
    expect(
      screen.queryByRole('alert', { name: 'Aviso de notificações' }),
    ).not.toBeInTheDocument();
  });
  it('activates from the header only after a click and then hides the banner', async () => {
    renderApp('/account');
    const banner = await screen.findByRole('alert', {
      name: 'Aviso de notificações',
    });
    fireEvent.click(
      within(banner).getByRole('button', { name: 'Ativar notificações' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('alert', { name: 'Aviso de notificações' }),
      ).not.toBeInTheDocument(),
    );
    expect(requestPermission).toHaveBeenCalledOnce();
  });
  it('links blocked users to instructions without requesting permission again', async () => {
    permission = 'denied';
    renderApp('/account');
    const banner = await screen.findByRole('alert', {
      name: 'Aviso de notificações',
    });
    expect(
      within(banner).getByRole('link', { name: 'Como ativar' }),
    ).toHaveAttribute('href', '/inbox');
    fireEvent.click(
      within(banner).getByRole('button', {
        name: 'Dispensar aviso de notificações',
      }),
    );
    expect(requestPermission).not.toHaveBeenCalled();
  });
});
