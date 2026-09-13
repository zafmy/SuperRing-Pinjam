self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
// No fetch handler: session responses, tokens and photos are never cached offline.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const raw = typeof data.url === 'string' ? data.url : '/';
  const url = new URL(raw, self.location.origin);
  const safeUrl = url.origin === self.location.origin ? url.href : self.location.origin;
  event.waitUntil(self.registration.showNotification(data.title || 'PINJAM', {
    body: data.body || 'Ada kemas kini pada sesi anda.', tag: data.tag || 'pinjam',
    icon: '/icon-192.png', badge: '/icon-192.png', data: { url: safeUrl },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.location.origin;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url === url);
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  })());
});
