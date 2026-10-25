import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

// Exercise the actual checkout shell against Git repositories, without credentials or network access.
const workflow = readFileSync(new URL('../workflows/nsjail-runner-validate.yml', import.meta.url), 'utf8')
const checkout = workflow.split('      - name: Check out repository\n')[1].split('\n      - name:')[0]
const script = checkout.split('        run: |\n')[1].replace(/^          /gm, '')

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'nsjail-checkout-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = join(root, 'source')
  const remote = join(root, 'repository.git')
  mkdirSync(source)
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git(source, 'init', '-q')
  git(source, 'config', 'core.hooksPath', '/dev/null')
  git(source, 'config', 'user.name', 'Checkout tests')
  git(source, 'config', 'user.email', 'checkout@example.invalid')
  git(root, 'init', '--bare', '-q', remote)
  git(source, 'remote', 'add', 'origin', remote)
  const commit = (content) => {
    writeFileSync(join(source, 'revision.txt'), content)
    git(source, 'add', 'revision.txt')
    git(source, '-c', 'commit.gpgsign=false', 'commit', '-qm', content)
    return git(source, 'rev-parse', 'HEAD')
  }
  const sha = commit('event revision')
  git(source, 'push', '-q', 'origin', 'HEAD:refs/heads/develop')
  const run = (sha, ref) => {
    const cwd = mkdtempSync(join(root, 'checkout-'))
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_SERVER_URL: pathToFileURL(root).href,
        GITHUB_REPOSITORY: 'repository',
        GITHUB_TOKEN: 'fixture-token',
        GITHUB_REF: ref,
        CHECKOUT_SHA: sha
      }
    })
    return { cwd, result }
  }
  return { source, remote, git, commit, sha, run }
}

test('workflow selects the event PR head or push SHA and keeps privileged fork gating', () => {
  assert.match(checkout, /CHECKOUT_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/)
  assert.match(
    workflow,
    /RUN_PRIVILEGED_PROBE: \$\{\{ github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository \}\}/
  )
})

test('PR checkout succeeds after its merge ref is deleted, including a head outside base branches', (t) => {
  const f = fixture(t)
  const head = f.commit('PR head')
  f.git(f.source, 'push', '-q', 'origin', 'HEAD:refs/pull/166/head', 'HEAD:refs/pull/166/merge')
  f.git(f.source, 'push', '-q', 'origin', ':refs/pull/166/merge')
  assert.throws(() => f.git(f.remote, 'rev-parse', '--verify', 'refs/pull/166/merge'))
  const { cwd, result } = f.run(head, 'refs/pull/166/merge')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(f.git(cwd, 'rev-parse', 'HEAD'), head)
  assert.equal(readFileSync(join(cwd, 'revision.txt'), 'utf8'), 'PR head')
  assert.doesNotMatch(f.git(cwd, 'config', '--local', '--list'), /extraheader|fixture-token|x-access-token/)
})

test('push checkout retains the event revision after the branch advances', (t) => {
  const f = fixture(t)
  f.commit('new branch tip')
  f.git(f.source, 'push', '-q', 'origin', 'HEAD:refs/heads/develop')
  const { cwd, result } = f.run(f.sha, 'refs/heads/develop')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(f.git(cwd, 'rev-parse', 'HEAD'), f.sha)
  assert.equal(readFileSync(join(cwd, 'revision.txt'), 'utf8'), 'event revision')
})

test('an unavailable or invalid SHA fails instead of checking out a different revision', (t) => {
  const f = fixture(t)
  for (const sha of ['f'.repeat(40), '', 'refs/heads/develop']) {
    const { cwd, result } = f.run(sha, 'refs/heads/develop')
    assert.notEqual(result.status, 0)
    assert.throws(() => f.git(cwd, 'rev-parse', '--verify', 'HEAD'), `unexpected HEAD for ${sha}: ${result.stderr}`)
  }
})
