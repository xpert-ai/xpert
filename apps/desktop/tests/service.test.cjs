const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DesktopService, DEFAULT_CONFIG, parseConfig } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { createStorage } = require('../electron/storage.cjs')

const user = { id: 'user-1', tenantId: 'tenant-1', name: 'Test user' }
const bootstrap = {
  user,
  organizations: [
    { id: 'org-1', name: 'Team one' },
    { id: 'org-2', name: 'Team two' }
  ],
  activeOrganizationId: 'org-1'
}
const bot = { id: 'bot-1', name: 'Assistant', description: 'Office assistant' }
const login = { token: 'access-private', refreshToken: 'refresh-private', user }
const input = { email: 'tester@example.com', password: 'local-fixture' }
const response = (value, status = 200) => new Response(JSON.stringify(value), { status })

function fixture(override) {
  const calls = []
  const saved = []
  const service = new DesktopService({
    storage: { read: () => null, write: (value) => saved.push(structuredClone(value)) },
    fetcher: async (url, options) => {
      calls.push({ url, options })
      const result = await override?.(url, options)
      if (result) return result
      if (url.endsWith('/auth/login')) return response(login)
      if (url.endsWith('/bootstrap')) return response(bootstrap)
      if (url.includes('/mobile/xperts')) return response({ items: [bot], total: 1 })
      if (url.endsWith('/chatkit/sessions')) return response({ client_secret: 'short-lived' })
      if (url.endsWith('/auth/refresh')) return response({ token: 'access-new', refreshToken: 'refresh-new' })
      throw new Error(`Unexpected fixture request: ${url}`)
    }
  })
  return { service, calls, saved }
}

test('login exposes a profile, never account tokens; requests carry tenant and organization', async () => {
  const { service, calls } = fixture()
  const state = await service.login(input)
  assert.equal(state.profile.organizationId, 'org-1')
  assert.doesNotMatch(JSON.stringify(state), /private|refreshToken/)
  await service.listBots()
  const session = await service.chatSession('bot-1')
  assert.deepEqual(session, { secret: 'short-lived', organizationId: 'org-1' })
  const request = calls.at(-1)
  assert.equal(request.options.headers['tenant-id'], 'tenant-1')
  assert.equal(request.options.headers['organization-id'], 'org-1')
  assert.deepEqual(JSON.parse(request.options.body), { assistant: { id: 'bot-1' } })
  assert.equal(request.options.redirect, 'error')
})

test('unknown bots and organizations cannot mint a session', async () => {
  const { service } = fixture()
  await service.login(input)
  await assert.rejects(service.chatSession('bot-1'), { status: 403 })
  await assert.rejects(service.selectOrganization('other-org'), { status: 403 })
  await service.listBots()
  await service.selectOrganization('org-2')
  await assert.rejects(service.chatSession('bot-1'), { status: 403 })
})

test('avatar metadata is normalized before reaching the renderer', async () => {
  const { service } = fixture((url) => {
    if (url.endsWith('/bootstrap'))
      return response({ ...bootstrap, user: { ...user, imageUrl: 'https://example.com/user.png' } })
    if (url.includes('/mobile/xperts'))
      return response({
        items: [
          { ...bot, avatar: { url: 'https://example.com/bot.png', emoji: { id: 'lobster', unified: '1F99E' } } },
          { ...bot, id: 'bot-2', avatar: { url: 'javascript:alert(1)', emoji: { id: 123 } } }
        ],
        total: 2
      })
  })
  assert.equal((await service.login(input)).profile.user.avatarUrl, 'https://example.com/user.png')
  const bots = await service.listBots()
  assert.equal(bots[0].avatarUrl, 'https://example.com/bot.png')
  assert.deepEqual(bots[0].avatarEmoji, { id: 'lobster', unified: '1F99E' })
  assert.equal(bots[1].avatarUrl, null)
  assert.equal(bots[1].avatarEmoji, null)
})

test('401 refreshes the access token once and retries with the new token', async () => {
  const { service, calls } = fixture((url, options) => {
    if (url.includes('/mobile/xperts') && options.headers.Authorization === 'Bearer access-private')
      return response({}, 401)
  })
  await service.login(input)
  assert.equal((await service.listBots()).length, 1)
  assert.equal(calls.filter((call) => call.url.endsWith('/auth/refresh')).length, 1)
  assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer access-new')
})

test('invalid refresh clears credentials and reports login required', async () => {
  const { service } = fixture((url) => {
    if (url.includes('/mobile/xperts') || url.endsWith('/auth/refresh')) return response({}, 401)
  })
  await service.login(input)
  await assert.rejects(service.listBots(), { status: 401 })
  assert.equal(service.snapshot().profile, null)
  assert.equal(service.credentials, null)
})

test('connection changes clear authentication; appearance changes preserve it', async () => {
  const { service } = fixture()
  await service.login(input)
  assert.ok(service.configure({ ...DEFAULT_CONFIG, theme: 'dark' }).profile)
  assert.equal(service.configure({ ...DEFAULT_CONFIG, apiUrl: 'https://api.example.com' }).profile, null)
  assert.equal(service.credentials, null)
})

test('insecure remote URLs, credentials and query parameters are rejected', () => {
  for (const apiUrl of [
    'http://example.com',
    'file:///tmp/secret',
    'https://user:pass@example.com',
    'https://example.com/?token=x'
  ]) {
    assert.throws(() => parseConfig({ ...DEFAULT_CONFIG, apiUrl }))
  }
  assert.equal(parseConfig(DEFAULT_CONFIG).apiUrl, 'http://localhost:3000')
})

test('a response arriving after logout cannot recreate a session', async () => {
  let finish
  const { service } = fixture((url) =>
    url.includes('/mobile/xperts')
      ? new Promise((resolve) => {
          finish = resolve
        })
      : null
  )
  await service.login(input)
  const pending = service.listBots()
  service.logout()
  finish(response({ items: [bot], total: 1 }))
  await assert.rejects(pending, { status: 409 })
  assert.deepEqual(service.bots, [])
})

test('Bot pagination continues beyond the first 100 items', async () => {
  const { service } = fixture((url) => {
    if (!url.includes('/mobile/xperts')) return null
    const offset = Number(new URL(url).searchParams.get('offset'))
    return response({
      items: Array.from({ length: offset === 0 ? 100 : 1 }, (_, i) => ({ ...bot, id: `bot-${offset + i}` })),
      total: 101
    })
  })
  await service.login(input)
  assert.equal((await service.listBots()).length, 101)
  assert.equal((await service.chatSession('bot-100')).secret, 'short-lived')
})

test('host dispatch rejects arbitrary methods and hides internal errors', async () => {
  const { service } = fixture()
  assert.equal((await dispatch(service, 'request', '/api/user')).status, 403)
  assert.equal((await dispatch(service, 'constructor')).status, 403)
  assert.equal((await dispatch(service, 'loginLocal')).status, 403)
})

test('development credentials are never sent to a configured remote server', async () => {
  let readCredentials = false
  const service = new DesktopService({
    localLogin: () => {
      readCredentials = true
      return input
    }
  })
  service.configure({ ...DEFAULT_CONFIG, apiUrl: 'https://external.example.com' })
  assert.equal(service.snapshot().localLoginAvailable, false)
  await assert.rejects(service.loginLocal(), { status: 403 })
  assert.equal(readCredentials, false)
})

test('storage never persists unencrypted credentials when encryption is unavailable', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-desktop-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const storage = createStorage(directory, { isEncryptionAvailable: () => false })
  storage.write({ config: DEFAULT_CONFIG, credentials: login })
  const persisted = fs.readFileSync(path.join(directory, 'desktop-state.json'), 'utf8')
  assert.doesNotMatch(persisted, /access-private|refresh-private/)
  assert.equal(storage.read().credentials, null)
})

test('encrypted storage restores credentials and logout erases the saved credential', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-desktop-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const encryption = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value).map((byte) => byte ^ 73),
    decryptString: (value) => value.map((byte) => byte ^ 73).toString()
  }
  const storage = createStorage(directory, encryption)
  storage.write({ config: DEFAULT_CONFIG, credentials: login })
  assert.equal(storage.read().credentials.token, login.token)
  assert.doesNotMatch(fs.readFileSync(path.join(directory, 'desktop-state.json'), 'utf8'), /access-private/)
  storage.write({ config: DEFAULT_CONFIG, credentials: null })
  assert.equal(storage.read().credentials, null)
})
