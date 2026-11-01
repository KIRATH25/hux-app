/* HUX web app (the iPhone version): service worker.
 * scripts/build-web.mjs fills in VERSION, BASE and SHELL on every build, so each deploy is a new worker and phones
 * pick up the update by themselves.
 *  - stores only the app's own files (the page, the script, fonts, icons) so HUX opens fast and shows up offline;
 *  - NEVER stores Supabase (data, sign-in, photos, ID images, payment screenshots) or anything from another site:
 *    those requests are not touched at all and always go to the network;
 *  - shows the notifications Apple delivers (web push) and opens the right screen when one is tapped.
 */
const VERSION = 'c879733c339e';
const BASE = '/hux-app';
const SHELL = ["/hux-app/index.html","/hux-app/_expo/static/js/web/entry-cd2da26348f2e53dc90065a4c6f9c85d.js","/hux-app/manifest.webmanifest","/hux-app/pwa.js","/hux-app/pwa/icon-192.png","/hux-app/pwa/icon-512.png","/hux-app/pwa/apple-touch-icon.png","/hux-app/pwa/badge-96.png"];
const CACHE = 'hux-' + VERSION;
const INDEX = BASE + '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('hux-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Supabase, other sites, anything outside the app: not touched, never stored
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE + '/')) return;

  if (request.mode === 'navigate') {
    // the newest page when online (a deep link such as /booking/<id> gets the app too); the stored one when offline
    event.respondWith(fetch(request).catch(() => caches.match(INDEX)));
    return;
  }
  // the app's own files carry a fingerprint in their name, so a stored copy is always the right one
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && (url.pathname.startsWith(BASE + '/_expo/') || url.pathname.startsWith(BASE + '/assets/'))) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});

// ------------------------------------------------------------------ notifications (web push)

// The screens a notification may open: the same list as safeAppPath() in src/services/pwaEnv.ts.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SAFE_PATHS = [
  /^\/$/,
  /^\/activity$/,
  /^\/notifications$/,
  /^\/premium$/,
  new RegExp('^/chat/' + UUID + '$', 'i'),
  new RegExp('^/booking/' + UUID + '$', 'i'),
  new RegExp('^/admin(\\?focus=' + UUID + '(&submission=[1-9][0-9]{0,2})?)?$', 'i'),
];
const safePath = (p) => (typeof p === 'string' && p.length < 200 && SAFE_PATHS.some((re) => re.test(p)) ? p : '/notifications');

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 80) : 'HUX';
  const options = {
    body: typeof data.body === 'string' ? data.body.slice(0, 200) : 'Open HUX to see what happened.',
    icon: BASE + '/pwa/icon-192.png',
    badge: BASE + '/pwa/badge-96.png',
    data: { path: safePath(data.path) },
  };
  if (typeof data.tag === 'string' && data.tag.length < 120) options.tag = data.tag;
  // iPhones require every push to show a notification, so one is always shown
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.path);
  const target = new URL(BASE + path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).pathname.startsWith(BASE + '/'));
      if (open) {
        // HUX is already open: it moves to the screen itself (app/_layout.tsx)
        open.postMessage({ type: 'hux-open', path });
        return open.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
