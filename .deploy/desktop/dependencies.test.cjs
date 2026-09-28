const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { packages, forbidden, prepare, checkInstalled } = require('./dependencies.cjs')
test('Desktop lock selects only four required workspace packages and excludes server modules', () => {
  const lock = fs.readFileSync(path.join(__dirname, 'pnpm-lock.yaml'), 'utf8')
  const importers = lock.split('\nimporters:\n')[1].split('\npackages:\n')[0]
  assert.deepEqual(
    [...importers.matchAll(/^ {2}([^\s].*):$/gm)].map((match) => match[1]).sort(),
    ['.', ...packages].sort()
  )
  for (const name of forbidden) assert.equal(new RegExp(`^  ['"]?${name}@`, 'm').test(lock), false, name)
})
test('manifest workspace does not contain API, backend source or prebuilt output', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-deps-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  prepare(directory)
  for (const dir of packages) assert.deepEqual(fs.readdirSync(path.join(directory, dir)), ['package.json'])
  for (const dir of ['apps/api', 'packages/server-ai', 'packages/plugins'])
    assert.equal(fs.existsSync(path.join(directory, dir)), false)
})
test('installed Desktop dependencies cannot include the old native PTY dependency', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-installed-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const module = path.join(directory, 'node_modules/node-pty')
  fs.mkdirSync(module, { recursive: true })
  fs.writeFileSync(path.join(module, 'package.json'), '{"name":"node-pty"}')
  assert.throws(() => checkInstalled(directory), /must not install node-pty/)
})
