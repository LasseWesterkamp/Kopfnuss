// Push-Teil des Service Workers (wird per importScripts in den von vite-plugin-pwa erzeugten sw.js geladen).
// Offline-Cache und Updates bleiben davon unberührt.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  const scope = self.registration.scope;
  event.waitUntil(self.registration.showNotification(d.title || 'Kopfnuss', {
    body: d.body || '',
    icon: scope + 'icons/icon-192.png',
    badge: scope + 'icons/icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '#/' },
  }));
});

// Antippen: offenes Kopfnuss-Fenster nach vorne holen und dorthin wechseln, sonst neu öffnen
async function kopfnussOpen(hash) {
  const scope = self.registration.scope;
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const w = wins.find((c) => c.url.startsWith(scope));
  if (w) {
    await w.focus().catch(() => {});
    w.postMessage({ type: 'kopfnuss-open', hash });
    return 'fenster';
  }
  await self.clients.openWindow(scope + hash);
  return 'neu';
}
self.__kopfnussOpen = kopfnussOpen; // für den automatischen Test

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(kopfnussOpen((event.notification.data && event.notification.data.url) || '#/'));
});
