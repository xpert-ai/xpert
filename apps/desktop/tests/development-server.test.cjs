const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

async function fixture(t, contents) {
  const directory = mkdtempSync(join(tmpdir(), 'desktop-development-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const envFile = join(directory, '.env')
  if (contents !== undefined) writeFileSync(envFile, contents)
  const { desktopDevelopmentServer } = await import('../scripts/development-server.mjs')
  return (env = {}) => desktopDevelopmentServer(env, envFile)
}

test('keeps the existing loopback default when the root env file is absent', async (t) => {
  const resolve = await fixture(t)
  assert.deepEqual(resolve(), { host: '127.0.0.1', port: 4390, strictPort: true })
})

test('reads the paired root configuration without exposing unrelated environment values', async (t) => {
  const resolve = await fixture(
    t,
    [
      'XPERT_DESKTOP_DEV_URL=http://127.0.0.1:4392/',
      'REALTIME_VOICE_ALLOWED_ORIGINS=http://localhost:4300,http://127.0.0.1:4392',
      'SERVER_ONLY_SECRET=fixture'
    ].join('\n')
  )
  assert.deepEqual(resolve(), { host: '127.0.0.1', port: 4392, strictPort: true })
})

test('explicit shell configuration takes precedence over the root env file', async (t) => {
  const resolve = await fixture(t, 'XPERT_DESKTOP_DEV_URL=http://127.0.0.1:4392/')
  assert.deepEqual(resolve({ XPERT_DESKTOP_DEV_URL: 'http://localhost:4393/' }), {
    host: 'localhost',
    port: 4393,
    strictPort: true
  })
})

test('supports IPv6 loopback without exposing the development bridge externally', async (t) => {
  const resolve = await fixture(t)
  assert.deepEqual(resolve({ XPERT_DESKTOP_DEV_URL: 'http://[::1]:4392/' }), {
    host: '::1',
    port: 4392,
    strictPort: true
  })
})

test('rejects remote hosts, unsupported protocols and URLs that change the page origin or path', async (t) => {
  const resolve = await fixture(t)
  for (const value of [
    'http://0.0.0.0:4392/',
    'http://example.com:4392/',
    'https://localhost:4392/',
    'http://user:password@localhost:4392/',
    'http://localhost:4392/chat',
    'http://localhost:4392/?setting=value',
    'http://localhost:4392/#chat',
    'file:///tmp/index.html'
  ]) {
    assert.throws(() => resolve({ XPERT_DESKTOP_DEV_URL: value }), /XPERT_DESKTOP_DEV_URL/)
  }
})
