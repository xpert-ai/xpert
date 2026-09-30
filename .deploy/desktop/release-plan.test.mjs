import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
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
  const plan = (before, after, event = 'push', ref = 'refs/heads/develop') =>
    releasePlan({ cwd, before, after, event, ref })
  return { cwd, git, write, version, note, remove, commit, initial, plan }
}
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
test('PR uses merge base and can never authorize a stable draft', (t) => {
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
  assert.equal(f.plan(before, after).stable, false)
})
test('dependency-only version bumps do not accidentally release Desktop', (t) => {
  const f = fixture(t)
  f.version('0.1.1')
  assert.equal(f.plan(f.initial, f.commit(), 'push', 'refs/heads/main').build, false)
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
