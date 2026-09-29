const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService, DEFAULT_CONFIG, parseConfig } = require('../electron/service.cjs')
const { parseAppearance } = require('../electron/appearance.cjs')
const { createStorage } = require('../electron/storage.cjs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

test('legacy configuration gains independent appearance defaults', () => {
  const first = parseConfig(DEFAULT_CONFIG)
  const second = parseConfig(DEFAULT_CONFIG)
  first.appearance.desktop.light.primary = '#123456'
  assert.deepEqual(second.appearance.desktop.light, {})
  assert.equal(second.appearance.chatkit.radius, 'soft')
  assert.equal(second.appearance.chatkit.baseSize, 15)
})

test('theme edits survive host restart without clearing credentials, organization or bot access', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-appearance-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const storage = createStorage(directory, {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value),
    decryptString: (value) => value.toString()
  })
  const credentials = { token: 'fixture-access', refreshToken: 'fixture-refresh', organizationId: 'org' }
  const profile = { user: { id: 'user' }, organizations: [{ id: 'org', name: 'Team' }], activeOrganizationId: 'org' }
  const fetcher = async (url) =>
    new Response(JSON.stringify(url.endsWith('/bootstrap') ? profile : { client_secret: 'scoped' }))
  storage.write({ config: DEFAULT_CONFIG, credentials })
  const service = new DesktopService({ storage, fetcher })
  await service.state()
  service.bots = [{ id: 'bot' }]
  const appearance = parseAppearance({
    desktop: { light: { primary: '#2563EB' }, dark: { primary: '#fbbf24' }, baseSize: 17, radius: 0 },
    chatkit: { radius: 'round', grayscale: { hue: 210, tint: 2, shade: -1 }, dark: { background: '#111111' } }
  })
  const generation = service.generation
  assert.ok(service.configure({ ...DEFAULT_CONFIG, appearance }).profile)
  assert.equal(service.generation, generation)
  assert.deepEqual(service.credentials, credentials)
  assert.equal((await service.chatSession('bot')).secret, 'scoped')
  const restored = new DesktopService({ storage, fetcher })
  assert.deepEqual(restored.snapshot().config.appearance, appearance)
  assert.equal((await restored.state()).profile.organizationId, 'org')
})

test('invalid appearance saves are atomic and reject CSS, invalid colors and unsupported ranges', () => {
  const service = new DesktopService()
  const initial = structuredClone(service.snapshot())
  for (const appearance of [
    { desktop: { light: { primary: 'url(https://example.com)' } } },
    { desktop: { light: { background: '#abc' } } },
    { desktop: { fontFamily: 'serif; background: red' } },
    { desktop: { radius: -1 } },
    { desktop: { radius: 25 } },
    { chatkit: { baseSize: 19 } },
    { chatkit: { density: 'tiny' } },
    { chatkit: { accentLevel: 4 } },
    { chatkit: { grayscale: { hue: 100, tint: 10 } } },
    { chatkit: { grayscale: { hue: 100, tint: 2, shade: -5 } } },
    []
  ]) {
    assert.throws(() => service.configure({ ...DEFAULT_CONFIG, appearance }), { status: 400 })
    assert.deepEqual(service.snapshot(), initial)
  }
})

test('unknown CSS keys are discarded and resetting removes previous overrides', () => {
  const service = new DesktopService()
  const appearance = { desktop: { light: { primary: '#2563eb', arbitrary: 'red' } }, extra: 'ignored' }
  const saved = service.configure({ ...DEFAULT_CONFIG, appearance }).config.appearance
  assert.deepEqual(saved.desktop.light, { primary: '#2563eb' })
  assert.equal(saved.extra, undefined)
  const reset = service.configure({ ...DEFAULT_CONFIG, appearance: parseAppearance() }).config.appearance
  assert.deepEqual(reset.desktop.light, {})
  assert.equal(reset.chatkit.grayscale, null)
})

test('damaged saved appearance does not reset the configured Xpert service', () => {
  const config = { ...DEFAULT_CONFIG, apiUrl: 'https://api.example.com', appearance: { desktop: { radius: -1 } } }
  const service = new DesktopService({ storage: { read: () => ({ config }), write() {} } })
  assert.equal(service.snapshot().config.apiUrl, config.apiUrl)
  assert.equal(service.snapshot().config.appearance.desktop.radius, 12)
})
