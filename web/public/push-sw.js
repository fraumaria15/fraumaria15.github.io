/* Push handlers, imported into the generated service worker (vite.config.ts -> workbox.importScripts) */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const appInFront = windows.some((c) => c.visibilityState === 'visible' && c.focused)
      // iOS may revoke push permission if a push shows nothing, so always show there
      const isIOS = /iPhone|iPad|iPod/.test(self.navigator.userAgent)
      if (appInFront && !isIOS) return

      await self.registration.showNotification(data.title || 'chatme', {
        body: data.body || 'Новое сообщение',
        icon: '/pwa-192x192.png',
        badge: '/pwa-64x64.png',
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { chatId: data.chatId },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const chatId = event.notification.data && event.notification.data.chatId
  const url = chatId ? `/?chat=${encodeURIComponent(chatId)}` : '/'

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus()
          if (chatId) client.postMessage({ type: 'open-chat', chatId })
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
