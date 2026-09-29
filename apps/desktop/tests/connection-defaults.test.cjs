const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DesktopService, DEFAULT_CONFIG } = require('../electron/service.cjs')
const { connectionDefaults, packagedConnection } = require('../electron/connection/defaults.cjs')
const { apiRootUrl, chatkitUrl, followsWebUrl } = require('../electron/connection/urls.mjs')

function configFile(t, value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bosi-connection-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'connection.json')
  fs.writeFileSync(file, JSON.stringify(value))
  return file
}

test('fresh profiles use the official API, Web and ChatKit deployments', () => {
  assert.deepEqual(connectionDefaults({}), {
    apiUrl: 'https://api.xpertai.cn/api',
    webUrl: 'https://app.xpertai.cn',
    frameUrl: 'https://app.xpertai.cn/chatkit'
  })
  assert.equal(new DesktopService().config.apiUrl, connectionDefaults({}).apiUrl)
})

test('customer file and environment overrides resolve deterministically and only include public URLs', (t) => {
  const file = configFile(t, { apiUrl: 'https://api.customer.example/api/', webUrl: 'https://customer.example/suite/' })
  const config = connectionDefaults({
    XPERT_DESKTOP_CONNECTION_FILE: file,
    XPERT_DESKTOP_API_URL: 'https://gateway.customer.example/xpert/api/',
    UNRELATED_SECRET: 'not-for-packaging'
  })
  assert.deepEqual(config, {
    apiUrl: 'https://gateway.customer.example/xpert/api',
    webUrl: 'https://customer.example/suite',
    frameUrl: 'https://customer.example/suite/chatkit'
  })
  assert.equal(
    connectionDefaults({
      XPERT_DESKTOP_WEB_URL: 'https://customer.example',
      XPERT_DESKTOP_CHATKIT_URL: 'https://chat.customer.example/ui'
    }).frameUrl,
    'https://chat.customer.example/ui'
  )
})

test('invalid overrides fail the build instead of falling back to the official deployment', (t) => {
  for (const value of [
    '',
    'http://remote.example/api',
    'https://user:password@example.com/api',
    'https://example.com/api?token=secret'
  ])
    assert.throws(() => connectionDefaults({ XPERT_DESKTOP_API_URL: value }))
  for (const value of [{ apiUrl: 10 }, { password: 'not-for-packaging' }, [], null])
    assert.throws(() => connectionDefaults({ XPERT_DESKTOP_CONNECTION_FILE: configFile(t, value) }))
  assert.throws(() =>
    connectionDefaults({ XPERT_DESKTOP_CONNECTION_FILE: path.join(os.tmpdir(), 'missing-bosi-config.json') })
  )
})

test('saved connections, authentication and sidebar scopes survive an upgrade with different defaults', () => {
  const config = {
    ...DEFAULT_CONFIG,
    apiUrl: 'http://localhost:3000',
    webUrl: 'http://localhost:4200',
    frameUrl: 'http://localhost:4200/chatkit/index.html'
  }
  const credentials = { token: 'saved-token' }
  const service = new DesktopService({
    defaultConfig: connectionDefaults({ XPERT_DESKTOP_API_URL: 'https://customer.example/api' }),
    storage: { read: () => ({ config, credentials, sidebars: { scope: { items: [] } } }) }
  })
  assert.equal(service.config.apiUrl, config.apiUrl)
  assert.equal(service.config.frameUrl, config.frameUrl)
  assert.equal(service.credentials, credentials)
  assert.deepEqual(service.sidebars, { scope: { items: [] } })
})

test('invalid saved settings cannot carry credentials into a new default service', () => {
  for (const config of [undefined, { ...DEFAULT_CONFIG, apiUrl: 'invalid' }]) {
    const service = new DesktopService({ storage: { read: () => ({ config, credentials: { token: 'old-token' } }) } })
    assert.equal(service.config.apiUrl, connectionDefaults({}).apiUrl)
    assert.equal(service.credentials, null)
  }
})

test('packaged connection snapshot is required, validated and used without build environment variables', (t) => {
  const config = connectionDefaults({
    XPERT_DESKTOP_WEB_URL: 'https://customer.example',
    XPERT_DESKTOP_API_URL: 'https://customer.example/api'
  })
  const built = packagedConnection(configFile(t, config))
  const service = new DesktopService({ defaultConfig: built })
  assert.equal(service.config.webUrl, 'https://customer.example')
  assert.equal(service.config.frameUrl, 'https://customer.example/chatkit')
  assert.throws(() => packagedConnection(configFile(t, { apiUrl: 'https://example.com' })))
})

test('API root compatibility keeps REST and ChatKit paths single-prefixed and Shell namespaces outside /api', async () => {
  for (const base of [
    'https://api.example.com',
    'https://api.example.com/api/',
    'https://api.example.com/suite/api/'
  ]) {
    const calls = []
    const service = new DesktopService({
      defaultConfig: { apiUrl: base },
      fetcher: async (url) => {
        calls.push(url)
        return new Response('{}')
      }
    })
    await service.request('/api/auth/login', { auth: false })
    const root = base.includes('/suite/') ? 'https://api.example.com/suite' : 'https://api.example.com'
    assert.deepEqual(calls, [`${root}/api/auth/login`])
    assert.equal(`${apiRootUrl(base)}/api/ai`, `${root}/api/ai`)
    assert.equal(`${apiRootUrl(base)}/desktop`, `${root}/desktop`)
  }
})

test('Web URL edits keep default ChatKit in sync and preserve a separately hosted ChatKit', () => {
  assert.equal(chatkitUrl('https://customer.example/suite/'), 'https://customer.example/suite/chatkit')
  assert.equal(followsWebUrl('https://app.xpertai.cn/chatkit', 'https://app.xpertai.cn/'), true)
  assert.equal(followsWebUrl('http://localhost:4200/chatkit/index.html', 'http://localhost:4200'), true)
  assert.equal(followsWebUrl('https://chat.customer.example/chatkit', 'https://app.customer.example'), false)
})

test('Vite emits the resolved connection as a build artifact', async () => {
  const { connectionDefaultsPlugin } = await import('../scripts/connection-defaults.mjs')
  let emitted
  const plugin = connectionDefaultsPlugin()
  plugin.buildStart.call({
    emitFile: (asset) => {
      emitted = asset
    }
  })
  assert.equal(emitted.fileName, 'connection-defaults.json')
  assert.deepEqual(JSON.parse(emitted.source), connectionDefaults())
})
