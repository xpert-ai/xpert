// The main process owns credentials, the single live stream and durable dismissal retries.
// Stream messages only invalidate snapshots; missed/duplicate messages never change read counts.
const { EventEmitter } = require('node:events')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
class UserNotifications extends EventEmitter {
  constructor(service, saved = {}) {
    super()
    this.service = service
    this.dismissals = Object.fromEntries(
      Object.entries(saved && typeof saved === 'object' ? saved : {})
        .filter(([key, ids]) => key.length < 4096 && Array.isArray(ids))
        .map(([key, ids]) => [key, ids.filter((id) => typeof id === 'string' && UUID.test(id))])
    )
    this.snapshot = null
    this.revision = 0
    this.attempts = 0
    this.started = false
  }
  account() {
    const { config, credentials, profile } = this.service
    return credentials && profile?.user?.id && profile.user.tenantId
      ? JSON.stringify([config.apiUrl, profile.user.tenantId, profile.user.id])
      : null
  }
  sync() {
    const account = this.account()
    const scope = account && JSON.stringify([account, this.service.profile.organizationId, this.service.generation])
    if (scope === this.scope) return
    this.scope = scope
    this.accountKey = account
    this.revision++
    this.controller?.abort()
    clearTimeout(this.retryTimer)
    clearTimeout(this.refreshTimer)
    this.refreshTimer = null
    this.pending = null
    this.snapshot = null
    this.unsupported = false
    this.attempts = 0
    this.emit('change')
    if (scope && this.started) {
      void this.connect(this.revision)
      this.schedule()
    }
  }
  start() {
    if (this.started) return
    this.started = true
    this.scope = undefined
    this.sync()
    this.timer = setInterval(() => this.schedule(), 90000)
    this.timer.unref?.()
  }
  stop() {
    this.started = false
    this.revision++
    this.controller?.abort()
    clearInterval(this.timer)
    clearTimeout(this.retryTimer)
    clearTimeout(this.refreshTimer)
    this.refreshTimer = null
    this.scope = undefined
    this.snapshot = null
  }
  async connect(revision) {
    if (!this.started || !this.scope || this.unsupported || revision !== this.revision) return
    const controller = new AbortController()
    this.controller = controller
    try {
      const response = await this.service.request('/api/user-notifications/stream', {
        responseType: 'response',
        timeout: 70000,
        signal: controller.signal,
        accept: 'text/event-stream'
      })
      if (!response.headers.get('content-type')?.includes('text/event-stream'))
        throw new Error('Invalid notification stream')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        while (revision === this.revision) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '')
          if (buffer.length > 65536) throw new Error('Notification frame too large')
          let boundary
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const data = frame
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('\n')
            try {
              const event = JSON.parse(data)
              if (event?.schemaVersion === 1 && event.type === 'sync.required' && UUID.test(event.eventId)) {
                this.attempts = 0
                this.schedule()
              }
            } catch {
              /* Ignore unsupported hints; the snapshot remains authoritative. */
            }
          }
        }
      } finally {
        await reader.cancel().catch(() => undefined)
      }
    } catch (error) {
      if (revision === this.revision && error.status === 404) this.unsupported = true
    } finally {
      if (this.started && revision === this.revision && !this.unsupported) {
        this.retryTimer = setTimeout(
          () => void this.connect(revision),
          Math.min(30000, 1000 * 2 ** Math.min(this.attempts++, 5)) + Math.random() * 500
        )
        this.retryTimer.unref?.()
      }
    }
  }
  schedule() {
    if (this.refreshTimer || !this.scope || this.unsupported) return
    this.refreshTimer = setTimeout(
      () => {
        this.refreshTimer = null
        void this.refresh().catch(() => undefined)
      },
      250 + Math.random() * 250
    )
    this.refreshTimer.unref?.()
  }
  async refresh() {
    this.sync()
    if (!this.scope || this.unsupported) return null
    if (this.pending) {
      this.dirty = true
      return this.pending
    }
    const revision = this.revision,
      account = this.accountKey
    const pending = (async () => {
      for (const id of [...(this.dismissals[account] || [])]) {
        try {
          await this.service.request(`/api/announcements/${id}/dismissal`, { method: 'PUT', body: {} })
        } catch (error) {
          if (error.status !== 404) continue
        }
        if (revision !== this.revision) return null
        this.dismissals[account] = (this.dismissals[account] || []).filter((value) => value !== id)
        this.service.persist()
      }
      const snapshot = await this.service.request('/api/user-notifications/sync?client=desktop')
      if (revision !== this.revision) return null
      if (
        !snapshot ||
        snapshot.supported !== true ||
        !Array.isArray(snapshot.announcements) ||
        !Array.isArray(snapshot.notifications)
      )
        throw new Error('Invalid notification snapshot')
      snapshot.announcements = snapshot.announcements.filter(
        (item) => !(this.dismissals[account] || []).includes(item.id)
      )
      const changed = !this.snapshot || snapshot.version !== this.snapshot.version
      this.snapshot = snapshot
      if (changed) {
        this.emit('change')
        this.service.assistantActivity?.invalidate()
      }
      return snapshot
    })()
      .catch((error) => {
        if (revision === this.revision && [401, 403].includes(error.status)) {
          this.snapshot = null
          this.emit('change')
        }
        if (revision === this.revision && error.status === 404) {
          this.unsupported = true
          this.controller?.abort()
          this.snapshot = null
          this.emit('change')
          return null
        }
        throw error
      })
      .finally(() => {
        if (this.pending === pending) {
          this.pending = null
          if (this.dirty) {
            this.dirty = false
            this.schedule()
          }
        }
      })
    this.pending = pending
    return pending
  }
  readSnapshot() {
    this.sync()
    if (!this.snapshot) this.schedule()
    return this.snapshot
  }
  dismiss(id) {
    this.sync()
    if (!this.accountKey || typeof id !== 'string' || !UUID.test(id)) throw new Error('Invalid notification dismissal')
    this.dismissals[this.accountKey] = [...new Set([...(this.dismissals[this.accountKey] || []), id])]
    this.service.persist()
    if (this.snapshot)
      this.snapshot = { ...this.snapshot, announcements: this.snapshot.announcements.filter((item) => item.id !== id) }
    this.emit('change')
    this.schedule()
    return { dismissed: true }
  }
}
function createNotificationMethods(ClientError) {
  const id = (value) => {
    if (typeof value !== 'string' || !UUID.test(value)) throw new ClientError('Invalid input.')
    return value
  }
  const offset = (value = 0) => {
    if (!Number.isInteger(value) || value < 0 || value > 100000) throw new ClientError('Invalid input.')
    return value
  }
  return {
    notificationSnapshot() {
      this.userNotifications.start()
      return this.userNotifications.readSnapshot()
    },
    notificationRefresh() {
      return this.userNotifications.refresh()
    },
    notificationDismiss(value) {
      return this.userNotifications.dismiss(id(value))
    },
    notificationAnnouncement(value) {
      return this.request(`/api/announcements/${id(value)}?client=desktop`)
    },
    notificationHistory(value) {
      return this.request(`/api/announcements/history?client=desktop&offset=${offset(value)}`)
    },
    notificationList(value) {
      return this.request(`/api/user-notifications?offset=${offset(value)}`)
    },
    async notificationRead(value) {
      const result = await this.request(`/api/user-notifications/${id(value)}/read`, { method: 'PUT', body: {} })
      this.userNotifications.schedule()
      return result
    }
  }
}
function installUserNotifications({ app, notifications, getWindow }) {
  const changed = () => {
    const window = getWindow()
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send('xpert:notifications-changed')
  }
  notifications.on('change', changed)
  app.once('will-quit', () => {
    notifications.stop()
    notifications.removeListener('change', changed)
  })
  notifications.start()
}
module.exports = { UserNotifications, createNotificationMethods, installUserNotifications }
