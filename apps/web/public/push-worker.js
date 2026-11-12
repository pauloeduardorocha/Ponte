/* global self, URL, caches */
async function defaultNotificationBody() {
  let locale = 'pt-PT';
  try {
    const cache = await caches.open('ponte-preferences-v1');
    const preference = await cache.match('/__ponte_locale__');
    locale = (await preference?.text()) ?? locale;
  } catch {
    /* Use Portugal's Portuguese when browser storage is unavailable. */
  }
  return (
    {
      'pt-PT': 'Tem uma nova mensagem. Abra a caixa de notificações.',
      'pt-BR': 'Você tem uma nova mensagem. Abra a caixa de notificações.',
      en: 'You have a new message. Open your notifications inbox.',
    }[locale] ?? 'Tem uma nova mensagem. Abra a caixa de notificações.'
  );
}
function notificationUrl(value) {
  try {
    if (typeof value !== 'string') return '/inbox';
    const url = new URL(value, self.location.origin);
    if (
      url.origin === self.location.origin &&
      ['/', '/inbox', '/finance', '/my-events'].includes(url.pathname)
    )
      return url.pathname + url.search;
  } catch {
    /* Invalid destinations use the inbox. */
  }
  return '/inbox';
}
self.addEventListener('push', (event) => {
  // Text is displayed by the Notifications API; navigation stays same-origin.
  let tag = 'ponte-message';
  let title = 'A Ponte';
  let url = '/inbox';
  let body;
  try {
    const payload = event.data?.json();
    url = notificationUrl(payload?.url);
    if (typeof payload?.tag === 'string') tag = payload.tag;
    if (typeof payload?.title === 'string' && payload.title.trim())
      title = payload.title;
    if (typeof payload?.body === 'string' && payload.body.trim())
      body = payload.body;
  } catch {
    /* Still show a useful notification for an empty/invalid payload. */
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: body ?? (await defaultNotificationBody()),
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag,
        data: { url },
      });
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients)
        client.postMessage({ type: 'PONTE_NOTIFICATION' });
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const inbox = new URL(
        notificationUrl(event.notification.data?.url),
        self.location.origin,
      ).href;
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate(inbox);
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(inbox);
    })(),
  );
});
