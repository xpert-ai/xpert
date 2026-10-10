import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { platforms } from './release-plan.mjs'
import { packaging, appPaths, removeEmptySigningCredentials } from './package.mjs'
const require = createRequire(import.meta.url)
const { prepare } = require('./dependencies.cjs')
const plan = { build: true, sha: 'a'.repeat(40), version: '0.1.1' }
test('isolated CI packaging loads the signing hook from the app and retains audio entitlements', async (t) => {
  const workspace = mkdtempSync(join(tmpdir(), 'bosi-packaging-test-'))
  t.after(() => rmSync(workspace, { recursive: true, force: true }))
  prepare(workspace, true)
  const appDirectory = join(workspace, 'apps/desktop')
  const original = JSON.parse(readFileSync(join(appDirectory, 'package.json'), 'utf8')).build
  for (const target of platforms) {
    for (const env of [{}, { CSC_LINK: 'certificate' }]) {
      const { config } = packaging(plan, target, env, appDirectory)
      assert.equal(config.afterSign, resolve(appDirectory, original.afterSign))
      const hook = require(config.afterSign)
      assert.equal(typeof hook, 'function')
      assert.equal(typeof hook.verifyAudioSigning, 'function')
      assert.deepEqual(config.asarUnpack, original.asarUnpack)
      assert.equal(config[target.platform].icon, original[target.platform].icon)
      if (target.platform !== 'mac') {
        await hook({ electronPlatformName: target.platform === 'win' ? 'win32' : 'linux' })
        continue
      }
      assert.deepEqual(config.mac.binaries, original.mac.binaries)
      for (const key of ['entitlements', 'entitlementsInherit']) {
        assert.ok(isAbsolute(config.mac[key]), `${key} must work from the CI workspace root`)
        const plist = readFileSync(config.mac[key], 'utf8')
        assert.match(plist, /<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\/>/)
      }
    }
  }
})
test('every platform produces two uniquely named installers with implicit publishing disabled', () => {
  for (const target of platforms) {
    const { config } = packaging(plan, target, {})
    assert.equal(config.extraMetadata.version, plan.version)
    assert.equal(config.publish.provider, 'generic')
    assert.equal(config.publish.channel, `desktop-${target.arch}`)
    assert.ok(config.publish.url.endsWith(`/desktop-v${plan.version}/`))
    assert.equal(config.extraMetadata.desktopUpdates, false)
    assert.equal(config[target.platform].target.length, 2)
    assert.equal(config.artifactName, `Bosi-${plan.version}-${target.platform}-${target.arch}.\${ext}`)
    assert.ok(appPaths(target, '/release').archive.endsWith('app.asar'))
  }
})
test('missing GitHub signing secrets are removed before electron-builder reads the environment', () => {
  const env = {
    CSC_LINK: '',
    CSC_KEY_PASSWORD: '',
    APPLE_ID: ' ',
    APPLE_APP_SPECIFIC_PASSWORD: '',
    APPLE_TEAM_ID: '\n',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false'
  }
  assert.equal(packaging(plan, platforms[0], env).signing, 'ad-hoc')
  assert.deepEqual(removeEmptySigningCredentials(env), {
    CSC_KEY_PASSWORD: '',
    CSC_IDENTITY_AUTO_DISCOVERY: 'false'
  })
  assert.equal(Object.hasOwn(env, 'CSC_LINK'), false)
  const configured = { CSC_LINK: 'certificate', CSC_KEY_PASSWORD: ' ', APPLE_ID: 'id' }
  assert.deepEqual(removeEmptySigningCredentials({ ...configured }), configured)
  assert.throws(() => packaging(plan, platforms[0], configured), /requires a signing certificate/)
})
test('Linux x64 AppImage and tarball names match release receipts', () => {
  const target = platforms.find((entry) => entry.id === 'linux-x64')
  const { config } = packaging({ ...plan, version: '0.1.1-candidate.develop.aaaaaaaaaaaa' }, target, {})
  for (const ext of ['AppImage', 'tar.gz']) {
    assert.equal(
      config.artifactName.replace('${ext}', ext),
      `Bosi-0.1.1-candidate.develop.aaaaaaaaaaaa-linux-x64.${ext}`
    )
  }
})
test('macOS without credentials uses ad-hoc signing; configured signing cannot silently degrade', () => {
  const target = platforms[0]
  assert.equal(packaging(plan, target, {}).signing, 'ad-hoc')
  const result = packaging(plan, target, {
    CSC_LINK: 'certificate',
    APPLE_ID: 'id',
    APPLE_APP_SPECIFIC_PASSWORD: 'password',
    APPLE_TEAM_ID: 'team'
  })
  assert.equal(result.signing, 'signed-notarized')
  assert.equal(result.config.forceCodeSigning, true)
  assert.throws(() => packaging(plan, target, { APPLE_ID: 'id' }), /requires a signing certificate/)
})
test('Windows certificates require signing while missing credentials are marked unsigned', () => {
  const target = platforms.find((entry) => entry.id === 'win-x64')
  assert.equal(packaging(plan, target, {}).signing, 'unsigned')
  assert.equal(packaging(plan, target, { CSC_LINK: 'certificate' }).config.forceCodeSigning, true)
})
test('invalid release versions and unexpected targets are rejected', () => {
  assert.throws(() => packaging({ ...plan, version: 'latest' }, platforms[0], {}))
  assert.throws(() => packaging(plan, { id: 'mac-arm64', platform: 'win', arch: 'arm64' }, {}))
})
test('stable updates are enabled only for installable packages, excluding ad-hoc macOS', () => {
  for (const target of platforms) {
    const stable = { ...plan, stable: true }
    assert.equal(packaging(stable, target, {}).config.extraMetadata.desktopUpdates, target.platform !== 'mac')
    assert.equal(packaging(stable, target, { CSC_LINK: 'certificate' }).config.extraMetadata.desktopUpdates, true)
  }
})
