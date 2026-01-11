const CACHE_NAME = '0xcontrol-static-v3'
const API_CACHE = '0xcontrol-api-v1'
const ACTIVE_CACHES = new Set([CACHE_NAME, API_CACHE])
const API_PATHS = new Set(['/api/catalog', '/api/playlists'])
const CORE_ASSETS = [
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => !ACTIVE_CACHES.has(key)).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(request.url)
  if (requestUrl.origin !== self.location.origin) {
    return
  }

  if (API_PATHS.has(requestUrl.pathname)) {
    event.respondWith(staleWhileRevalidate(event, request, API_CACHE))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(async (cached) => {
        if (cached && cached.ok && !cached.redirected) {
          return cached
        }

        try {
          const response = await fetch('/index.html', { cache: 'reload', redirect: 'follow' })
          const finalResponse = response.redirected
            ? await fetch(response.url, { cache: 'reload' })
            : response

          if (finalResponse && finalResponse.status === 200 && !finalResponse.redirected) {
            const responseClone = finalResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseClone))
          }

          return finalResponse
        } catch (error) {
          return caches.match('/index.html')
        }
      }),
    )
    return
  }

  const cacheableDestinations = new Set(['style', 'script', 'image', 'font'])
  if (!cacheableDestinations.has(request.destination)) {
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached
      }

      return fetch(request).then((response) => {
        if (response && response.status === 200) {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone))
        }
        return response
      })
    }),
  )
})

async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)

  if (cached) {
    event.waitUntil(networkPromise)
    return cached
  }

  const networkResponse = await networkPromise
  if (networkResponse) return networkResponse
  throw new Error('Network error and no cache for request')
}
