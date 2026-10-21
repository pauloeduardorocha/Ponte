import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disablePush, enablePush, stopBrowserPush } from './push';
import { apiRequest } from './api';

vi.mock('./api', () => ({ apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const unsubscribe = vi.fn().mockResolvedValue(true);
const subscription = {
  endpoint: 'https://fcm.googleapis.com/test',
  options: {},
  toJSON: () => ({
    endpoint: 'https://fcm.googleapis.com/test',
    expirationTime: null,
    keys: { p256dh: 'public-key', auth: 'secret' },
  }),
  unsubscribe,
};
const subscribe = vi.fn().mockResolvedValue(subscription);
const getSubscription = vi.fn().mockResolvedValue(null);
const getRegistration = vi
  .fn()
  .mockResolvedValue({
    active: {},
    pushManager: { subscribe, getSubscription },
  });
const permission = vi.fn().mockResolvedValue('granted');

beforeEach(() => {
  vi.clearAllMocks();
  request.mockResolvedValue({ subscribed: true });
  getSubscription.mockResolvedValue(null);
  permission.mockResolvedValue('granted');
  vi.stubGlobal('Notification', { requestPermission: permission });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration },
  });
});
afterEach(() => {
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  vi.unstubAllGlobals();
});

describe('Browser push opt-in', () => {
  it('asks permission only when enabled and sends the exact API payload without expirationTime', async () => {
    expect(permission).not.toHaveBeenCalled();
    await enablePush('AQID');
    expect(permission).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3]),
    });
    expect(request).toHaveBeenCalledWith('/operations/push/subscriptions', {
      method: 'POST',
      body: {
        endpoint: subscription.endpoint,
        keys: { p256dh: 'public-key', auth: 'secret' },
      },
    });
  });
  it('does not subscribe when permission is denied', async () => {
    permission.mockResolvedValue('denied');
    await expect(enablePush('AQID')).rejects.toThrow('Permita notificações');
    expect(subscribe).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
  it('undoes a new browser subscription if persistence fails', async () => {
    request.mockRejectedValueOnce(new Error('network failed'));
    await expect(enablePush('AQID')).rejects.toThrow('network failed');
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('removes the authenticated server subscription before disabling the browser', async () => {
    getSubscription.mockResolvedValue(subscription);
    await disablePush();
    expect(request).toHaveBeenCalledWith('/operations/push/subscriptions', {
      method: 'DELETE',
      body: { endpoint: subscription.endpoint },
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it('can revoke browser delivery during session expiry without authenticated requests', async () => {
    getSubscription.mockResolvedValue(subscription);
    await stopBrowserPush();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });
});
