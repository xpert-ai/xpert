import assert from 'node:assert/strict'
import { test } from 'node:test'
import { platforms } from './release-plan.mjs'
import { packaging, appPaths } from './package.mjs'
const plan = { build: true, sha: 'a'.repeat(40), version: '0.1.1' }
test('every platform produces two uniquely named installers with implicit publishing disabled', () => {
  for (const target of platforms) {
    const { config } = packaging(plan, target, {})
    assert.equal(config.extraMetadata.version, plan.version)
    assert.equal(config.publish, null)
    assert.equal(config[target.platform].target.length, 2)
    assert.equal(config.artifactName, 'Bosi-${version}-${os}-${arch}.${ext}')
    assert.ok(appPaths(target, '/release').archive.endsWith('app.asar'))
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
