const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService, DEFAULT_CONFIG } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { probeCertificate } = require('../electron/connection/certificates.cjs')

test('checks draft origins once, without saving the draft or trusting its certificate exception', async () => {
  const origins = []
  const service = new DesktopService({
    certificateProbe: async (origin) => {
      origins.push(origin)
      return { status: 'untrusted', reason: 'authority' }
    }
  })
  const before = service.snapshot()
  const result = await dispatch(service, 'checkConnectionCertificates', {
    apiUrl: 'https://private.test:8443/api',
    webUrl: 'https://private.test:8443',
    frameUrl: 'https://private.test:8443/chatkit',
    allowUntrustedCertificates: true
  })
  assert.equal(result.ok, true)
  assert.deepEqual(origins, ['https://private.test:8443'])
  assert.deepEqual(result.value, [
    { origin: origins[0], fields: ['apiUrl', 'webUrl', 'frameUrl'], status: 'untrusted', reason: 'authority' }
  ])
  assert.deepEqual(service.snapshot(), before)
})

test('invalid URLs and local HTTP do not trigger a TLS probe, and ports are checked separately', async () => {
  const origins = []
  const service = new DesktopService({
    certificateProbe: async (origin) => {
      origins.push(origin)
      return { status: 'trusted' }
    }
  })
  const invalid = await service.checkConnectionCertificates({
    apiUrl: 'https://user:password@private.test',
    webUrl: 'http://localhost:4200',
    frameUrl: 'file:///etc/passwd'
  })
  assert.deepEqual(origins, [])
  assert.deepEqual(
    invalid.map((entry) => entry.status),
    ['http', 'invalid', 'invalid']
  )
  assert.doesNotMatch(JSON.stringify(invalid), /password|passwd/)
  await service.checkConnectionCertificates({
    ...DEFAULT_CONFIG,
    apiUrl: 'https://private.test:8443/api',
    webUrl: 'https://private.test',
    frameUrl: 'https://private.test/chatkit'
  })
  assert.deepEqual(origins, ['https://private.test:8443', 'https://private.test'])
})

test('TLS diagnostics stay strict, omit credentials, do not follow redirects, and ignore HTTP status', async () => {
  const partitions = []
  let closed = 0
  let response = { status: 405 }
  const sessions = {
    fromPartition(partition, options) {
      partitions.push(partition)
      assert.equal(options.cache, false)
      return {
        async fetch(url, options) {
          assert.equal(url, 'https://private.test/')
          assert.equal(options.method, 'HEAD')
          assert.equal(options.credentials, 'omit')
          assert.equal(options.redirect, 'manual')
          assert.equal(options.cache, 'no-store')
          assert.equal(options.headers, undefined)
          assert.equal(options.body, undefined)
          assert.ok(options.signal instanceof AbortSignal)
          if (response instanceof Error) throw response
          return response
        },
        async closeAllConnections() {
          closed++
        }
      }
    }
  }
  assert.deepEqual(await probeCertificate(sessions, 'https://private.test'), { status: 'trusted' })
  for (const [error, expected] of [
    ['net::ERR_CERT_AUTHORITY_INVALID', { status: 'untrusted', reason: 'authority' }],
    ['net::ERR_CERT_DATE_INVALID', { status: 'untrusted', reason: 'date' }],
    ['net::ERR_CERT_COMMON_NAME_INVALID', { status: 'untrusted', reason: 'hostname' }],
    ['net::ERR_CERT_REVOKED', { status: 'untrusted', reason: 'other' }],
    ['net::ERR_NAME_NOT_RESOLVED', { status: 'unreachable' }],
    ['net::ERR_CONNECTION_TIMED_OUT', { status: 'unreachable' }]
  ]) {
    response = new Error(error)
    assert.deepEqual(await probeCertificate(sessions, 'https://private.test'), expected)
  }
  assert.equal(new Set(partitions).size, 7)
  assert.equal(closed, 7)
})
