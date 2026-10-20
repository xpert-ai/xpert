import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { checkPushReleases, checkStagedRelease } from './check-release.mjs'
import { services } from './services.mjs'

const [api, web, jail] = services
const contracts = '@xpert-ai/contracts'
const sdk = '@xpert-ai/plugin-sdk'
const script = fileURLToPath(new URL('./check-release.mjs', import.meta.url))
const hooks = fileURLToPath(new URL('../../git-hooks', import.meta.url))

function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'staged-release-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (file, value) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    writeFileSync(path.join(cwd, file), value)
  }
  const version = (file, value) => {
    const manifest = JSON.parse(readFileSync(path.join(cwd, file), 'utf8'))
    write(file, JSON.stringify({ ...manifest, version: value }))
  }
  const note = (id, names) =>
    write(`.changeset/${id}.md`, `---\n${names.map((name) => `'${name}': patch`).join('\n')}\n---\n${id}.\n`)
  const commit = () => {
    git('add', '.')
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture')
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'develop')
  git('config', 'user.name', 'Release hook test')
  git('config', 'user.email', 'test@example.invalid')
  for (const service of services)
    write(service.manifest, JSON.stringify({ name: service.name, private: true, version: '1.0.0' }))
  for (const file of new Set(services.flatMap((service) => service.shared))) {
    const { name } = JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'))
    write(file, JSON.stringify({ name, version: '1.0.0' }))
  }
  write('.changeset/config.json', JSON.stringify({ privatePackages: { version: true } }))
  const initial = commit()
  const check = () => checkStagedRelease({ cwd })
  const push = (before, after, ref = 'refs/heads/develop') => `refs/heads/develop ${after} ${ref} ${before}\n`
  return { cwd, git, write, version, note, commit, check, push, initial }
}

test('staged shared notes require new staged application notes; unstaged fixes cannot satisfy the gate', async (t) => {
  const f = fixture(t)
  f.note('shared', [contracts, sdk, api.name])
  f.git('add', '.changeset/shared.md')
  f.note('web', [web.name])
  const index = f.git('diff', '--cached', '--binary')
  await assert.rejects(f.check, (error) => {
    assert.match(error.message, /xpert-ui: add an application Changeset for @xpert-ai\/contracts/)
    assert.match(error.message, /xpert-ui: add an application Changeset for @xpert-ai\/plugin-sdk/)
    return true
  })
  assert.equal(f.git('diff', '--cached', '--binary'), index)
  assert.equal(f.git('rev-parse', 'HEAD'), f.initial)

  f.git('add', '.changeset/web.md')
  const staged = f.git('diff', '--cached', '--binary')
  f.write('.changeset/web.md', 'invalid unstaged editor contents')
  const result = await f.check()
  assert.equal(result.skipped, false)
  assert.deepEqual(
    result.plan.matrix.include.map(({ name }) => name),
    [api.name, web.name]
  )
  assert.equal(f.git('diff', '--cached', '--binary'), staged)
  assert.equal(f.git('rev-parse', 'HEAD'), f.initial)
})

test('staged NsJail runtime changes cannot skip the release check or use an unstaged note', async (t) => {
  const f = fixture(t)
  f.write('.deploy/nsjail-runner/runner.py', 'protocol 3')
  f.git('add', '.deploy/nsjail-runner/runner.py')
  f.note('nsjail', [jail.name])
  await assert.rejects(f.check, /nsjail-runner: add an application Changeset/)
  f.git('add', '.changeset/nsjail.md')
  const { plan } = await f.check()
  assert.deepEqual(
    plan.matrix.include.map(({ name }) => name),
    [jail.name]
  )
})

test('pre-push checks source-only NsJail changes across the complete outgoing batch', async (t) => {
  const f = fixture(t)
  f.write('.deploy/nsjail-runner/network.py', 'runtime fix')
  f.commit()
  f.write('README.md', 'later unrelated change')
  const broken = f.commit()
  await assert.rejects(
    () => checkPushReleases(f.push(f.initial, broken), { cwd: f.cwd }),
    /nsjail-runner: add an application Changeset/
  )
  f.note('nsjail', [jail.name])
  const fixed = f.commit()
  const [plan] = await checkPushReleases(f.push(f.initial, fixed, 'refs/heads/main'), { cwd: f.cwd })
  assert.equal(plan.matrix.include[0].image_name, 'xpert-nsjail-runner')
  assert.match(plan.matrix.include[0].tags, /main-candidate/)
})

test('editing an old application note does not satisfy a new shared package declaration', async (t) => {
  const f = fixture(t)
  f.note('old-web', [web.name])
  f.commit()
  f.note('shared', [contracts, api.name])
  f.write('.changeset/old-web.md', `---\n'${web.name}': patch\n---\nEdited old declaration.\n`)
  f.git('add', '.changeset')
  await assert.rejects(f.check, /xpert-ui: add an application Changeset/)
})

test('staged consumption and version bumps use the CI version rules', async (t) => {
  const f = fixture(t)
  f.note('release', [contracts, api.name, web.name])
  f.commit()
  f.git('rm', '.changeset/release.md')
  f.version(api.manifest, '1.0.2')
  f.version(web.manifest, '1.0.1')
  f.version('packages/contracts/package.json', '1.0.1')
  f.git('add', '.')
  await assert.rejects(f.check, /version must match its requested bump/)
  f.version(api.manifest, '1.0.1')
  f.git('add', api.manifest)
  assert.equal((await f.check()).skipped, false)
})

test('absent snapshot policy keeps staged and push checks strict despite an unstaged opt-in', async (t) => {
  const f = fixture(t)
  f.note('consumed', [api.name])
  f.note('retained', [api.name])
  const before = f.commit()
  f.git('rm', '.changeset/consumed.md')
  f.version(api.manifest, '1.0.1')
  f.git('add', api.manifest)
  f.write(
    '.deploy/application-images/release-policy.json',
    JSON.stringify({ upstreamMainRepository: f.cwd, retainedChangesetPolicy: 'candidate' })
  )
  await assert.rejects(f.check, /consume all pending/)
  f.git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Commit only staged release metadata')
  const after = f.git('rev-parse', 'HEAD')
  await assert.rejects(() => checkPushReleases(f.push(before, after), { cwd: f.cwd }), /consume all pending/)
  const baseline = spawnSync(
    'git',
    ['show-ref', '--verify', '--quiet', 'refs/xpert/application-images/upstream-main'],
    {
      cwd: f.cwd
    }
  )
  assert.equal(baseline.status, 1)
})

test('upstream policy must explicitly select candidate retention before any baseline fetch', async (t) => {
  const f = fixture(t)
  for (const [policy, message] of [
    [null, /Invalid application release policy/],
    [[], /Invalid application release policy/],
    [{ upstreamMainRepository: f.cwd }, /require candidate retention/],
    [{ upstreamMainRepository: f.cwd, retainedChangesetPolicy: 'reject' }, /require candidate retention/],
    [{ upstreamMainRepository: '', retainedChangesetPolicy: 'candidate' }, /requires an upstream main repository/]
  ]) {
    f.write('.deploy/application-images/release-policy.json', JSON.stringify(policy))
    f.git('add', '.deploy/application-images/release-policy.json')
    await assert.rejects(f.check, message)
  }
})

test('deletion-only staging is checked, while unrelated source changes skip the planner', async (t) => {
  const f = fixture(t)
  f.write('README.md', 'Documentation')
  f.note('unstaged', [contracts])
  f.git('add', 'README.md')
  assert.equal((await f.check()).skipped, true)
  f.git('reset', '-q')
  f.git('rm', '.changeset/config.json')
  await assert.rejects(f.check, /config\.json/)
})

test('pending merge ancestry preserves adoption of main versions', async (t) => {
  const f = fixture(t)
  f.note('released', [contracts, api.name, web.name])
  f.commit()
  f.git('checkout', '-qb', 'main')
  f.git('rm', '.changeset/released.md')
  f.version(api.manifest, '1.0.1')
  f.version(web.manifest, '1.0.1')
  f.version('packages/contracts/package.json', '1.0.1')
  const main = f.commit()
  f.git('checkout', '-q', 'develop')
  f.note('downstream', [api.name, web.name])
  const before = f.commit()
  f.git('-c', 'core.hooksPath=/dev/null', 'merge', '--no-ff', '--no-commit', 'main')
  const { plan } = await f.check()
  assert.equal(f.git('show', '-s', '--format=%P', plan.sha), `${before} ${main}`)
  assert.ok(plan.matrix.include.every((image) => !image.versioned && !image.stable))
  assert.equal(f.git('rev-parse', 'HEAD'), before)
  assert.equal(f.git('rev-parse', 'MERGE_HEAD'), main)
})

function upstreamAlignmentFixture(t, { merge = true } = {}) {
  const f = fixture(t)
  f.note('released', [contracts, sdk, api.name, web.name])
  f.commit()
  f.git('checkout', '-qb', 'main')
  f.git('rm', '.changeset/released.md')
  f.version(api.manifest, '1.0.1')
  f.version(web.manifest, '1.0.1')
  f.version('packages/contracts/package.json', '1.1.0')
  f.version('packages/plugin-sdk/package.json', '1.1.0')
  const main = f.commit()
  f.git('checkout', '-q', 'develop')
  f.note('downstream', [api.name, web.name])
  const before = f.commit()
  f.git('update-ref', 'refs/remotes/origin/main', f.initial)
  if (merge) f.git('-c', 'core.hooksPath=/dev/null', 'merge', '--no-ff', '--no-commit', 'main')
  f.write(
    '.deploy/application-images/release-policy.json',
    JSON.stringify({ upstreamMainRepository: f.cwd, retainedChangesetPolicy: 'candidate' })
  )
  f.write(
    '.changeset/config.json',
    JSON.stringify({ privatePackages: { version: true }, fixed: [[api.name, web.name, contracts, sdk]] })
  )
  for (const manifest of [
    api.manifest,
    web.manifest,
    'packages/contracts/package.json',
    'packages/plugin-sdk/package.json'
  ])
    f.version(manifest, '1.1.0')
  f.note('alignment', [api.name, web.name, contracts, sdk])
  f.git('add', '.')
  return { ...f, before, main }
}

test('staged upstream alignment refreshes the configured main without changing origin or the index', async (t) => {
  const f = upstreamAlignmentFixture(t)
  const staged = f.git('diff', '--cached', '--binary')
  f.write('.deploy/application-images/release-policy.json', 'invalid unstaged editor contents')
  const { plan } = await f.check()
  assert.equal(plan.matrix.include.length, 2)
  assert.ok(plan.matrix.include.every((image) => image.baseVersion === '1.1.1' && !image.versioned && !image.stable))
  assert.equal(f.git('rev-parse', 'refs/xpert/application-images/upstream-main'), f.main)
  assert.equal(f.git('rev-parse', 'refs/remotes/origin/main'), f.initial)
  assert.equal(f.git('diff', '--cached', '--binary'), staged)
  assert.equal(f.git('rev-parse', 'HEAD'), f.before)
  assert.equal(f.git('rev-parse', 'MERGE_HEAD'), f.main)
})

test('an upstream main that was not merged cannot authorize copied fixed-group versions', async (t) => {
  const f = upstreamAlignmentFixture(t, { merge: false })
  await assert.rejects(f.check, /consume all pending/)
})

test('pre-push uses the outgoing policy and a fresh upstream baseline across the whole merge', async (t) => {
  const f = upstreamAlignmentFixture(t)
  const after = f.commit()
  f.git('update-ref', 'refs/xpert/application-images/upstream-main', f.initial)
  f.write('.deploy/application-images/release-policy.json', 'invalid working-tree policy')
  const [plan] = await checkPushReleases(f.push(f.before, after, 'refs/heads/main'), { cwd: f.cwd })
  assert.equal(plan.matrix.include.length, 2)
  assert.ok(plan.matrix.include.every((image) => !image.versioned && !image.stable))
  assert.equal(f.git('rev-parse', 'refs/xpert/application-images/upstream-main'), f.main)
})

test('a failed upstream refresh rejects the check even when a cached baseline exists', async (t) => {
  const f = upstreamAlignmentFixture(t)
  f.git('update-ref', 'refs/xpert/application-images/upstream-main', f.main)
  f.write(
    '.deploy/application-images/release-policy.json',
    JSON.stringify({
      upstreamMainRepository: path.join(f.cwd, 'missing-upstream.git'),
      retainedChangesetPolicy: 'candidate'
    })
  )
  f.git('add', '.deploy/application-images/release-policy.json')
  await assert.rejects(f.check, /Cannot refresh the configured upstream main release baseline/)
})

test('configured upstream baselines retain the common NsJail release declaration check', async (t) => {
  const f = upstreamAlignmentFixture(t)
  f.write('.deploy/nsjail-runner/runner.py', 'runtime change')
  f.git('add', '.deploy/nsjail-runner/runner.py')
  await assert.rejects(f.check, /nsjail-runner: add an application Changeset/)
})

test('pre-push covers complete outgoing batches, including previously committed missing notes', async (t) => {
  const f = fixture(t)
  f.note('shared', [contracts, sdk, api.name])
  const broken = f.commit()
  f.write('README.md', 'Later unrelated commit')
  const later = f.commit()
  await assert.rejects(() => checkPushReleases(f.push(f.initial, later), { cwd: f.cwd }), /Missing application image/)
  f.note('web', [web.name])
  const fixed = f.commit()
  const plans = await checkPushReleases(f.push(f.initial, fixed), { cwd: f.cwd })
  assert.deepEqual(
    plans[0].matrix.include.map(({ name }) => name),
    [api.name, web.name]
  )
  assert.equal((await checkPushReleases(f.push(broken, fixed), { cwd: f.cwd })).length, 1)
  assert.deepEqual(await checkPushReleases(f.push(f.initial, fixed, 'refs/heads/feature'), { cwd: f.cwd }), [])
  assert.deepEqual(await checkPushReleases(f.push('0'.repeat(40), fixed), { cwd: f.cwd }), [])
  assert.deepEqual(await checkPushReleases(f.push(f.initial, '0'.repeat(40)), { cwd: f.cwd }), [])
})

test('the actual hooks block incomplete declarations before formatting or pushing', (t) => {
  const f = fixture(t)
  mkdirSync(path.join(f.cwd, '.deploy/application-images'), { recursive: true })
  f.write('.deploy/application-images/check-release.mjs', readFileSync(script, 'utf8'))
  symlinkSync(
    fileURLToPath(new URL('./release-plan.mjs', import.meta.url)),
    path.join(f.cwd, '.deploy/application-images/release-plan.mjs')
  )
  symlinkSync(
    fileURLToPath(new URL('./services.mjs', import.meta.url)),
    path.join(f.cwd, '.deploy/application-images/services.mjs')
  )
  symlinkSync(
    fileURLToPath(new URL('./release-baseline.mjs', import.meta.url)),
    path.join(f.cwd, '.deploy/application-images/release-baseline.mjs')
  )
  f.git('config', 'core.hooksPath', hooks)
  f.note('shared', [contracts, api.name])
  f.git('add', '.changeset')
  const result = spawnSync('git', ['commit', '-m', 'Incomplete release'], { cwd: f.cwd, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /xpert-ui: add an application Changeset/)
  assert.doesNotMatch(result.stdout + result.stderr, /format:fix/)
  assert.equal(f.git('rev-parse', 'HEAD'), f.initial)
  const broken = f.commit()
  const push = spawnSync('sh', [path.join(hooks, 'pre-push'), 'origin'], {
    cwd: f.cwd,
    encoding: 'utf8',
    input: f.push(f.initial, broken)
  })
  assert.equal(push.status, 1)
  assert.match(push.stderr, /xpert-ui: add an application Changeset/)
})
