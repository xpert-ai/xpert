import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publishVerifiedImage } from './publish-verified-image.mjs'

const sha = 'a'.repeat(40)
const verifiedId = `sha256:${'b'.repeat(64)}`
const otherId = `sha256:${'c'.repeat(64)}`
const repositories = [
  'ghcr.io/xpert-ai/xpert-api',
  'metadc/xpert-api',
  'registry.cn-hangzhou.aliyuncs.com/metad/xpert-api'
]

function fixture({ version = '1.0.1', existing = {}, localId = verifiedId, revision = sha, inspectError } = {}) {
  const tags = repositories.flatMap((repo) =>
    [version, `sha-${sha}`, ...(version.includes('candidate') ? ['develop-candidate'] : ['main', 'latest'])].map(
      (tag) => `${repo}:${tag}`
    )
  )
  const calls = []
  const options = {
    image: `xpert-api:check-${sha}`,
    verifiedId,
    tags,
    version,
    sha,
    run(args) {
      calls.push(args)
      if (args[0] === 'image')
        return JSON.stringify([
          {
            Id: localId,
            Config: {
              Labels: {
                'org.opencontainers.image.revision': revision,
                'org.opencontainers.image.version': version
              }
            }
          }
        ])
      if (args[0] === 'buildx') {
        if (inspectError) throw inspectError
        const value = existing[args.at(-1)]
        if (value) return JSON.stringify(typeof value === 'string' ? { config: { digest: value } } : value)
        throw Object.assign(new Error('not found'), { status: 1, stderr: `${args.at(-1)}: not found` })
      }
      return ''
    }
  }
  return { options, calls, push: () => publishVerifiedImage(options) }
}

test('publishes the verified local image to all mirrors, with aliases last and no rebuild', () => {
  const f = fixture()
  f.push()
  const writes = f.calls.filter(([cmd]) => cmd === 'push').map((args) => args[1])
  assert.equal(writes.length, 12)
  assert.ok(writes.slice(0, 6).every((tag) => tag.endsWith(':1.0.1') || tag.endsWith(`:sha-${sha}`)))
  assert.ok(writes.slice(6).every((tag) => tag.endsWith(':main') || tag.endsWith(':latest')))
  assert.ok(f.calls.filter(([cmd]) => cmd === 'tag').every((args) => args[1] === f.options.image))
  assert.ok(!f.calls.some((args) => args.includes('build')))
})

test('candidate publication uses a SHA-specific version and never moves stable aliases', () => {
  const f = fixture({ version: `1.0.1-candidate.develop.${sha.slice(0, 12)}` })
  f.push()
  assert.equal(f.calls.filter(([cmd]) => cmd === 'push').length, 9)
  assert.ok(!f.calls.some((args) => /:(main|latest)$/.test(args.at(-1))))
})

test('artifact ID and source SHA mismatches fail before registry writes', () => {
  for (const values of [{ localId: otherId }, { revision: 'd'.repeat(40) }]) {
    const f = fixture(values)
    assert.throws(f.push)
    assert.ok(!f.calls.some(([cmd]) => ['push', 'tag', 'buildx'].includes(cmd)))
  }
})

test('an existing different immutable tag stops the entire publication before any write', () => {
  const f = fixture({ existing: { [`${repositories[2]}:1.0.1`]: otherId } })
  assert.throws(f.push, /Refusing to overwrite immutable/)
  assert.ok(!f.calls.some(([cmd]) => cmd === 'push' || cmd === 'tag'))
})

test('partial publication retries skip identical immutable tags and finish other mirrors', () => {
  const f = fixture({
    existing: { [`${repositories[0]}:1.0.1`]: verifiedId, [`${repositories[0]}:sha-${sha}`]: verifiedId }
  })
  f.push()
  assert.equal(f.calls.filter(([cmd]) => cmd === 'push').length, 10)
})

test('a mirror push failure never advances channel aliases', () => {
  const f = fixture()
  const run = f.options.run
  f.options.run = (args) => {
    const result = run(args)
    if (args[0] === 'push' && args[1] === `${repositories[1]}:1.0.1`) throw new Error('Registry unavailable')
    return result
  }
  assert.throws(f.push, /Registry unavailable/)
  assert.ok(!f.calls.some((args) => args[0] === 'push' && /:(main|latest)$/.test(args[1])))
})

test('existing single-platform indexes are verified through their image config', () => {
  const manifestId = `sha256:${'e'.repeat(64)}`
  const f = fixture({
    existing: {
      [`${repositories[0]}:1.0.1`]: {
        manifests: [{ digest: manifestId, platform: { os: 'linux', architecture: 'amd64' } }]
      },
      [`${repositories[0]}@${manifestId}`]: verifiedId
    }
  })
  f.push()
  assert.ok(!f.calls.some(([cmd, tag]) => cmd === 'push' && tag === `${repositories[0]}:1.0.1`))
})

test('registry outages or permission errors are not treated as missing tags', () => {
  for (const stderr of [
    'unauthorized: authentication required',
    'TLS handshake timeout',
    'docker: command not found'
  ]) {
    const f = fixture({ inspectError: Object.assign(new Error(stderr), { status: 1, stderr }) })
    assert.throws(f.push)
    assert.ok(!f.calls.some(([cmd]) => cmd === 'push' || cmd === 'tag'))
  }
})
