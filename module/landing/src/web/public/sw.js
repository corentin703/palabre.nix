// Service worker of the landing page. It is deliberately small:
//  - the built files (/visio-assets/app/, hashed names) are cached on first use;
//  - the pages and the configuration are fetched from the network first, and fall back to the
//    cache when offline, so an installed app opens its shell without a connection;
//  - everything else (the PlugNMeet client, the API calls, /admin, the join request) is left
//    to the browser: this worker never answers for it.
// Its scope is the whole site, because the home page is the root of the domain.

const CACHE = 'palabre-landing-v1';
const APP_PREFIX = '/visio-assets/app/';
const SHELL = '/';

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

/** Pages of the landing page; the root with `access_token` is the PlugNMeet client. */
function isLandingPage(url) {
  if (url.pathname === '/') return !url.searchParams.has('access_token');
  return url.pathname === '/join' || /^\/r\/[^/]+$/.test(url.pathname);
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) void cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) void cache.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith(APP_PREFIX)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === 'navigate' && isLandingPage(url)) {
    // The same shell serves every page; the moderator key in /r/...?m= must not be stored,
    // hence a single entry, the root.
    event.respondWith(networkFirst(request, SHELL));
  } else if (url.pathname === '/visio-api/config' || url.pathname === '/visio-assets/logo') {
    event.respondWith(networkFirst(request, request));
  }
});
