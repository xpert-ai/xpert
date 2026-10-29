// Kept at the original Angular worker URL so already-controlled tabs can retire
// it. Only Angular caches for this exact registration scope belong to this worker.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const prefix = `ngsw:${new URL(self.registration.scope).pathname}:`
      for (const name of await caches.keys()) {
        if (name.startsWith(prefix)) await caches.delete(name)
      }
      await self.registration.unregister()
    })()
  )
})
