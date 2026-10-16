import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertMatchingBuildLocks, compilationTimings } from './benchmark-build.mjs'

test('large build locks are compared without buffering their contents', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'api-benchmark-lock-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim()
  git('init', '-q')
  mkdirSync(join(root, '.deploy/api'), { recursive: true })
  const lock = join(root, '.deploy/api/pnpm-lock.build.yaml')
  writeFileSync(lock, '# lock\n'.repeat(200000))
  git('add', '.')
  const baseline = git('write-tree')
  assert.doesNotThrow(() => assertMatchingBuildLocks(root, baseline, baseline))
  writeFileSync(lock, 'different dependencies')
  git('add', '.')
  assert.throws(() => assertMatchingBuildLocks(root, baseline, git('write-tree')), /identical API build/)
})

test('legacy compilation includes plugins and API, excluding dependency install', () => {
  const result = compilationTimings(`#10 [build 1/3] RUN pnpm install --frozen-lockfile
#10 DONE 90.0s
#11 [build 2/3] RUN pnpm build:plugins
#11 DONE 44.0s
#12 [build 3/3] RUN node -e "heap limit" && pnpm nx build api --verbose
#12 DONE 120.9s`)
  assert.equal(result.seconds, 164.9)
  assert.equal(result.steps.length, 2)
})

test('unified compilation is counted once and cached builds cannot masquerade as measurements', () => {
  assert.equal(compilationTimings('#10 [build 1/1] RUN node .deploy/api/build.mjs\n#10 DONE 81.2s').seconds, 81.2)
  assert.throws(
    () => compilationTimings('#10 [build 1/1] RUN node .deploy/api/build.mjs\n#10 CACHED'),
    /did not execute/
  )
  assert.throws(() => compilationTimings('#10 DONE 1.0s'), /No API compilation/)
})
