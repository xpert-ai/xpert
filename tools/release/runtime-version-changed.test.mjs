import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./runtime-version-changed.mjs', import.meta.url))
function fixture(t) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'runtime-version-gate-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q')
  mkdirSync(path.join(cwd, 'packages/sandbox-runtime'), { recursive: true })
  const commit = (manifest) => {
    writeFileSync(path.join(cwd, 'packages/sandbox-runtime/package.json'), JSON.stringify(manifest))
    git('add', '.')
    git('-c', 'user.name=Release test', '-c', 'user.email=release-test@example.invalid', 'commit', '-qm', 'fixture')
    return git('rev-parse', 'HEAD')
  }
  const run = (before, after, event = 'push') =>
    execFileSync(process.execPath, [script], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        RUNTIME_RELEASE_EVENT: event,
        RUNTIME_RELEASE_BEFORE: before,
        RUNTIME_RELEASE_AFTER: after
      }
    }).trim()
  return { commit, run }
}

test('scripts and dependency changes without a version bump do not publish existing tags', (t) => {
  const { commit, run } = fixture(t)
  const before = commit({ version: '1.2.2', scripts: { verify: 'node verify.mjs' } })
  const after = commit({
    version: '1.2.2',
    scripts: { verify: 'node verify-all.mjs' },
    dependencies: { tool: '2.0.0' }
  })
  assert.equal(run(before, after), 'false')
})
test('a Changesets version bump enables Runtime publication', (t) => {
  const { commit, run } = fixture(t)
  const before = commit({ version: '1.2.2' })
  const after = commit({ version: '1.2.3' })
  assert.equal(run(before, after), 'true')
})
test('manual dispatch keeps the existing explicit publication behavior', (t) => {
  const { run } = fixture(t)
  assert.equal(run('', '', 'workflow_dispatch'), 'true')
})
test('invalid git history fails instead of enabling publication', (t) => {
  const { commit, run } = fixture(t)
  const after = commit({ version: '1.2.3' })
  assert.throws(() => run('0'.repeat(40), after), /Command failed/)
})
test('missing version metadata fails instead of enabling publication', (t) => {
  const { commit, run } = fixture(t)
  const before = commit({ version: '1.2.2' })
  const after = commit({ scripts: {} })
  assert.throws(() => run(before, after), /Missing Runtime Suite version/)
})
