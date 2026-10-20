import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import { chatkitPackages, selectVersions, validateCompatibility, validateLock } from './chatkit-locks.mjs'
import { updateChatkit } from './update-chatkit.mjs'

const catalog = Object.fromEntries(chatkitPackages.map((name) => [name, '~0.16.0']))
const selected = Object.fromEntries(chatkitPackages.map((name) => [name, '0.16.2']))
const published = Object.fromEntries(
  chatkitPackages.map((name) => [name, ['0.16.0', '0.16.2', '0.16.3-beta.1', '0.17.0']])
)
const metadata = Object.fromEntries(chatkitPackages.map((name) => [name, { name, version: '0.16.2' }]))

test('patch ranges exclude next minor and prereleases without changing the catalog', () => {
  assert.deepEqual(selectVersions(catalog, published), selected)
  assert.equal(catalog[chatkitPackages[0]], '~0.16.0')
  assert.throws(() => selectVersions(catalog, { ...published, [chatkitPackages[0]]: ['0.17.0'] }), /No stable release/)
})

test('declared cross-package incompatibilities stop the update', () => {
  validateCompatibility(selected, metadata)
  assert.throws(
    () =>
      validateCompatibility(selected, {
        ...metadata,
        [chatkitPackages[0]]: { ...metadata[chatkitPackages[0]], peerDependencies: { [chatkitPackages[1]]: '^0.17.0' } }
      }),
    /requires .*0.17.0/
  )
})

test('lock validation rejects divergent profiles and hidden transitive copies', () => {
  const entries = Object.fromEntries(
    chatkitPackages.map((name) => [name, { specifier: catalog[name], version: selected[name] }])
  )
  const lock = { catalogs: { default: entries }, packages: { [`${chatkitPackages[0]}@0.16.1`]: {} } }
  assert.throws(() => validateLock(stringify(lock), catalog, selected, chatkitPackages), /Duplicate ChatKit/)
  lock.packages = {}
  lock.catalogs.default[chatkitPackages[0]].version = '0.16.0'
  assert.throws(() => validateLock(stringify(lock), catalog, selected, chatkitPackages), /Profile version mismatch/)
})

function fixture(t, { fail = false, concurrent = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'chatkit-update-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), stringify({ catalog }))
  writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}\n')
  const oldLock = stringify({
    catalogs: {
      default: Object.fromEntries(
        chatkitPackages.map((name) => [name, { specifier: catalog[name], version: '0.16.0' }])
      )
    }
  })
  const locks = ['root.yaml', 'deploy.yaml']
  for (const lock of locks) writeFileSync(path.join(root, lock), oldLock)
  const setup = async () => ({
    sourceFiles: ['package.json', 'pnpm-workspace.yaml'],
    profiles: locks.map((lock) => ({
      lock,
      prepare(directory) {
        mkdirSync(directory, { recursive: true })
        copyFileSync(path.join(root, lock), path.join(directory, 'pnpm-lock.yaml'))
        copyFileSync(path.join(root, 'pnpm-workspace.yaml'), path.join(directory, 'pnpm-workspace.yaml'))
      }
    }))
  })
  let installs = 0
  const run = (args, cwd) => {
    if (args[0] === 'view') {
      if (args[2] === 'versions') return JSON.stringify(published[args[1]])
      return JSON.stringify(metadata[args[1].slice(0, args[1].lastIndexOf('@'))])
    }
    installs++
    if (fail && installs === 4) throw new Error('Simulated second profile failure')
    if (concurrent && installs === 4) writeFileSync(path.join(root, 'package.json'), '{"name":"edited"}\n')
    const workspace = parse(readFileSync(path.join(cwd, 'pnpm-workspace.yaml'), 'utf8'))
    const file = path.join(cwd, 'pnpm-lock.yaml')
    const lock = parse(readFileSync(file, 'utf8'))
    if (args.includes('--frozen-lockfile')) {
      validateLock(stringify(lock), catalog, selected, chatkitPackages)
      return
    }
    for (const name of chatkitPackages) {
      const range = workspace.catalog[name]
      lock.catalogs.default[name] = {
        specifier: range,
        version: range.startsWith('~') ? lock.catalogs.default[name].version : range
      }
    }
    writeFileSync(file, stringify(lock))
  }
  return { root, locks, oldLock, setup, run }
}

test('every profile receives the same selection while source manifests and catalog stay unchanged', async (t) => {
  const f = fixture(t)
  const before = readFileSync(path.join(f.root, 'pnpm-workspace.yaml'), 'utf8')
  await updateChatkit(f)
  for (const file of f.locks)
    validateLock(readFileSync(path.join(f.root, file), 'utf8'), catalog, selected, chatkitPackages)
  assert.equal(readFileSync(path.join(f.root, 'pnpm-workspace.yaml'), 'utf8'), before)
  assert.equal(readFileSync(path.join(f.root, 'package.json'), 'utf8'), '{"name":"fixture"}\n')
})

test('a later profile failure leaves all original locks intact', async (t) => {
  const f = fixture(t, { fail: true })
  await assert.rejects(updateChatkit(f), /second profile failure/)
  for (const file of f.locks) assert.equal(readFileSync(path.join(f.root, file), 'utf8'), f.oldLock)
})

test('concurrent source edits abort publication of generated locks without overwriting the edit', async (t) => {
  const f = fixture(t, { concurrent: true })
  await assert.rejects(updateChatkit(f), (error) => {
    assert.match(error.message, /Source changed during update/)
    assert.doesNotMatch(error.message, /fixture|edited/)
    return true
  })
  for (const file of f.locks) assert.equal(readFileSync(path.join(f.root, file), 'utf8'), f.oldLock)
  assert.equal(readFileSync(path.join(f.root, 'package.json'), 'utf8'), '{"name":"edited"}\n')
})
