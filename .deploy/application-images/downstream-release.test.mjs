import assert from 'node:assert/strict'
import { test } from 'node:test'
import { services } from './services.mjs'
import { releasePlan } from './release-plan.mjs'
import { fixture, mainSyncFixture, tags } from './release-test-fixture.mjs'
const [api, web] = services

const upstreamPlan = (f, options = {}) =>
  releasePlan({
    cwd: f.cwd,
    before: f.before,
    after: f.after,
    event: 'push',
    ref: 'refs/heads/main',
    upstreamMainSha: f.main,
    retainedChangesetPolicy: 'candidate',
    ...options
  })

test('explicit upstream baselines authorize only candidates on develop, main and PRs', (t) => {
  const f = mainSyncFixture(t)
  for (const [event, ref, channel] of [
    ['push', 'refs/heads/develop', 'develop'],
    ['push', 'refs/heads/main', 'main'],
    ['pull_request', 'refs/pull/1/merge', 'pr']
  ]) {
    const plan = upstreamPlan(f, { event, ref })
    assert.equal(plan.publish, event === 'push')
    assert.equal(plan.matrix.include.length, 2)
    for (const [index, image] of plan.matrix.include.entries()) {
      assert.equal(image.baseVersion, index === 0 ? '1.11.1' : '1.1.1')
      assert.equal(image.versioned, false)
      assert.equal(image.stable, false)
      assert.deepEqual(tags(image), [image.version, `sha-${f.after}`, `${channel}-candidate`])
    }
  }
})

test('a later upstream tip supplies only the baseline already merged into the checked source', (t) => {
  const f = mainSyncFixture(t)
  f.git('checkout', '--detach', f.main)
  f.version(api, '1.12.0')
  const [image] = upstreamPlan(f, { upstreamMainSha: f.commit() }).matrix.include
  assert.equal(image.baseVersion, '1.11.1')
  assert.equal(image.stable, false)
})

test('unmerged upstream versions and arbitrary local increases cannot become baselines', (t) => {
  const f = mainSyncFixture(t)
  f.git('checkout', '--detach', f.before)
  f.version(api, '1.11.0')
  assert.throws(() => upstreamPlan(f, { after: f.commit() }), /consume all pending/)
  f.git('checkout', '--detach', f.after)
  f.version(api, '1.12.0')
  assert.throws(() => upstreamPlan(f, { after: f.commit() }), /consume all pending/)
  assert.throws(() => upstreamPlan(f, { upstreamMainSha: 'upstream/main' }), /Exact upstream main commit SHA/)
})

test('upstream baseline adoption without remaining application notes cannot publish', (t) => {
  const f = mainSyncFixture(t)
  f.remove('downstream')
  const plan = upstreamPlan(f, { after: f.commit() })
  assert.equal(plan.publish, false)
  assert.equal(plan.validate, true)
  assert.deepEqual(plan.matrix.include, [])
})

test('adopting an upstream baseline preserves shared-package release declarations', (t) => {
  const f = mainSyncFixture(t)
  f.note('undeclared-shared', ['@xpert-ai/contracts'])
  assert.throws(() => upstreamPlan(f, { after: f.commit() }), /Missing application image release declarations/)
})

test('a new fixed group can align to the verified upstream baseline while retaining downstream notes', (t) => {
  const f = mainSyncFixture(t)
  f.write(
    '.changeset/config.json',
    JSON.stringify({ privatePackages: { version: true }, fixed: [[api.name, web.name]] })
  )
  f.version(web, '1.11.0')
  f.note('alignment', [api.name, web.name], 'minor')
  const plan = upstreamPlan(f, { after: f.commit() })
  assert.equal(plan.matrix.include.length, 2)
  assert.ok(plan.matrix.include.every((image) => image.baseVersion === '1.12.0' && !image.versioned && !image.stable))
})

test('a merge verifies upstream versioning notes absent from the main baseline and only builds candidates', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  const contracts = '@xpert-ai/contracts'
  f.note('old-web', [web.name, contracts])
  const before = f.commit()
  f.git('checkout', '-qb', 'upstream')
  f.note('upstream-minor', [api.name, web.name, contracts], 'minor')
  f.commit()
  f.remove('old-web')
  f.remove('upstream-minor')
  f.version(api, '1.1.0')
  f.version(web, '1.1.0')
  f.write('packages/contracts/package.json', JSON.stringify({ name: contracts, version: '1.1.0' }))
  const upstream = f.commit()

  f.git('checkout', '-qb', 'downstream', before)
  f.write(
    '.changeset/downstream-apps.md',
    `---\n'${api.name}': patch\n'${web.name}': patch\n---\nPublish downstream images after synchronizing upstream release tooling.\n`
  )
  f.commit()
  f.git(
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'user.name=Release tests',
    '-c',
    'user.email=test@example.invalid',
    'merge',
    '--no-ff',
    '-qm',
    'Sync upstream release',
    upstream
  )
  const after = f.git('rev-parse', 'HEAD')

  for (const [event, ref, channel] of [
    ['push', 'refs/heads/develop', 'develop'],
    ['push', 'refs/heads/main', 'main'],
    ['pull_request', 'refs/pull/1/merge', 'pr']
  ]) {
    const plan = f.plan(before, after, event, ref)
    assert.equal(plan.publish, event === 'push')
    assert.deepEqual(
      plan.matrix.include.map((image) => image.image_name),
      ['xpert-api', 'xpert-webapp']
    )
    for (const image of plan.matrix.include) {
      assert.equal(image.version, `1.1.1-candidate.${channel}.${after.slice(0, 12)}`)
      assert.equal(image.versioned, true)
      assert.equal(image.stable, false)
      assert.equal(image.target, 'candidate')
      assert.deepEqual(image.tags.split('\n'), [
        `type=raw,value=${image.version}`,
        `type=raw,value=sha-${after}`,
        `type=raw,value=${channel}-candidate`
      ])
      assert.ok(image.changesets.includes('.changeset/upstream-minor.md'))
      assert.ok(image.changesets.includes('.changeset/downstream-apps.md'))
    }
  }

  f.write('README.md', 'Source-only follow-up after the merge')
  const next = f.commit()
  assert.equal(f.plan(after, next, 'push', 'refs/heads/main').build, false)
  f.remove('downstream-apps')
  f.version(api, '1.1.1')
  f.version(web, '1.1.1')
  const released = f.plan(next, f.commit(), 'push', 'refs/heads/main')
  assert.equal(released.matrix.include.length, 2)
  assert.ok(released.matrix.include.every((image) => image.stable && image.version === '1.1.1'))
})

test('a merge verifies every upstream release in a continuous version chain', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  const contracts = '@xpert-ai/contracts'
  f.note('upstream-patch', [api.name, web.name, contracts])
  const before = f.commit()
  f.git('checkout', '-qb', 'upstream')
  f.remove('upstream-patch')
  f.version(api, '1.0.1')
  f.version(web, '1.0.1')
  f.write('packages/contracts/package.json', JSON.stringify({ name: contracts, version: '1.0.1' }))
  f.commit()
  f.note('upstream-minor', [api.name, web.name, contracts], 'minor')
  f.commit()
  f.remove('upstream-minor')
  f.version(api, '1.1.0')
  f.version(web, '1.1.0')
  f.write('packages/contracts/package.json', JSON.stringify({ name: contracts, version: '1.1.0' }))
  const upstream = f.commit()

  f.git('checkout', '-qb', 'downstream', before)
  f.write(
    '.changeset/downstream-apps.md',
    `---\n'${api.name}': patch\n'${web.name}': patch\n---\nPublish downstream candidates after synchronizing multiple upstream releases.\n`
  )
  f.commit()
  f.git(
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'user.name=Release tests',
    '-c',
    'user.email=test@example.invalid',
    'merge',
    '--no-ff',
    '-qm',
    'Sync two upstream releases',
    upstream
  )
  const after = f.git('rev-parse', 'HEAD')

  for (const [event, ref, channel] of [
    ['push', 'refs/heads/develop', 'develop'],
    ['push', 'refs/heads/main', 'main'],
    ['pull_request', 'refs/pull/1/merge', 'pr']
  ]) {
    const plan = f.plan(before, after, event, ref)
    assert.equal(plan.publish, event === 'push')
    assert.deepEqual(
      plan.matrix.include.map((image) => image.image_name),
      ['xpert-api', 'xpert-webapp']
    )
    for (const image of plan.matrix.include) {
      assert.equal(image.version, `1.1.1-candidate.${channel}.${after.slice(0, 12)}`)
      assert.equal(image.versioned, true)
      assert.equal(image.stable, false)
      assert.equal(image.target, 'candidate')
      assert.deepEqual(image.changesets, [
        '.changeset/upstream-patch.md',
        '.changeset/upstream-minor.md',
        '.changeset/downstream-apps.md'
      ])
      assert.deepEqual(image.tags.split('\n'), [
        `type=raw,value=${image.version}`,
        `type=raw,value=sha-${after}`,
        `type=raw,value=${channel}-candidate`
      ])
    }
  }
})

test('a valid final release cannot hide a missing intermediate application declaration', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.version(api, '1.0.1')
  f.commit()
  f.note('upstream-minor', [api.name], 'minor')
  f.commit()
  f.remove('upstream-minor')
  f.version(api, '1.1.0')
  f.commit()
  f.note('downstream-apps', [api.name])
  assert.throws(() => f.plan(f.initial, f.commit()), /Land .* Changesets before consuming them/)
})

test('a valid final release cannot hide an incorrect intermediate version bump', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.note('upstream-patch', [api.name])
  f.commit()
  f.remove('upstream-patch')
  f.version(api, '1.0.2')
  f.commit()
  f.note('upstream-minor', [api.name], 'minor')
  f.commit()
  f.remove('upstream-minor')
  f.version(api, '1.1.0')
  f.commit()
  f.note('downstream-apps', [api.name])
  assert.throws(() => f.plan(f.initial, f.commit()), /version must match its requested bump/)
})

test('every intermediate release still enforces shared package coverage', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  const contracts = '@xpert-ai/contracts'
  f.note('shared-only', [contracts])
  f.commit()
  f.remove('shared-only')
  f.version(api, '1.0.1')
  f.write('packages/contracts/package.json', JSON.stringify({ name: contracts, version: '1.0.1' }))
  f.commit()
  f.note('upstream-minor', [api.name], 'minor')
  f.commit()
  f.remove('upstream-minor')
  f.version(api, '1.1.0')
  f.commit()
  f.note('downstream-apps', [api.name])
  assert.throws(() => f.plan(f.initial, f.commit()), /Missing application image release declarations/)
})

test('release evidence from a sibling branch cannot fill an intermediate version gap', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.git('checkout', '-qb', 'patch')
  f.note('upstream-patch', [api.name])
  f.commit()
  f.remove('upstream-patch')
  f.version(api, '1.0.1')
  const patch = f.commit()
  f.git('checkout', '-qb', 'minor', f.initial)
  f.version(api, '1.0.1')
  f.commit()
  f.note('upstream-minor', [api.name], 'minor')
  f.commit()
  f.remove('upstream-minor')
  f.version(api, '1.1.0')
  f.commit()
  f.git(
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'user.name=Release tests',
    '-c',
    'user.email=test@example.invalid',
    'merge',
    '--no-ff',
    '-s',
    'ours',
    '-qm',
    'Retain sibling release history',
    patch
  )
  f.note('downstream-apps', [api.name])
  assert.throws(() => f.plan(f.initial, f.commit()), /Land .* Changesets before consuming them/)
})

test('fresh downstream notes cannot authorize a version bump without a verified upstream release', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.version(api, '1.1.0')
  f.commit()
  f.note('downstream-apps', [api.name])
  assert.throws(() => f.plan(f.initial, f.commit()), /Land .* Changesets before consuming them/)
})

test('merged upstream notes must still authorize the exact version increase', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.note('upstream-patch', [api.name])
  f.commit()
  f.remove('upstream-patch')
  f.version(api, '1.1.0')
  f.commit()
  f.note('downstream-apps', [api.name])
  assert.throws(() => f.plan(f.initial, f.commit()), /version must match its requested bump/)
})

test('historical source versioning without remaining downstream notes cannot promote stable tags', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.note('upstream', [api.name], 'minor')
  f.commit()
  f.remove('upstream')
  f.version(api, '1.1.0')
  const plan = f.plan(f.initial, f.commit(), 'push', 'refs/heads/main')
  assert.equal(plan.publish, false)
  assert.deepEqual(plan.matrix.include, [])
})

test('historical version evidence still enforces shared package release coverage', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  const contracts = '@xpert-ai/contracts'
  f.note('upstream-app', [api.name], 'minor')
  f.commit()
  f.remove('upstream-app')
  f.version(api, '1.1.0')
  f.write(
    '.changeset/undeclared-shared.md',
    `---\n'${contracts}': patch\n---\nIntroduce additional shared contract fields that require explicit API and Web release declarations.\n`
  )
  f.commit()
  f.remove('undeclared-shared')
  f.note('downstream-apps', [api.name])
  assert.throws(() => f.plan(f.initial, f.commit()), /Missing application image release declarations/)
})

test('an application version increase without consuming any pending note still fails', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.note('downstream-apps', [api.name])
  const before = f.commit()
  f.version(api, '1.0.1')
  assert.throws(() => f.plan(before, f.commit()), /consume all pending/)
})

test('fresh downstream notes beside consumed upstream notes also prevent stable promotion', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.note('upstream', [api.name], 'minor')
  const before = f.commit()
  f.remove('upstream')
  f.version(api, '1.1.0')
  f.write(
    '.changeset/downstream-new.md',
    `---\n'${api.name}': patch\n---\nA new downstream fix after synchronization.\n`
  )
  const after = f.commit()
  const [image] = f.plan(before, after, 'push', 'refs/heads/main').matrix.include
  assert.equal(image.baseVersion, '1.1.1')
  assert.equal(image.stable, false)
  assert.deepEqual(image.changesets, ['.changeset/upstream.md', '.changeset/downstream-new.md'])
})

test('aggregated fixed-group releases preserve the highest downstream candidate bump', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.write(
    '.changeset/config.json',
    JSON.stringify({ privatePackages: { version: true }, fixed: [[api.name, web.name]] })
  )
  const fork = f.commit()
  f.git('checkout', '-qb', 'upstream')
  f.note('upstream-api', [api.name])
  f.note('upstream-web', [web.name], 'minor')
  f.commit()
  f.remove('upstream-api')
  f.remove('upstream-web')
  f.version(api, '1.1.0')
  f.version(web, '1.1.0')
  const upstream = f.commit()
  f.git('checkout', '--detach', fork)
  f.note('downstream-api', [api.name])
  f.note('downstream-web', [web.name], 'major')
  const before = f.commit()
  f.git(
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'user.name=Release tests',
    '-c',
    'user.email=test@example.invalid',
    'merge',
    '--no-ff',
    '-qm',
    'Sync fixed-group release',
    upstream
  )
  const after = f.git('rev-parse', 'HEAD')
  const plan = f.plan(before, after, 'push', 'refs/heads/main')
  assert.equal(plan.matrix.include.length, 2)
  for (const [index, image] of plan.matrix.include.entries()) {
    assert.equal(image.baseVersion, '2.0.0')
    assert.equal(image.versioned, true)
    assert.equal(image.stable, false)
    assert.equal(image.target, 'candidate')
    assert.deepEqual(image.changesets, [`.changeset/upstream-${index === 0 ? 'api' : 'web'}.md`])
    assert.ok(!image.tags.includes('value=latest'))
  }
})

test('fixed-group upstream versioning retains downstream notes without authorizing stable tags', (t) => {
  const f = fixture(t, { retainedChangesetPolicy: 'candidate' })
  f.write(
    '.changeset/config.json',
    JSON.stringify({ privatePackages: { version: true }, fixed: [[api.name, web.name]] })
  )
  f.note('downstream-apps', [api.name, web.name])
  f.note('upstream-api', [api.name])
  f.note('upstream-web', [web.name], 'minor')
  const before = f.commit()
  f.remove('upstream-api')
  f.remove('upstream-web')
  f.version(api, '1.1.0')
  f.version(web, '1.1.0')
  const synced = f.commit()
  assert.throws(
    () => releasePlan({ cwd: f.cwd, before, after: synced, event: 'push', ref: 'refs/heads/main' }),
    /consume all pending/
  )
  const candidates = f.plan(before, synced, 'push', 'refs/heads/main').matrix.include
  assert.equal(candidates.length, 2)
  assert.ok(candidates.every((image) => image.baseVersion === '1.1.1' && image.versioned && !image.stable))
  f.remove('downstream-apps')
  f.version(api, '1.1.1')
  f.version(web, '1.1.1')
  const stable = f.plan(synced, f.commit(), 'push', 'refs/heads/main').matrix.include
  assert.equal(stable.length, 2)
  assert.ok(stable.every((image) => image.version === '1.1.1' && image.stable))
})
