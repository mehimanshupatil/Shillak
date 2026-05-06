/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA navigation fallback
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  }),
)

// Web Share Target — POST with image file
// SW cannot touch Dexie (no CryptoKey in scope), so we use Cache API as hand-off
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'POST' || url.pathname !== '/share-target') return

  event.respondWith(
    (async () => {
      const formData = await event.request.formData()
      const image = formData.get('image') as File | null
      if (image) {
        const cache = await caches.open('shillak-share-v1')
        await cache.put(
          '/pending-share',
          new Response(image, {
            headers: {
              'Content-Type': image.type,
              'Content-Length': String(image.size),
            },
          }),
        )
      }
      return Response.redirect('/share-target?ready=1', 303)
    })(),
  )
})
