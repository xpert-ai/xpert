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
function fixture(t, { legacy = false, retainedChangesetPolicy } = {}) {
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
    releasePlan({ cwd, before, after, event, ref, retainedChangesetPolicy })
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
test('an API source fix reuses its pending note and publishes a new SHA candidate', (t) => {
  const f = fixture(t)
  f.note('api', [api.name], 'minor')
  const before = f.commit()
  f.write(
    'packages/server-ai/package.json',
    JSON.stringify({ name: '@xpert-ai/server-ai', version: '1.0.0', dependencies: { dagre: '1.0.0' } })
  )
  const after = f.commit()
  const plan = f.plan(before, after)
  assert.equal(plan.publish, true)
  assert.deepEqual(
    plan.matrix.include.map((image) => image.image_name),
    ['xpert-api']
  )
  assert.equal(plan.matrix.include[0].version, `1.1.0-candidate.develop.${after.slice(0, 12)}`)
  assert.deepEqual(plan.matrix.include[0].changesets, ['.changeset/api.md'])
  assert.equal(plan.validationMatrix.include[0].publish, true)
})
test('pending notes authorize only the application affected by a source fix', (t) => {
  const f = fixture(t)
  f.note(
    'all',
    services.map((service) => service.name)
  )
  let before = f.commit()
  for (const [file, expected] of [
    ['apps/cloud/src/example.ts', 'xpert-webapp'],
    ['.deploy/nsjail-runner/runner.py', 'xpert-nsjail-runner'],
    ['.deploy/api/pnpm-lock.production.yaml', 'xpert-api'],
    ['tools/release/catalog-dependencies.mjs', 'xpert-api'],
    ['packages/server-ai/src/example.ts', 'xpert-api']
  ]) {
    f.write(file, 'fix')
    const after = f.commit()
    assert.deepEqual(
      f.plan(before, after).matrix.include.map((image) => image.image_name),
      [expected]
    )
    before = after
  }
})
test('shared source and common lock fixes rebuild their pending consumers', (t) => {
  const f = fixture(t)
  f.note(
    'all',
    services.map((service) => service.name)
  )
  let before = f.commit()
  for (const file of ['packages/contracts/src/example.ts', 'pnpm-lock.yaml', '.deploy/api/entrypoint.prod.sh']) {
    f.write(file, 'fix')
    const after = f.commit()
    assert.deepEqual(
      f.plan(before, after).matrix.include.map((image) => image.image_name),
      ['xpert-api', 'xpert-webapp']
    )
    before = after
  }
})
test('source changes without a release note are validated on PRs and pushes but never published', (t) => {
  const f = fixture(t)
  f.write('apps/api/src/example.ts', 'fix')
  const after = f.commit()
  for (const event of ['push', 'pull_request']) {
    const plan = f.plan(f.initial, after, event)
    assert.equal(plan.publish, false)
    assert.equal(plan.validate, true)
    assert.deepEqual(plan.matrix.include, [])
    assert.deepEqual(
      plan.validationMatrix.include.map((image) => image.image_name),
      ['xpert-api']
    )
    assert.equal(plan.validationMatrix.include[0].publish, false)
    assert.equal(plan.validationMatrix.include[0].target, 'production')
  }
})
test('a pending-note repair on main remains a candidate, including in its PR', (t) => {
  const f = fixture(t)
  f.note('api')
  const before = f.commit()
  f.write('.deploy/api/Dockerfile', 'fix')
  const after = f.commit()
  for (const event of ['push', 'pull_request']) {
    const plan = f.plan(before, after, event, 'refs/heads/main')
    assert.equal(plan.matrix.include[0].stable, false)
    assert.ok(!tags(plan.matrix.include[0]).includes('latest'))
    assert.equal(plan.validationMatrix.include[0].publish, event === 'push')
  }
})
test('docs, desktop and changeset-only edits do not rebuild pending application images', (t) => {
  const f = fixture(t)
  f.note('api')
  const before = f.commit()
  f.write('docs/fix.md', 'explanation')
  f.write('.deploy/api/README.md', 'explanation')
  f.write('apps/desktop/src/example.ts', 'fix')
  const plan = f.plan(before, f.commit())
  assert.equal(plan.validate, false)
  assert.equal(plan.publish, false)
})
test('deleted source and renamed files still validate affected applications', (t) => {
  const f = fixture(t)
  f.note('api')
  f.write('apps/api/src/example.ts', 'original')
  const before = f.commit()
  f.git('mv', 'apps/api/src/example.ts', 'packages/server-ai/example.ts')
  const moved = f.commit()
  assert.equal(f.plan(before, moved).publish, true)
  f.git('rm', 'packages/server-ai/example.ts')
  assert.equal(f.plan(moved, f.commit()).publish, true)
})
test('pipeline changes validate all applications, but publish only declared candidates', (t) => {
  const f = fixture(t)
  f.note('api')
  const before = f.commit()
  f.write('.github/workflows/docker-publish.yml', 'fix')
  const plan = f.plan(before, f.commit())
  assert.equal(plan.validationMatrix.include.length, 3)
  assert.deepEqual(
    plan.matrix.include.map((image) => image.image_name),
    ['xpert-api']
  )
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
test('the default policy rejects partial consumption even when the consumed bump matches', (t) => {
  const f = fixture(t)
  f.note('upstream', [api.name], 'minor')
  f.note('downstream', [api.name])
  const before = f.commit()
  f.remove('upstream')
  f.version(api, '1.1.0')
  assert.throws(() => f.plan(before, f.commit()), /consume all pending/)
})
test('retained notes produce candidates until a complete release consumes them', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.note('downstream', [api.name, web.name])
  f.note('upstream', [api.name, web.name, contracts], 'minor')
  const before = f.commit()
  f.remove('upstream')
  f.version(api, '1.1.0')
  f.version(web, '1.1.0')
  f.write('packages/contracts/package.json', JSON.stringify({ name: contracts, version: '1.1.0' }))
  const synced = f.commit()

  for (const [event, ref, channel] of [
    ['push', 'refs/heads/develop', 'develop'],
    ['push', 'refs/heads/main', 'main'],
    ['pull_request', 'refs/pull/1/merge', 'pr']
  ]) {
    const plan = f.plan(before, synced, event, ref)
    assert.equal(plan.publish, event === 'push')
    assert.deepEqual(
      plan.matrix.include.map((image) => image.image_name),
      ['xpert-api', 'xpert-webapp']
    )
    for (const image of plan.matrix.include) {
      assert.equal(image.version, `1.1.1-candidate.${channel}.${synced.slice(0, 12)}`)
      assert.equal(image.versioned, true)
      assert.equal(image.stable, false)
      assert.equal(image.target, 'candidate')
      assert.deepEqual(image.changesets, ['.changeset/upstream.md'])
      assert.deepEqual(tags(image), [image.version, `sha-${synced}`, `${channel}-candidate`])
    }
  }

  f.write('README.md', 'A source-only push after synchronization')
  const next = f.commit()
  assert.equal(f.plan(synced, next).build, false)
  f.remove('downstream')
  f.version(api, '1.1.1')
  f.version(web, '1.1.1')
  const released = f.commit()
  const plan = f.plan(next, released, 'push', 'refs/heads/main')
  assert.equal(plan.matrix.include.length, 2)
  for (const image of plan.matrix.include) {
    assert.equal(image.stable, true)
    assert.equal(image.target, 'production')
    assert.deepEqual(tags(image), ['1.1.1', `sha-${released}`, 'main', 'latest'])
  }
})
test('retained bumps cannot justify an incorrect version increase', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.note('retained-major', [api.name], 'major')
  f.note('consumed-patch', [api.name])
  const before = f.commit()
  f.remove('consumed-patch')
  f.version(api, '2.0.0')
  assert.throws(() => f.plan(before, f.commit()), /version must match its requested bump/)
  f.version(api, '1.0.1')
  const [image] = f.plan(before, f.commit()).matrix.include
  assert.equal(image.baseVersion, '2.0.0')
  assert.equal(image.stable, false)
})
test('candidate retention still requires consuming an application note before a version increase', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.note('retained', [api.name])
  const before = f.commit()
  f.version(api, '1.0.1')
  assert.throws(() => f.plan(before, f.commit()), /consume all pending/)
})
test('fresh notes beside consumed notes also prevent stable promotion under candidate retention', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.note('upstream', [api.name], 'minor')
  const before = f.commit()
  f.remove('upstream')
  f.version(api, '1.1.0')
  // Distinct release text keeps Git from treating this new note as a rename.
  f.write(
    '.changeset/downstream-new.md',
    `---\n'${api.name}': patch\n---\nFix downstream API configuration after synchronization.\n`
  )
  const after = f.commit()
  const [image] = f.plan(before, after, 'push', 'refs/heads/main').matrix.include
  assert.equal(image.baseVersion, '1.1.1')
  assert.equal(image.stable, false)
  assert.deepEqual(tags(image), [image.version, `sha-${after}`, 'main-candidate'])
  assert.deepEqual(image.changesets, ['.changeset/upstream.md', '.changeset/downstream-new.md'])
})
test('application selection scopes validation while the default still checks NsJail', (t) => {
  const f = fixture(t)
  f.note('nsjail', [jail.name])
  const before = f.commit()
  f.remove('nsjail')
  f.version(jail, '2.0.0')
  const after = f.commit()
  assert.throws(() => f.plan(before, after), /version must match its requested bump/)
  const options = { cwd: f.cwd, before, after, event: 'push', ref: 'refs/heads/develop' }
  assert.equal(releasePlan({ ...options, applicationNames: [api.name, web.name] }).build, false)
  assert.throws(
    () => releasePlan({ ...options, applicationNames: ['unknown'] }),
    /Unsupported application image selection/
  )
})
test('application selection scopes shared-package coverage and still enforces selected consumers', (t) => {
  const f = fixture(t)
  f.note('shared', [contracts])
  const options = {
    cwd: f.cwd,
    before: f.initial,
    event: 'push',
    ref: 'refs/heads/develop',
    applicationNames: [api.name]
  }
  assert.throws(
    () => releasePlan({ ...options, after: f.commit() }),
    /Missing application image release declarations:[\s\S]*@xpert-ai\/xpert-api/
  )
  f.note('api', [api.name])
  const after = f.commit()
  assert.throws(() => f.plan(f.initial, after), /@xpert-ai\/xpert-ui/)
  const plan = releasePlan({ ...options, after })
  assert.equal(plan.publish, true)
  assert.deepEqual(
    plan.matrix.include.map((image) => image.image_name),
    ['xpert-api']
  )
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
