const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { UserNotifications, installUserNotifications } = require('../electron/user-notifications.cjs')
const { DesktopService } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const id = 'a1111111-1111-4111-8111-111111111111'
const snapshot = (version = '1') => ({
  supported: true,
  version,
  announcements: [{ id }],
  notifications: [],
  hasMoreAnnouncements: false,
  hasMoreNotifications: false
})
function fixture(t, saved) {
  const service = {
    config: { apiUrl: 'https://api.example.test' },
    credentials: { token: 'secret' },
    profile: { user: { id: 'user-a', tenantId: 'tenant-a' }, organizationId: 'org' },
    generation: 1,
    request: t.mock.fn(async (path) => (path.endsWith('/dismissal') ? {} : snapshot())),
    persist: t.mock.fn(),
    assistantActivity: { invalidate: t.mock.fn() }
  }
  const notifications = new UserNotifications(service, saved)
  t.after(() => notifications.stop())
  notifications.sync()
  return { service, notifications }
}
test('offline dismissal is persisted, suppresses stale snapshots and retries idempotently', async (t) => {
  const { service, notifications } = fixture(t)
  await notifications.refresh()
  notifications.dismiss(id)
  const key = notifications.accountKey
  assert.deepEqual(notifications.dismissals[key], [id])
  assert.equal(notifications.snapshot.announcements.length, 0)
  service.request.mock.mockImplementation(async (path) => {
    if (path.endsWith('/dismissal')) throw Object.assign(new Error('offline'), { status: 503 })
    return snapshot()
  })
  await notifications.refresh()
  assert.equal(notifications.snapshot.announcements.length, 0)
  const restarted = fixture(t, notifications.dismissals)
  restarted.service.request.mock.mockImplementation(async (path) =>
    path.endsWith('/dismissal') ? {} : { ...snapshot('2'), announcements: [] }
  )
  await restarted.notifications.refresh()
  assert.deepEqual(restarted.notifications.dismissals[key], [])
  assert.equal(restarted.notifications.snapshot.announcements.length, 0)
})
test('late old-account responses and pending dismissals cannot enter the new account', async (t) => {
  const { service, notifications } = fixture(t)
  let resolve
  service.request.mock.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      })
  )
  const old = notifications.refresh()
  notifications.dismiss(id)
  service.profile = { ...service.profile, user: { id: 'user-b', tenantId: 'tenant-b' } }
  service.generation++
  notifications.sync()
  resolve(snapshot('old'))
  await old
  assert.equal(notifications.snapshot, null)
  service.request.mock.mockImplementation(async () => snapshot('new'))
  await notifications.refresh()
  assert.equal(notifications.snapshot.version, 'new')
  assert.equal(notifications.snapshot.announcements.length, 1)
  assert.equal(service.request.mock.calls.filter((call) => call.arguments[0].endsWith('/dismissal')).length, 0)
})
test('old servers disable the new path without changing existing activity; 403 is not treated as old', async (t) => {
  const { service, notifications } = fixture(t)
  service.request.mock.mockImplementation(async () => {
    throw Object.assign(new Error('old'), { status: 404 })
  })
  assert.equal(await notifications.refresh(), null)
  assert.equal(notifications.unsupported, true)
  service.generation++
  notifications.sync()
  service.request.mock.mockImplementation(async () => {
    throw Object.assign(new Error('denied'), { status: 403 })
  })
  await assert.rejects(notifications.refresh())
  assert.equal(notifications.unsupported, false)
  assert.equal(service.assistantActivity.invalidate.mock.callCount(), 0)
})
test('the main-process connection stays alive without a window and closes on quit', async (t) => {
  const { service, notifications } = fixture(t)
  let streamController
  service.request.mock.mockImplementation(async (path) => {
    if (path.endsWith('/stream'))
      return new Response(
        new ReadableStream({
          start(controller) {
            streamController = controller
          },
          cancel() {}
        }),
        { headers: { 'Content-Type': 'text/event-stream' } }
      )
    return snapshot()
  })
  const app = new EventEmitter()
  installUserNotifications({ app, notifications, getWindow: () => undefined })
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(streamController)
  streamController.enqueue(
    new TextEncoder().encode(
      'event: change\ndata: {"schemaVersion":1,"type":"sync.required","eventId":"' + id + '"}\n\n'
    )
  )
  await new Promise((resolve) => setTimeout(resolve, 650))
  assert.equal(notifications.snapshot.version, '1')
  assert.equal(service.assistantActivity.invalidate.mock.callCount(), 1)
  app.emit('will-quit')
  assert.equal(notifications.started, false)
  assert.equal(notifications.controller.signal.aborted, true)
  streamController.close()
})
test('the host allowlist validates identifiers and never exposes an arbitrary notification request', async () => {
  const service = new DesktopService({ storage: { read: () => null, write: () => {} } })
  assert.equal((await dispatch(service, 'notificationDismiss', '../another-user')).status, 400)
  assert.equal((await dispatch(service, 'notificationHistory', -1)).status, 400)
  assert.equal((await dispatch(service, 'notificationRequest', '/admin')).status, 403)
})
test('disk storage retains dismissal retries after a real service restart', async (t) => {
  const fs = require('node:fs')
  const directory = fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'notification-storage-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const storage = require('../electron/storage.cjs').createStorage(directory, { isEncryptionAvailable: () => false })
  const key = JSON.stringify(['https://api.example.test', 'tenant', 'user'])
  storage.write({ config: {}, credentials: null, sidebars: {}, notificationDismissals: { [key]: [id] } })
  assert.deepEqual(storage.read().notificationDismissals, { [key]: [id] })
})
