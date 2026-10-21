import { apiRequest } from './api';

export function supportsPush() {
  return (
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}
export async function browserSubscription() {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.pushManager
    ? registration.pushManager.getSubscription()
    : null;
}
export async function enablePush(publicKey: string) {
  // Call before awaiting other work: browsers require a direct user gesture.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(
      'Permita notificações nas definições deste navegador para receber alertas.',
    );
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active)
    throw new Error(
      'Atualize a aplicação e tente novamente para ativar as notificações.',
    );
  const bytes = Uint8Array.from(
    atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0),
  );
  let subscription = await registration.pushManager.getSubscription();
  const existingKey = subscription?.options.applicationServerKey;
  if (
    subscription &&
    existingKey &&
    Array.from(new Uint8Array(existingKey)).join() !== Array.from(bytes).join()
  ) {
    await disablePush();
    subscription = null;
  }
  const created = !subscription;
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes,
  });
  try {
    await apiRequest('/operations/push/subscriptions', {
      method: 'POST',
      body: {
        endpoint: subscription.endpoint,
        keys: subscription.toJSON().keys,
      },
    });
  } catch (error) {
    if (created) await subscription.unsubscribe();
    throw error;
  }
}
export async function disablePush() {
  const subscription = await browserSubscription();
  if (!subscription) return;
  // Remove the server record first, so a failed request leaves a retryable subscription.
  await apiRequest('/operations/push/subscriptions', {
    method: 'DELETE',
    body: { endpoint: subscription.endpoint },
  });
  if (!(await subscription.unsubscribe()))
    throw new Error(
      'Não foi possível desativar as notificações. Tente novamente.',
    );
}
export async function stopBrowserPush() {
  const subscription = await browserSubscription();
  await subscription?.unsubscribe();
}
