const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createConnectionSession, connectionErrorKey, connectionPolicyKey } = require('../electron/connection/tls.cjs')
const { DesktopService, DEFAULT_CONFIG, parseConfig } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { resources } = require('../electron/i18n/index.mjs')

test('certificate exceptions require a boolean opt-in and survive local persistence', () => {
  assert.equal(parseConfig(DEFAULT_CONFIG).allowUntrustedCertificates, false)
  for (const value of ['true', 1, null, {}])
    assert.throws(() => parseConfig({ ...DEFAULT_CONFIG, allowUntrustedCertificates: value }))
  let saved
  const storage = {
    read: () => saved,
    write: (value) => {
      saved = structuredClone(value)
    }
  }
  const service = new DesktopService({ storage })
  service.credentials = { token: 'fixture', refreshToken: 'fixture' }
  service.configure({ ...service.config, allowUntrustedCertificates: true })
  assert.equal(service.credentials, null)
  const restored = new DesktopService({ storage })
  assert.equal(restored.config.allowUntrustedCertificates, true)
  assert.notEqual(connectionPolicyKey(restored.config), connectionPolicyKey(DEFAULT_CONFIG))
  assert.equal(connectionPolicyKey(restored.config), connectionPolicyKey({ ...restored.config, theme: 'dark' }))
  restored.configure({ ...restored.config, allowUntrustedCertificates: false })
  assert.equal(new DesktopService({ storage }).config.allowUntrustedCertificates, false)
})

test('fresh network sessions scope exceptions to configured HTTPS hosts and discard old decisions', () => {
  const created = []
  const sessions = {
    fromPartition: (partition) => {
      const connection = {
        partition,
        setCertificateVerifyProc: (verify) => {
          connection.verify = verify
        }
      }
      created.push(connection)
      return connection
    }
  }
  const config = {
    ...DEFAULT_CONFIG,
    apiUrl: 'https://api.example.test:8443/api',
    webUrl: 'https://web.example.test',
    frameUrl: 'https://chat.example.test/chatkit'
  }
  const result = (connection, hostname) => {
    let decision
    connection.verify({ hostname }, (value) => {
      decision = value
    })
    return decision
  }
  const strict = createConnectionSession(sessions, config)
  const allowed = createConnectionSession(sessions, { ...config, allowUntrustedCertificates: true })
  const revoked = createConnectionSession(sessions, config)
  for (const host of ['api.example.test', 'web.example.test', 'chat.example.test']) {
    assert.equal(result(strict, host), -3)
    assert.equal(result(allowed, host), 0)
    assert.equal(result(revoked, host), -3)
  }
  for (const host of ['example.test', 'other.example.test', 'api.example.test.attacker.test'])
    assert.equal(result(allowed, host), -3)
  const moved = createConnectionSession(sessions, {
    ...config,
    apiUrl: 'https://new.example.test',
    allowUntrustedCertificates: true
  })
  assert.equal(result(moved, 'api.example.test'), -3)
  assert.equal(result(moved, 'new.example.test'), 0)
  assert.equal(new Set(created.map((entry) => entry.partition)).size, 4)
  assert.ok(created.every((entry) => !entry.partition.startsWith('persist:')))
})

test('network errors identify certificate, DNS, timeout and refusal without exposing request credentials', async () => {
  for (const [code, phrase] of [
    ['DEPTH_ZERO_SELF_SIGNED_CERT', 'certificate is not trusted'],
    ['net::ERR_CERT_AUTHORITY_INVALID', 'certificate is not trusted'],
    ['CERT_HAS_EXPIRED', 'has expired'],
    ['ERR_CERT_DATE_INVALID', 'has expired'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'does not match'],
    ['ERR_CERT_COMMON_NAME_INVALID', 'does not match'],
    ['ETIMEDOUT', 'timed out'],
    ['ENOTFOUND', 'could not be resolved'],
    ['ECONNREFUSED', 'refused the connection']
  ]) {
    const error = new Error('private request data', { cause: Object.assign(new Error(code), { code }) })
    const key = connectionErrorKey(error)
    assert.ok(key.includes(phrase), code)
    for (const locale of Object.keys(resources)) assert.ok(resources[locale][key], locale)
    const service = new DesktopService({
      fetcher: async () => {
        throw error
      }
    })
    const result = await dispatch(service, 'login', { email: 'fixture@example.test', password: 'secret-fixture' })
    assert.equal(result.key, key)
    assert.equal(result.status, 503)
    assert.doesNotMatch(JSON.stringify(result), /private request data|secret-fixture/)
  }
  assert.equal(connectionErrorKey(new Error('unrecognized network failure')), null)
})
