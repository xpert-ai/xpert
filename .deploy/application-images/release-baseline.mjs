// The checked snapshot owns the upstream policy, including during an unfinished merge.
// Fetch only the configured repository's main; never infer a baseline from merge messages
// or arbitrary remote branches. The planner limits adoption to already merged ancestry.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const policyFile = '.deploy/application-images/release-policy.json'
const baselineRef = 'refs/xpert/application-images/upstream-main'

export function releaseBaseline({ cwd, after }) {
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  if (!git('ls-tree', '--name-only', after, '--', policyFile)) return {}
  const policy = JSON.parse(git('show', `${after}:${policyFile}`))
  assert.ok(policy && typeof policy === 'object' && !Array.isArray(policy), 'Invalid application release policy')
  assert.equal(policy.retainedChangesetPolicy, 'candidate', 'Upstream main baselines require candidate retention')
  assert.ok(
    typeof policy.upstreamMainRepository === 'string' && policy.upstreamMainRepository.trim(),
    'Application release policy requires an upstream main repository'
  )
  try {
    git(
      'fetch',
      '--no-tags',
      '--no-recurse-submodules',
      '--no-write-fetch-head',
      '--',
      policy.upstreamMainRepository,
      `+refs/heads/main:${baselineRef}`
    )
  } catch (error) {
    throw new Error('Cannot refresh the configured upstream main release baseline; retry when it is reachable.', {
      cause: error
    })
  }
  return {
    upstreamMainSha: git('rev-parse', '--verify', `${baselineRef}^{commit}`),
    retainedChangesetPolicy: 'candidate'
  }
}
