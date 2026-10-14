const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createCatalogCache } = require('../src/catalog/catalog-cache.ts')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test('tab visits reuse independent catalogs, including empty results', async () => {
  const calls = []
  const cache = createCatalogCache(async (kind) => {
    calls.push(kind)
    return kind === 'templates' ? [] : [{ id: kind, kind }]
  })
  for (const kind of ['experts', 'applications', 'templates', 'experts', 'templates', 'applications'])
    await cache.load(kind)
  assert.deepEqual(calls, ['experts', 'applications', 'templates'])
  assert.equal(cache.getSnapshot('experts').items[0].id, 'experts')
  assert.equal(cache.getSnapshot('applications').items[0].id, 'applications')
  assert.deepEqual(cache.getSnapshot('templates'), { items: [], loading: false, error: '' })
  assert.equal(cache.getSnapshot('plugins').loading, false)
})

test('rapid switching reuses pending loads and keeps late responses in their own tabs', async () => {
  const requests = { experts: deferred(), applications: deferred() }
  const calls = []
  const cache = createCatalogCache((kind) => {
    calls.push(kind)
    return requests[kind].promise
  })
  const experts = cache.load('experts')
  const apps = cache.load('applications')
  await cache.load('experts')
  await cache.load('applications')
  assert.deepEqual(calls, ['experts', 'applications'])
  requests.applications.resolve([{ id: 'app', kind: 'applications' }])
  await apps
  assert.equal(cache.getSnapshot('experts').loading, true)
  requests.experts.resolve([{ id: 'expert', kind: 'experts' }])
  await experts
  assert.equal(cache.getSnapshot('applications').items[0].id, 'app')
  assert.equal(cache.getSnapshot('experts').items[0].id, 'expert')
})

test('explicit refresh supersedes stale loads; failures retain data until another explicit retry', async () => {
  const old = deferred()
  let call = 0
  const cache = createCatalogCache(() => {
    call++
    if (call === 1) return old.promise
    if (call === 3) return Promise.reject(new Error('temporary failure'))
    return Promise.resolve([{ id: `version-${call}`, kind: 'experts' }])
  })
  const pending = cache.load('experts')
  await cache.load('experts', true)
  old.resolve([{ id: 'stale', kind: 'experts' }])
  await pending
  assert.equal(cache.getSnapshot('experts').items[0].id, 'version-2')
  await cache.load('experts', true)
  assert.equal(cache.getSnapshot('experts').items[0].id, 'version-2')
  assert.equal(cache.getSnapshot('experts').error, 'temporary failure')
  await cache.load('experts')
  assert.equal(call, 3)
  await cache.load('experts', true)
  assert.equal(cache.getSnapshot('experts').items[0].id, 'version-4')
  assert.equal(cache.getSnapshot('experts').error, '')
})

test('access updates and installation invalidation prevent old requests from restoring stale status', async () => {
  const old = deferred()
  const accessRefresh = deferred()
  let calls = 0
  const cache = createCatalogCache(() => {
    calls++
    return calls === 2
      ? accessRefresh.promise
      : Promise.resolve([{ id: 'expert', kind: 'experts', access: 'not_requested' }])
  })
  await cache.load('experts')
  const staleCache = createCatalogCache(() => old.promise)
  const pending = staleCache.load('experts')
  staleCache.invalidate('experts')
  old.resolve([{ id: 'stale', kind: 'experts' }])
  await pending
  assert.deepEqual(staleCache.getSnapshot('experts').items, [])
  assert.equal(staleCache.getSnapshot('experts').loading, true)
  const refresh = cache.load('experts', true)
  cache.update({ id: 'expert', kind: 'experts', access: 'requested' })
  accessRefresh.resolve([{ id: 'expert', kind: 'experts', access: 'not_requested' }])
  await refresh
  await cache.load('experts')
  assert.equal(cache.getSnapshot('experts').items[0].access, 'requested')
  cache.invalidate('experts')
  await cache.load('experts')
  assert.equal(cache.getSnapshot('experts').items[0].access, 'not_requested')
})

test('a new dialog has a fresh cache and unsubscribed dialogs receive no further notifications', async () => {
  let calls = 0
  let notifications = 0
  const load = async () => {
    calls++
    return []
  }
  const cache = createCatalogCache(load)
  const unsubscribe = cache.subscribe(() => notifications++)
  await cache.load('experts')
  assert.equal(notifications, 2)
  unsubscribe()
  await cache.load('experts', true)
  assert.equal(notifications, 2)
  const nextDialog = createCatalogCache(load)
  await nextDialog.load('experts')
  assert.equal(calls, 3)
})

test('template first page is visible while later pages are pending; refresh discards stale pagination', async () => {
  const second = deferred()
  let generation = 0
  const cache = createCatalogCache(
    async () => [],
    async (offset) => {
      if (offset === 0) return { items: [{ id: `first-${generation}`, kind: 'templates' }], nextOffset: 48 }
      if (!generation) return second.promise
      return { items: [{ id: 'new-last', kind: 'templates' }], nextOffset: null }
    }
  )
  const loading = cache.load('templates')
  await new Promise(setImmediate)
  assert.equal(cache.getSnapshot('templates').loading, false)
  assert.equal(cache.getSnapshot('templates').items[0].id, 'first-0')
  generation++
  await cache.load('templates', true)
  second.resolve({ items: [{ id: 'stale' }], nextOffset: null })
  await loading
  assert.deepEqual(
    cache.getSnapshot('templates').items.map((x) => x.id),
    ['first-1', 'new-last']
  )
})

test('a later page failure retains the first usable page and exposes retry error', async () => {
  const cache = createCatalogCache(
    async () => [],
    async (offset) => {
      if (offset) throw new Error('page failed')
      return { items: [{ id: 'first', kind: 'templates' }], nextOffset: 48 }
    }
  )
  await cache.load('templates')
  assert.equal(cache.getSnapshot('templates').items.length, 1)
  assert.equal(cache.getSnapshot('templates').error, 'page failed')
})
