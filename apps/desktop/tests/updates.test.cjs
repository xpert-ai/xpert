const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { DesktopUpdater, registerUpdateIpc } = require('../electron/updates/controller.cjs')
const { findRelease, metadataName } = require('../electron/updates/release.cjs')

function fixture(t, overrides = {}) {
  const updater = new EventEmitter()
  const calls = []
  updater.setFeedURL = (feed) => calls.push(['feed', feed])
  updater.checkForUpdates = async () => {
    calls.push('check')
    updater.emit('update-available', { version: '0.2.0' })
  }
  updater.downloadUpdate = async () => {
    calls.push('download')
  }
  updater.quitAndInstall = (...args) => calls.push(['install', ...args])
  const controller = new DesktopUpdater({
    updater,
    enabled: true,
    currentVersion: '0.1.0',
    resolveFeed: async () => ({ provider: 'generic' }),
    ...overrides
  })
  t.after(() => controller.dispose())
  return { updater, controller, calls }
}
test('checking, downloading and installing are separate explicit operations with live progress', async (t) => {
  const { updater, controller, calls } = fixture(t)
  const states = []
  controller.on('state', (state) => states.push(state))
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.allowDowngrade, false)
  assert.equal(updater.allowPrerelease, false)
  assert.equal((await controller.install()).status, 'idle')
  await controller.check()
  assert.equal(controller.snapshot().status, 'available')
  assert.equal(calls.includes('download'), false)
  await controller.download()
  updater.emit('download-progress', { percent: 37.8 })
  assert.equal(controller.snapshot().percent, 37.8)
  updater.emit('download-progress', { percent: NaN })
  assert.equal(controller.snapshot().percent, 37.8)
  updater.emit('download-progress', { percent: 120 })
  assert.equal(controller.snapshot().percent, 100)
  updater.emit('update-downloaded', { version: '0.2.0', downloadedFile: '/private/update.zip' })
  updater.emit('download-progress', { percent: 5 })
  assert.equal(controller.snapshot().status, 'downloaded')
  assert.equal(controller.snapshot().percent, 100)
  assert.doesNotMatch(JSON.stringify(states), /private/)
  assert.ok(!calls.some((call) => Array.isArray(call) && call[0] === 'install'))
  await controller.check()
  assert.equal(calls.filter((call) => call === 'check').length, 1)
  await controller.install()
  assert.deepEqual(calls.at(-1), ['install', false, true])
  assert.ok(states.every((state, i) => i === 0 || state.revision > states[i - 1].revision))
})
test('concurrent actions cannot duplicate a check, download or installation; tools drain first', async (t) => {
  let drain
  const { updater, controller, calls } = fixture(t, {
    beforeInstall: () =>
      new Promise((resolve) => {
        drain = resolve
      })
  })
  await Promise.all([controller.check(), controller.check()])
  assert.equal(calls.filter((call) => call === 'check').length, 1)
  await Promise.all([controller.download(), controller.download()])
  assert.equal(calls.filter((call) => call === 'download').length, 1)
  await controller.install()
  assert.equal(controller.snapshot().status, 'downloading')
  updater.emit('update-downloaded', { version: '0.2.0' })
  const pending = controller.install()
  assert.equal(controller.snapshot().status, 'installing')
  await controller.install()
  assert.ok(!calls.some((call) => Array.isArray(call) && call[0] === 'install'))
  drain()
  await pending
  assert.equal(calls.filter((call) => Array.isArray(call) && call[0] === 'install').length, 1)
})
test('network, download and native installation errors are retryable without exposing internals', async (t) => {
  let offline = true,
    installFailure = true
  const { updater, controller, calls } = fixture(t, {
    resolveFeed: async () => {
      if (offline) throw new Error('private URL')
      return {}
    },
    beforeInstall: async () => {
      if (installFailure) throw new Error('tool shutdown failed')
    }
  })
  await controller.check()
  assert.equal(controller.snapshot().operation, 'check')
  offline = false
  await controller.check()
  updater.downloadUpdate = async () => {
    throw new Error('secret signed URL')
  }
  await controller.download()
  assert.equal(controller.snapshot().operation, 'download')
  assert.doesNotMatch(JSON.stringify(controller.snapshot()), /secret|private/)
  updater.downloadUpdate = async () => updater.emit('update-downloaded', { version: '0.2.0' })
  await controller.download()
  await controller.install()
  assert.equal(controller.snapshot().operation, 'install')
  installFailure = false
  await controller.install()
  assert.deepEqual(calls.at(-1), ['install', false, true])
  updater.emit('error', new Error('Native signature verification failed'))
  assert.equal(controller.snapshot().operation, 'install')
})
test('development/unsupported packages remain inert and trusted IPC rejects frames and unknown actions', async (t) => {
  const { controller, calls, updater } = fixture(t, { enabled: false })
  controller.start()
  await controller.check()
  await controller.download()
  await controller.install()
  assert.equal(controller.snapshot().status, 'disabled')
  assert.deepEqual(calls, [])
  assert.equal(updater.listenerCount('error'), 0)
  let handler
  registerUpdateIpc(
    {
      handle: (_channel, value) => {
        handler = value
      }
    },
    controller,
    (event) => event.trusted
  )
  assert.throws(() => handler({ trusted: false }, 'download'), /origin/)
  assert.throws(() => handler({ trusted: true }, 'setFeedURL'), /Unsupported/)
  assert.equal(handler({ trusted: true }, 'state').status, 'disabled')
})
test('checks start after launch, repeat periodically, and stop on disposal', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const { controller } = fixture(t)
  let count = 0
  controller.check = async () => {
    count++
  }
  controller.start()
  controller.start()
  t.mock.timers.tick(14_999)
  assert.equal(count, 0)
  t.mock.timers.tick(1)
  assert.equal(count, 1)
  t.mock.timers.tick(6 * 60 * 60 * 1000)
  assert.equal(count, 2)
  controller.dispose()
  t.mock.timers.tick(6 * 60 * 60 * 1000)
  assert.equal(count, 2)
})
function release(tag, extra = {}) {
  return { tag_name: tag, draft: false, prerelease: false, assets: [{ name: 'desktop-arm64-mac.yml' }], ...extra }
}
test('release discovery paginates, skips platform/candidate/draft/incompatible releases and chooses highest desktop version', async () => {
  const pages = [
    [
      release('v99.0.0'),
      release('desktop-v8.0.0', { draft: true }),
      release('desktop-v7.0.0', { prerelease: true }),
      release('desktop-v6.0.0-candidate.main.abcdef'),
      release('desktop-v5.0.0', { assets: [] }),
      release('desktop-v0.1.0'),
      ...Array.from({ length: 94 }, () => release('v1.0.0'))
    ],
    [release('desktop-v0.3.0'), release('desktop-v0.2.0')]
  ]
  let index = 0
  const feed = await findRelease({
    platform: 'darwin',
    arch: 'arm64',
    fetcher: async (url, options) => {
      assert.ok(url.endsWith(`page=${index + 1}`))
      assert.equal(options.headers.Authorization, undefined)
      return Response.json(pages[index++])
    }
  })
  assert.equal(index, 2)
  assert.equal(feed.url, 'https://github.com/xpert-ai/xpert/releases/download/desktop-v0.3.0/')
  assert.equal(feed.channel, 'desktop-arm64')
  assert.equal(await findRelease({ platform: 'linux', arch: 'x64', fetcher: async () => Response.json([]) }), null)
  await assert.rejects(
    findRelease({ platform: 'darwin', arch: 'arm64', fetcher: async () => new Response('', { status: 403 }) })
  )
})
test('update metadata has distinct filenames for all six native targets', () => {
  assert.deepEqual(
    ['darwin', 'win32', 'linux'].flatMap((platform) => ['arm64', 'x64'].map((arch) => metadataName(platform, arch))),
    [
      'desktop-arm64-mac.yml',
      'desktop-x64-mac.yml',
      'desktop-arm64.yml',
      'desktop-x64.yml',
      'desktop-arm64-linux-arm64.yml',
      'desktop-x64-linux.yml'
    ]
  )
})
