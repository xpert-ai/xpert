import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { services } from './services.mjs'
import { releasePlan } from './release-plan.mjs'
const [api, web, jail] = services
const contracts = '@xpert-ai/contracts'
function fixture(t, { legacy = false } = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'application-images-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    writeFileSync(path.join(cwd, file), content)
  }
  const version = (service, value) =>
    write(service.manifest, JSON.stringify({ name: service.name, private: true, version: value }))
  const note = (id, names = [api.name], type = 'patch') =>
    write(
      `.changeset/${id}.md`,
      `---\n${names.map((name) => `'${name}': ${type}`).join('\n')}\n---\nPublish the requested images.\n`
    )
  const remove = (id) => rmSync(path.join(cwd, `.changeset/${id}.md`))
  const commit = () => {
    git('add', '.')
    git(
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'user.name=Release tests',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'fixture'
    )
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q')
  for (const service of services) if (!legacy || service !== jail) version(service, '1.0.0')
  for (const file of new Set(services.flatMap((service) => service.shared))) {
    const { name } = JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))
    write(file, JSON.stringify({ name, version: '1.0.0' }))
  }
  write('.changeset/config.json', JSON.stringify({ privatePackages: { version: true } }))
  const initial = commit()
  const plan = (before, after, event = 'push', ref = 'refs/heads/develop') =>
    releasePlan({ cwd, before, after, event, ref })
  return { cwd, git, write, version, note, remove, commit, initial, plan }
}
const tags = (image) => image.tags.split('\n').map((tag) => tag.replace('type=raw,value=', ''))

test('an API Changeset selects only API and publishes candidate/version/SHA tags', (t) => {
  const f = fixture(t)
  f.note('api', [api.name], 'minor')
  const after = f.commit(),
    plan = f.plan(f.initial, after)
  assert.equal(plan.publish, true)
  assert.equal(plan.matrix.include.length, 1)
  const [image] = plan.matrix.include
  assert.equal(image.image_name, 'xpert-api')
  assert.equal(image.target, 'candidate')
  assert.equal(image.version, `1.1.0-candidate.develop.${after.slice(0, 12)}`)
  assert.deepEqual(tags(image), [image.version, `sha-${after}`, 'develop-candidate'])
})
test('Web and NsJail Changesets select their own images; NsJail has no Docker target', (t) => {
  const f = fixture(t)
  f.note('web', [web.name])
  const before = f.commit()
  assert.deepEqual(
    f.plan(f.initial, before).matrix.include.map((image) => image.image_name),
    ['xpert-webapp']
  )
  f.note('jail', [jail.name])
  const [image] = f.plan(before, f.commit()).matrix.include
  assert.equal(image.image_name, 'xpert-nsjail-runner')
  assert.equal(image.target, '')
})
test('bootstrapping private NsJail metadata requires a Changeset and produces a candidate', (t) => {
  const f = fixture(t, { legacy: true })
  f.version(jail, '0.1.0')
  const metadata = f.commit()
  assert.equal(f.plan(f.initial, metadata).build, false)
  f.note('jail', [jail.name])
  assert.equal(f.plan(metadata, f.commit()).matrix.include[0].baseVersion, '0.1.1')
})
test('Desktop, unrelated npm notes, docs and source-only edits do not publish application images', (t) => {
  const f = fixture(t)
  f.note('desktop', ['@xpert-ai/desktop'])
  f.note('other', ['@xpert-ai/unrelated-plugin'])
  f.write('apps/api/src/example.ts', 'export const value = 1')
  f.write('README.md', 'documentation')
  const plan = f.plan(f.initial, f.commit())
  assert.equal(plan.build, false)
  assert.equal(plan.publish, false)
  assert.deepEqual(plan.matrix.include, [])
})
test('old, edited and renamed notes never repeatedly request candidate images', (t) => {
  const f = fixture(t)
  f.note('api')
  const before = f.commit()
  f.write('README.md', 'next')
  const source = f.commit()
  assert.equal(f.plan(before, source).build, false)
  f.note('api', [api.name], 'minor')
  const edited = f.commit()
  assert.equal(f.plan(source, edited).build, false)
  f.remove('api')
  f.note('renamed', [api.name], 'minor')
  assert.equal(f.plan(edited, f.commit()).build, false)
})
test('highest pending bump determines a newly requested candidate version', (t) => {
  const f = fixture(t)
  f.note('minor', [web.name], 'minor')
  const before = f.commit()
  f.note('patch', [web.name])
  assert.equal(f.plan(before, f.commit()).matrix.include[0].baseVersion, '1.1.0')
})
test('new main Changesets are candidates and cannot move main/latest', (t) => {
  const f = fixture(t)
  f.note('api')
  const [image] = f.plan(f.initial, f.commit(), 'push', 'refs/heads/main').matrix.include
  assert.equal(image.stable, false)
  assert.ok(tags(image).includes('main-candidate'))
  assert.ok(!tags(image).includes('latest'))
  assert.ok(!tags(image).includes('main'))
})
test('only consumed notes and matching versions on main produce stable images', (t) => {
  const f = fixture(t)
  f.note(
    'release',
    services.map((service) => service.name)
  )
  const before = f.commit()
  f.remove('release')
  for (const service of services) f.version(service, '1.0.1')
  const after = f.commit(),
    images = f.plan(before, after, 'push', 'refs/heads/main').matrix.include
  assert.equal(images.length, 3)
  for (const image of images) {
    assert.equal(image.version, '1.0.1')
    assert.equal(image.stable, true)
    assert.deepEqual(tags(image), ['1.0.1', `sha-${after}`, 'main', 'latest'])
  }
  assert.equal(images[0].target, 'production')
  assert.ok(f.plan(before, after).matrix.include.every((image) => !image.stable))
  assert.equal(f.plan(before, after, 'pull_request', 'refs/pull/1/merge').publish, false)
})
test('wrong version bumps and unconsumed notes fail before any image publication', (t) => {
  const f = fixture(t)
  f.note('api')
  const before = f.commit()
  f.version(api, '1.0.1')
  assert.throws(() => f.plan(before, f.commit()), /consume all pending/)
  f.remove('api')
  f.version(api, '2.0.0')
  assert.throws(() => f.plan(before, f.commit()), /requested bump/)
})
test('a version bump without a previously landed application note cannot publish', (t) => {
  const f = fixture(t)
  f.version(api, '1.0.1')
  const bumped = f.commit()
  assert.equal(f.plan(f.initial, bumped).build, false)
  f.note('api')
  assert.throws(() => f.plan(f.initial, f.commit()), /before consuming/)
})
test('new shared contracts notes require explicit API and Web image declarations', (t) => {
  const f = fixture(t)
  f.note('shared', [contracts])
  assert.throws(() => f.plan(f.initial, f.commit()), /Missing application image release declarations/)
  f.note('api')
  assert.throws(() => f.plan(f.initial, f.commit()), /@xpert-ai\/xpert-ui/)
  f.note('web', [web.name])
  assert.deepEqual(
    f.plan(f.initial, f.commit()).matrix.include.map((image) => image.image_name),
    ['xpert-api', 'xpert-webapp']
  )
})
test('server-ai requires API only; old pending shared notes do not affect unrelated pushes', (t) => {
  const f = fixture(t)
  f.note('shared', ['@xpert-ai/server-ai'])
  assert.throws(() => f.plan(f.initial, f.commit()), /@xpert-ai\/xpert-api/)
  f.note('api')
  const before = f.commit()
  assert.equal(f.plan(f.initial, before).matrix.include.length, 1)
  f.note('desktop', ['@xpert-ai/desktop'])
  assert.equal(f.plan(before, f.commit()).build, false)
})
test('consuming a shared release requires consuming application notes, not just requesting a new candidate', (t) => {
  const f = fixture(t)
  f.note('shared', [contracts])
  const before = f.commit()
  f.remove('shared')
  f.write('packages/contracts/package.json', JSON.stringify({ name: contracts, version: '1.0.1' }))
  f.note('apps', [api.name, web.name])
  assert.throws(() => f.plan(before, f.commit(), 'push', 'refs/heads/main'), /consume an application Changeset/)
})
test('matching application and shared releases pass the stable coverage check', (t) => {
  const f = fixture(t)
  f.note('shared', [contracts, api.name, web.name])
  const before = f.commit()
  f.remove('shared')
  f.write('packages/contracts/package.json', JSON.stringify({ name: contracts, version: '1.0.1' }))
  f.version(api, '1.0.1')
  f.version(web, '1.0.1')
  const images = f.plan(before, f.commit(), 'push', 'refs/heads/main').matrix.include
  assert.equal(images.length, 2)
  assert.ok(images.every((image) => image.stable))
})
test('PR uses merge base and never grants publishing permissions', (t) => {
  const f = fixture(t)
  f.note('base', [api.name], 'major')
  const base = f.commit()
  f.git('checkout', '--detach', f.initial)
  f.note('web', [web.name])
  const plan = f.plan(base, f.commit(), 'pull_request', 'refs/pull/1/merge')
  assert.equal(plan.publish, false)
  assert.equal(plan.matrix.include.length, 1)
  assert.equal(plan.matrix.include[0].baseVersion, '1.0.1')
})
test('tags, missing baselines, manual events and invalid version strings cannot release images', (t) => {
  const f = fixture(t)
  assert.equal(f.plan('0'.repeat(40), f.initial).build, false)
  assert.equal(f.plan(f.initial, f.initial, 'push', 'refs/tags/contracts@3.0.0').build, false)
  assert.throws(() => f.plan(f.initial, f.initial, 'workflow_dispatch'), /Unsupported/)
  assert.throws(() => f.plan('develop', f.initial), /Exact commit/)
  f.version(api, '1.0.0+metadata')
  assert.throws(() => f.plan(f.initial, f.commit()), /Invalid version/)
})
