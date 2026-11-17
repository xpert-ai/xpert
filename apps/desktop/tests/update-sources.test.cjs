const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { DesktopUpdater, registerUpdateIpc } = require('../electron/updates/controller.cjs')
const { getReleaseSources } = require('../electron/updates/release.cjs')
const { createUpdateMenuAction } = require('../electron/updates/menu.cjs')

const current = '0.4.2'
const newer = '0.5.0'
const metadata = 'desktop-arm64-mac.yml'

function setup(
  t,
  { country = 'CN', oss = current, github = newer, trace, checkFeed, mirrorDomain = 'oss.example.com' } = {}
) {
  const requests = []
  const updater = new EventEmitter()
  let selected
  updater.setFeedURL = (feed) => {
    selected = new URL(feed.url)
  }
  updater.checkForUpdates = async () => {
    const source = selected.host === mirrorDomain ? 'oss' : 'github'
    const version = selected.pathname.split('/').at(-2).slice(9)
    requests.push(source + '-feed')
    if (checkFeed) await checkFeed(source, version)
    return { isUpdateAvailable: version === newer, updateInfo: { version } }
  }
  const fetcher = async (url) => {
    if (url === 'https://www.cloudflare.com/cdn-cgi/trace') {
      requests.push('country')
      if (trace instanceof Error) throw trace
      return new Response(trace ?? `h=www.cloudflare.com\nloc=${country}\n`)
    }
    if (url === `https://${mirrorDomain}/bosi/latest.json`) {
      requests.push('oss')
      if (oss instanceof Error) throw oss
      return Response.json(
        typeof oss === 'object' && oss
          ? oss
          : { schema: 1, tag: 'desktop-v' + (oss ?? current), feeds: oss ? { [metadata]: 'desktop-v' + oss } : {} }
      )
    }
    assert.equal(url, 'https://api.github.com/repos/xpert-ai/xpert/releases?per_page=100&page=1')
    requests.push('github')
    if (github instanceof Error) return new Response(null, { status: 403 })
    return Response.json(
      github ? [{ tag_name: 'desktop-v' + github, draft: false, prerelease: false, assets: [{ name: metadata }] }] : []
    )
  }
  const controller = new DesktopUpdater({
    updater,
    enabled: true,
    currentVersion: current,
    getSources: () => getReleaseSources({ platform: 'darwin', arch: 'arm64', mirrorDomain, fetcher })
  })
  t.after(() => controller.dispose())
  return { controller, requests, updater }
}

test('background checks use the network exit country and do not probe the other index after a usable result', async (t) => {
  for (const [options, source] of [
    [{ country: 'CN' }, 'oss'],
    [{ country: 'US' }, 'github'],
    [{ country: 'HK' }, 'github'],
    [{ country: 'XX' }, 'oss'],
    [{ country: 'T1' }, 'oss'],
    [{ trace: '<html>offline</html>' }, 'oss'],
    [{ trace: 'h=proxy.example\nloc=US' }, 'oss'],
    [{ trace: new Error('timeout') }, 'oss']
  ]) {
    const { controller, requests } = setup(t, options)
    const result = await controller.check()
    assert.equal(result.status, source === 'oss' ? 'idle' : 'available')
    assert.deepEqual(requests, ['country', source, source + '-feed'])
  }
  const { controller, requests } = setup(t, { mirrorDomain: '' })
  await controller.check({ manual: true })
  assert.deepEqual(requests, ['github', 'github-feed'])
})

test('manual checks use the newer GitHub feed only when the OSS channel is current or behind', async (t) => {
  for (const [options, expected, sources] of [
    [{}, 'available', ['oss', 'oss-feed', 'github', 'github-feed']],
    [{ oss: '0.4.1' }, 'available', ['oss', 'oss-feed', 'github', 'github-feed']],
    [{ oss: newer }, 'available', ['oss', 'oss-feed']],
    [{ github: current }, 'idle', ['oss', 'oss-feed', 'github', 'github-feed']],
    [{ github: new Error('offline') }, 'error', ['oss', 'oss-feed', 'github']],
    [{ country: 'DE', github: current }, 'idle', ['github', 'github-feed']],
    [{ country: 'DE', github: new Error('offline') }, 'idle', ['github', 'oss', 'oss-feed']]
  ]) {
    const { controller, requests } = setup(t, options)
    const result = await controller.check({ manual: true })
    assert.equal(result.status, expected)
    if (expected === 'available') assert.equal(result.version, newer)
    assert.deepEqual(requests, ['country', ...sources])
  }
})

test('index failure, missing architecture, and native feed failures switch source in either direction', async (t) => {
  const badIndex = { schema: 1, tag: 'desktop-v0.5.0', feeds: { [metadata]: 'https://example.com' } }
  for (const [options, expected] of [
    [{ oss: new Error('timeout') }, ['oss', 'github', 'github-feed']],
    [{ oss: badIndex }, ['oss', 'github', 'github-feed']],
    [{ oss: null }, ['oss', 'github', 'github-feed']],
    [{ country: 'CA', github: new Error('rate limited'), oss: newer }, ['github', 'oss', 'oss-feed']],
    [{ country: 'AU', github: null, oss: newer }, ['github', 'oss', 'oss-feed']],
    [
      {
        checkFeed: (source) => {
          if (source === 'oss') throw Error('404')
        }
      },
      ['oss', 'oss-feed', 'github', 'github-feed']
    ],
    [
      {
        country: 'US',
        oss: newer,
        checkFeed: (source) => {
          if (source === 'github') throw Error('bad YAML')
        }
      },
      ['github', 'github-feed', 'oss', 'oss-feed']
    ]
  ]) {
    const { controller, requests } = setup(t, options)
    assert.equal((await controller.check()).version, newer)
    assert.deepEqual(requests, ['country', ...expected])
  }
  const { controller } = setup(t, { oss: new Error('unreachable'), github: new Error('limited') })
  assert.equal((await controller.check()).operation, 'check')
})

test('menu and IPC manual checks join an in-flight automatic OSS check and share one GitHub recheck', async (t) => {
  const checking = Promise.withResolvers()
  const finish = Promise.withResolvers()
  const { controller, requests } = setup(t, {
    checkFeed: async (source) => {
      if (source === 'oss') {
        checking.resolve()
        await finish.promise
      }
    }
  })
  const automatic = controller.check()
  await checking.promise
  const dialogs = []
  const menu = createUpdateMenuAction({
    updates: controller,
    t: (key, vars) => vars?.version || key,
    showMessageBox: async (dialog) => {
      dialogs.push(dialog)
      return { response: 0 }
    }
  })
  let ipc
  registerUpdateIpc(
    {
      handle: (_name, handler) => {
        ipc = handler
      }
    },
    controller,
    () => true
  )
  const pending = [menu(), ipc({}, 'check'), automatic]
  finish.resolve()
  await Promise.all(pending)
  assert.equal(dialogs[0].message, newer)
  assert.deepEqual(requests, ['country', 'oss', 'oss-feed', 'github', 'github-feed'])
})

test('download failover stays on the approved release and rejects a different installer on retry', async (t) => {
  const { controller, updater } = setup(t, { oss: newer })
  const file = { url: 'Bosi.zip', size: 4096, sha512: 'approved digest' }
  const attempts = []
  let host,
    digest = 'different digest'
  updater.setFeedURL = ({ url }) => {
    host = new URL(url).host
  }
  updater.checkForUpdates = async () => ({
    isUpdateAvailable: true,
    updateInfo: {
      version: newer,
      files: [
        {
          ...file,
          sha512: host === 'github.com' ? digest : file.sha512
        }
      ]
    }
  })
  updater.downloadUpdate = async () => {
    attempts.push(host)
    if (host !== 'github.com') {
      const error = new Error('connection reset')
      updater.emit('error', error)
      throw error
    }
    updater.emit('update-downloaded', { version: newer })
  }
  await controller.check()
  assert.equal((await controller.download()).operation, 'download')
  assert.deepEqual(attempts, ['oss.example.com'])
  digest = file.sha512
  assert.equal((await controller.download()).status, 'downloaded')
  assert.deepEqual(attempts, ['oss.example.com', 'oss.example.com', 'github.com'])
})
