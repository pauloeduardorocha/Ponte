/* global self, URL */
self.addEventListener('push', (event) => {
  // Never render arbitrary data or navigate to a URL supplied by a push sender.
  let tag = 'ponte-message';
  try {
    const payload = event.data?.json();
    if (typeof payload?.tag === 'string') tag = payload.tag;
  } catch {
    /* Still show a useful notification for an empty/invalid payload. */
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification('A Ponte', {
        body: 'Você tem uma nova mensagem. Abra a caixa de notificações.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag,
        data: { url: '/inbox' },
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
      const inbox = new URL('/inbox', self.location.origin).href;
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
