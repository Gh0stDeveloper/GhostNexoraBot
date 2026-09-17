const STATIC_CACHE = 'ghost-nexora-static-v1'
const STATIC_ASSETS = ['/pwa-icon.svg', '/pwa-icon-maskable.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Authenticated dashboards and every API remain network-only. Never persist
  // panel HTML, cookies, control responses, JIDs or backup downloads in Cache API.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/subbot') ||
    url.pathname.startsWith('/login')
  ) {
    event.respondWith(fetch(request, { cache: 'no-store' }))
    return
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)))
  }
})
