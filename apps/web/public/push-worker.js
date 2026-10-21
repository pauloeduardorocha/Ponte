/* global self, URL */
self.addEventListener('push', (event) => {
  // Text is displayed by the Notifications API; navigation stays same-origin.
  let tag = 'ponte-message';
  let title = 'A Ponte';
  let body = 'Você tem uma nova mensagem. Abra a caixa de notificações.';
  try {
    const payload = event.data?.json();
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
        body,
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
