const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const {
  createAudioPermissions,
  registerAudioPermissionIpc,
  hasAudioInputEntitlement
} = require('../electron/audio-permissions.cjs')
const { verifyAudioSigning } = require('../scripts/verify-macos-audio-signing.cjs')
const { execFileSync } = require('node:child_process')

test(
  'actual macOS signatures expose missing and present audio entitlements',
  { skip: process.platform !== 'darwin' },
  async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bosi-entitlement-'))
    t.after(() => fs.rm(dir, { recursive: true, force: true }))
    const binary = path.join(dir, 'test-audio-signature')
    await fs.copyFile('/usr/bin/true', binary)
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', binary], { stdio: 'pipe' })
    assert.equal(await hasAudioInputEntitlement(binary), false)
    execFileSync(
      '/usr/bin/codesign',
      ['--force', '--sign', '-', '--entitlements', path.join(__dirname, '../resources/entitlements.mac.plist'), binary],
      { stdio: 'pipe' }
    )
    assert.equal(await hasAudioInputEntitlement(binary), true)
  }
)

test('signing failure is distinguished from denied consent even when macOS remembers a grant', async () => {
  let prompts = 0
  const service = createAudioPermissions({
    platform: 'darwin',
    packaged: true,
    inspectSigning: async () => false,
    systemPreferences: {
      getMediaAccessStatus: () => 'granted',
      askForMediaAccess: async () => {
        prompts++
        return true
      }
    }
  })
  assert.deepEqual(await service.microphone({ prompt: true }), { success: false, code: 'audio_signing_missing' })
  assert.equal(prompts, 0)
})

test('passive checks never prompt, denied consent is not requested repeatedly, concurrent prompts are deduplicated', async () => {
  let status = 'not-determined',
    prompts = 0,
    allow
  const service = createAudioPermissions({
    platform: 'darwin',
    systemPreferences: {
      getMediaAccessStatus: () => status,
      askForMediaAccess: () => {
        prompts++
        return new Promise((resolve) => {
          allow = resolve
        })
      }
    }
  })
  assert.deepEqual(await service.microphone(), { success: true })
  assert.equal(prompts, 0)
  const a = service.microphone({ prompt: true }),
    b = service.microphone({ prompt: true })
  assert.equal(prompts, 1)
  allow(false)
  assert.deepEqual(await a, { success: false, code: 'audio_permission_denied' })
  assert.deepEqual(await b, { success: false, code: 'audio_permission_denied' })
  status = 'denied'
  await service.microphone({ prompt: true })
  assert.equal(prompts, 1)
  status = 'granted'
  assert.deepEqual(await service.microphone({ prompt: true }), { success: true })
})

test('unknown OS status and signature inspection failure fail closed with safe codes', async () => {
  for (const packaged of [true, false]) {
    const service = createAudioPermissions({
      platform: 'darwin',
      packaged,
      inspectSigning: async () => {
        throw new Error('private system diagnostic')
      },
      systemPreferences: { getMediaAccessStatus: () => 'unknown' }
    })
    assert.deepEqual(await service.microphone({ prompt: true }), {
      success: false,
      code: 'audio_permission_check_failed'
    })
  }
})

test('permission IPC rejects an untrusted frame without calling the OS', async () => {
  let handler,
    calls = 0
  registerAudioPermissionIpc(
    {
      handle: (_, fn) => {
        handler = fn
      }
    },
    {
      microphone: async () => {
        calls++
        return { success: true }
      }
    },
    (event) => event.trusted
  )
  assert.deepEqual(await handler({ trusted: false }), { success: false, code: 'forbidden' })
  assert.equal(calls, 0)
  assert.deepEqual(await handler({ trusted: true }), { success: true })
  assert.equal(calls, 1)
})

test('release verification rejects missing helper entitlements and a missing native recorder', async (t) => {
  const app = await fs.mkdtemp(path.join(os.tmpdir(), 'bosi-signing-'))
  t.after(() => fs.rm(app, { recursive: true, force: true }))
  const helper = path.join(app, 'Contents/Frameworks/Bosi Helper (Renderer).app')
  const native = path.join(app, 'Contents/Resources/app.asar.unpacked/resources/audio-capture/audio-capture')
  await fs.mkdir(helper, { recursive: true })
  await assert.rejects(
    verifyAudioSigning(app, async () => true),
    { code: 'ENOENT' }
  )
  await fs.mkdir(path.dirname(native), { recursive: true })
  await fs.writeFile(native, '')
  await assert.rejects(
    verifyAudioSigning(app, async (file) => file !== helper),
    /entitlement is missing/
  )
  const checked = []
  await verifyAudioSigning(app, async (file) => {
    checked.push(file)
    return true
  })
  assert.deepEqual(checked, [app, helper, native])
})
