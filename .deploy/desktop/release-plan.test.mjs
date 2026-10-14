import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { packageName, platforms, releasePlan } from './release-plan.mjs'
function fixture(t, { desktop = true } = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'desktop-release-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const write = (file, value) => {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
    writeFileSync(path.join(cwd, file), value)
  }
  const version = (value) =>
    write('apps/desktop/package.json', JSON.stringify({ name: packageName, private: true, version: value }))
  const note = (id, type = 'patch', name = packageName) =>
    write(`.changeset/${id}.md`, `---\n'${name}': ${type}\n---\nBuild Desktop.\n`)
  const remove = (id) => rmSync(path.join(cwd, `.changeset/${id}.md`))
  const commit = () => {
    git('add', '.')
    git(
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'user.name=Desktop tests',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'fixture'
    )
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q')
  if (desktop) version('0.1.0')
  write('.changeset/config.json', JSON.stringify({ privatePackages: { version: true } }))
  const initial = commit()
  const plan = (before, after, event = 'push', ref = 'refs/heads/develop', mainSha) =>
    releasePlan({ cwd, before, after, event, ref, mainSha })
  return { cwd, git, write, version, note, remove, commit, initial, plan }
}

function mainSyncFixture(t, { newNote = true } = {}) {
  const f = fixture(t)
  f.note('released', 'minor')
  const fork = f.commit()
  f.remove('released')
  f.version('0.2.0')
  f.commit()
  f.note('next-release', 'minor')
  f.commit()
  f.remove('next-release')
  f.version('0.3.0')
  const main = f.commit()
  f.git('checkout', '--detach', fork)
  f.note('retained')
  const before = f.commit()
  f.git(
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'user.name=Desktop tests',
    '-c',
    'user.email=test@example.invalid',
    'merge',
    '--no-ff',
    '-qm',
    'Sync main',
    main
  )
  if (newNote) {
    f.note('repair')
    f.commit()
  }
  return { ...f, main, before, after: f.git('rev-parse', 'HEAD') }
}

test('newly merged main versions allow new notes to request candidates without consuming retained notes', (t) => {
  const f = mainSyncFixture(t)
  assert.throws(() => f.plan(f.before, f.after), /consume/)
  for (const [event, ref] of [
    ['push', 'refs/heads/develop'],
    ['pull_request', 'refs/pull/1/merge']
  ]) {
    const plan = f.plan(f.before, f.after, event, ref, f.main)
    assert.equal(plan.version, `0.3.1-candidate.develop.${f.after.slice(0, 12)}`)
    assert.equal(plan.tag, `desktop-v${plan.version}`)
    assert.equal(plan.stable, false)
    assert.deepEqual(plan.changesets, ['.changeset/repair.md'])
    assert.deepEqual(plan.matrix.include, platforms)
  }
  assert.throws(() => f.plan(f.before, f.after, 'push', 'refs/heads/main', f.main), /consume/)
})

test('retained higher bumps determine the candidate version after main synchronization', (t) => {
  const f = mainSyncFixture(t)
  f.note('retained', 'minor')
  const plan = f.plan(f.before, f.commit(), 'push', 'refs/heads/develop', f.main)
  assert.equal(plan.baseVersion, '0.4.0')
  assert.deepEqual(plan.changesets, ['.changeset/repair.md'])
})

test('only the main ancestor actually merged into the source can establish its version baseline', (t) => {
  const f = mainSyncFixture(t)
  f.git('checkout', '--detach', f.main)
  f.version('0.4.0')
  const laterMain = f.commit()
  const plan = f.plan(f.before, f.after, 'push', 'refs/heads/develop', laterMain)
  assert.equal(plan.baseVersion, '0.3.1')
})

test('an unmerged main version does not justify a local Desktop version increase', (t) => {
  const f = mainSyncFixture(t)
  f.git('checkout', '--detach', f.before)
  f.version('0.3.0')
  f.note('repair')
  assert.throws(() => f.plan(f.before, f.commit(), 'push', 'refs/heads/develop', f.main), /consume/)
})

test('different versions and previously merged main history still enforce consumption checks', (t) => {
  const f = mainSyncFixture(t)
  f.version('0.4.0')
  const after = f.commit()
  assert.throws(() => f.plan(f.before, after, 'push', 'refs/heads/develop', f.main), /requested bump/)
  assert.throws(() => f.plan(f.after, after, 'push', 'refs/heads/develop', f.main), /requested bump/)
})

test('main synchronization without a new Desktop note does not request installers', (t) => {
  const f = mainSyncFixture(t, { newNote: false })
  assert.equal(f.plan(f.before, f.after, 'push', 'refs/heads/develop', f.main).build, false)
  f.remove('retained')
  assert.equal(f.plan(f.before, f.commit(), 'push', 'refs/heads/develop', f.main).build, false)
})

test('later source edits and renamed notes do not rebuild a synchronized candidate', (t) => {
  const f = mainSyncFixture(t)
  f.write('apps/desktop/source.txt', 'repair')
  const source = f.commit()
  assert.equal(f.plan(f.after, source, 'push', 'refs/heads/develop', f.main).build, false)
  f.git('mv', '.changeset/repair.md', '.changeset/renamed.md')
  assert.equal(f.plan(source, f.commit(), 'push', 'refs/heads/develop', f.main).build, false)
  assert.throws(() => f.plan(f.before, f.after, 'push', 'refs/heads/develop', 'main'), /Exact main commit SHA/)
})

test('the CLI passes the pinned main SHA and exports the candidate plan to Actions', (t) => {
  const f = mainSyncFixture(t)
  const output = path.join(f.cwd, 'actions-output')
  const stdout = execFileSync(process.execPath, [fileURLToPath(new URL('./release-plan.mjs', import.meta.url))], {
    cwd: f.cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      DESKTOP_RELEASE_BEFORE: f.before,
      DESKTOP_RELEASE_AFTER: f.after,
      DESKTOP_RELEASE_EVENT: 'push',
      DESKTOP_RELEASE_REF: 'refs/heads/develop',
      DESKTOP_RELEASE_MAIN: f.main,
      GITHUB_OUTPUT: output
    }
  })
  const plan = JSON.parse(stdout)
  assert.equal(plan.baseVersion, '0.3.1')
  assert.equal(plan.stable, false)
  const exported = readFileSync(output, 'utf8')
  assert.match(exported, /^build=true\nstable=false\n/)
  assert.ok(exported.includes(`plan=${JSON.stringify(plan)}\n`))
})
test('new Desktop notes build all six native platform/architecture pairs', (t) => {
  const f = fixture(t)
  f.note('desktop', 'minor')
  const after = f.commit()
  const result = f.plan(f.initial, after)
  assert.equal(result.version, `0.2.0-candidate.develop.${after.slice(0, 12)}`)
  assert.equal(result.stable, false)
  assert.equal(new Set(result.matrix.include.map((target) => target.id)).size, 6)
  assert.equal(result.matrix.include.filter((target) => target.arch === 'arm64').length, 3)
})
test('first Desktop merge creates a candidate and requires a later version bump for a stable release', (t) => {
  const f = fixture(t, { desktop: false })
  f.version('0.1.0')
  f.note('desktop', 'minor')
  const introduced = f.commit()
  for (const event of ['push', 'pull_request']) {
    const result = f.plan(f.initial, introduced, event, 'refs/heads/main')
    assert.equal(result.version, `0.2.0-candidate.main.${introduced.slice(0, 12)}`)
    assert.equal(result.stable, false)
    assert.equal(result.matrix.include.length, 6)
  }
  f.remove('desktop')
  f.version('0.2.0')
  const released = f.plan(introduced, f.commit(), 'push', 'refs/heads/main')
  assert.equal(released.version, '0.2.0')
  assert.equal(released.stable, true)
})
test('introducing Desktop without a Desktop changeset does not authorize a build', (t) => {
  const f = fixture(t, { desktop: false })
  f.version('0.1.0')
  f.note('other', 'minor', '@xpert-ai/contracts')
  const after = f.commit()
  for (const event of ['push', 'pull_request']) {
    assert.equal(f.plan(f.initial, after, event, 'refs/heads/main').build, false)
  }
})
test('unrelated changesets and source edits do not start installer builds', (t) => {
  const f = fixture(t)
  f.note('other', 'minor', '@xpert-ai/contracts')
  f.write('apps/desktop/change.txt', 'source')
  assert.equal(f.plan(f.initial, f.commit()).build, false)
})
test('existing, edited or renamed Desktop notes cannot request a second candidate', (t) => {
  const f = fixture(t)
  f.note('desktop')
  const before = f.commit()
  f.write('apps/desktop/source.txt', 'changed')
  const source = f.commit()
  assert.equal(f.plan(before, source).build, false)
  f.note('desktop', 'minor')
  const edited = f.commit()
  assert.equal(f.plan(source, edited).build, false)
  f.remove('desktop')
  f.note('renamed', 'minor')
  assert.equal(f.plan(edited, f.commit()).build, false)
})
test('highest pending bump determines the candidate version', (t) => {
  const f = fixture(t)
  f.note('minor', 'minor')
  const before = f.commit()
  f.note('patch')
  assert.equal(f.plan(before, f.commit()).baseVersion, '0.2.0')
})
test('PR uses merge base and can never authorize a stable release', (t) => {
  const f = fixture(t)
  f.note('target', 'major')
  const target = f.commit()
  f.git('checkout', '--detach', f.initial)
  f.note('desktop')
  const head = f.commit()
  const result = f.plan(target, head, 'pull_request', 'refs/pull/1/merge')
  assert.equal(result.baseVersion, '0.1.1')
  assert.equal(result.stable, false)
})
test('main requires consumed notes and a matching version for stable builds', (t) => {
  const f = fixture(t)
  f.note('desktop')
  const before = f.commit()
  assert.equal(f.plan(f.initial, before, 'push', 'refs/heads/main').stable, false)
  f.remove('desktop')
  f.version('0.1.1')
  const after = f.commit()
  const result = f.plan(before, after, 'push', 'refs/heads/main')
  assert.equal(result.version, '0.1.1')
  assert.equal(result.tag, 'desktop-v0.1.1')
  assert.equal(result.stable, true)
  assert.equal(f.plan(before, after, 'push', 'refs/heads/main', after).stable, true)
  assert.equal(f.plan(before, after).stable, false)
})
test('dependency-only version bumps do not accidentally release Desktop', (t) => {
  const f = fixture(t)
  f.version('0.1.1')
  assert.equal(f.plan(f.initial, f.commit(), 'push', 'refs/heads/main').build, false)
})
test('a missing Desktop changeset can be repaired after a dependency-only version bump', (t) => {
  const f = fixture(t)
  f.version('0.3.3')
  const baseline = f.commit()
  f.note('contracts', 'patch', '@xpert-ai/contracts')
  f.write('apps/desktop/source.txt', 'Assistant template installation and lifecycle updates')
  const source = f.commit()
  assert.deepEqual(f.plan(baseline, source, 'push', 'refs/heads/main'), {
    build: false,
    reason: 'No new Desktop changeset'
  })

  f.remove('contracts')
  f.version('0.3.4')
  const dependencyBump = f.commit()
  assert.deepEqual(f.plan(source, dependencyBump, 'push', 'refs/heads/main'), {
    build: false,
    reason: 'No Desktop changeset: dependency-only or unrequested version bump'
  })

  f.note('desktop-repair')
  const repair = f.commit()
  for (const [event, ref, branch] of [
    ['pull_request', 'refs/pull/1/merge', 'develop'],
    ['push', 'refs/heads/main', 'main']
  ]) {
    const candidate = f.plan(dependencyBump, repair, event, ref, dependencyBump)
    assert.equal(candidate.build, true)
    assert.equal(candidate.stable, false)
    assert.equal(candidate.baseVersion, '0.3.5')
    assert.equal(candidate.version, `0.3.5-candidate.${branch}.${repair.slice(0, 12)}`)
    assert.equal(candidate.tag, `desktop-v${candidate.version}`)
    assert.deepEqual(candidate.changesets, ['.changeset/desktop-repair.md'])
    assert.deepEqual(candidate.matrix.include, platforms)
    assert.equal(candidate.matrix.include.length, 6)
  }

  f.remove('desktop-repair')
  f.version('0.3.5')
  const versioned = f.commit()
  const stable = f.plan(repair, versioned, 'push', 'refs/heads/main', versioned)
  assert.equal(stable.build, true)
  assert.equal(stable.stable, true)
  assert.equal(stable.version, '0.3.5')
  assert.equal(stable.tag, 'desktop-v0.3.5')
  assert.deepEqual(stable.changesets, ['.changeset/desktop-repair.md'])
  assert.deepEqual(stable.matrix.include, platforms)

  // The repair must land before its version PR so the push baseline contains the release request.
  assert.deepEqual(f.plan(dependencyBump, versioned, 'push', 'refs/heads/main'), {
    build: false,
    reason: 'No Desktop changeset: dependency-only or unrequested version bump'
  })
})
test('wrong version or unconsumed Desktop notes fail closed', (t) => {
  const f = fixture(t)
  f.note('desktop')
  const before = f.commit()
  f.version('0.1.1')
  assert.throws(() => f.plan(before, f.commit()), /consume/)
  f.remove('desktop')
  f.version('1.0.0')
  assert.throws(() => f.plan(before, f.commit()), /requested bump/)
})
test('tags, new branches and manual dispatch cannot bypass Changesets', (t) => {
  const f = fixture(t)
  assert.equal(f.plan('0'.repeat(40), f.initial).build, false)
  assert.equal(f.plan(f.initial, f.initial, 'push', 'refs/tags/v1.0.0').build, false)
  assert.throws(() => f.plan(f.initial, f.initial, 'workflow_dispatch'), /Unsupported/)
})
