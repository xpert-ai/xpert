import assert from 'node:assert/strict'
import { test } from 'node:test'
import { retryPlan } from './retry-publication.mjs'

const sha = 'a'.repeat(40),
  mainSha = 'b'.repeat(40)
function fixture() {
  return {
    runId: '123',
    repository: 'xpert-ai/xpert',
    mainSha,
    run: {
      id: 123,
      head_repository: { full_name: 'xpert-ai/xpert' },
      path: '.github/workflows/docker-publish.yml',
      event: 'push',
      head_branch: 'main',
      status: 'completed',
      head_sha: sha
    },
    jobs: [
      { name: 'Check application image Changesets', conclusion: 'success' },
      { name: 'build / Build and verify xpert-webapp', conclusion: 'success' }
    ],
    artifacts: [{ name: `verified-xpert-webapp-${sha}`, expired: false, workflow_run: { id: 123 } }],
    git: (...args) => (args[0] === 'diff' ? '.deploy/application-images/publish-verified-image.mjs\0' : '')
  }
}

test('publisher-only repairs recover the original artifact and bind promotion to the recovery head', () => {
  const plan = retryPlan(fixture())
  assert.equal(plan.sha, sha)
  assert.equal(plan.promotionSha, mainSha)
  assert.deepEqual(plan.matrix.include, [{ image_name: 'xpert-webapp', artifact: `verified-xpert-webapp-${sha}` }])
})

test('PR, foreign-repository, branch, unrelated workflow and unfinished runs are rejected', () => {
  for (const values of [
    { event: 'pull_request' },
    { head_repository: { full_name: 'other/xpert' } },
    { head_branch: 'develop' },
    { path: '.github/workflows/other.yml' },
    { status: 'in_progress' },
    { id: 999 }
  ]) {
    const f = fixture()
    Object.assign(f.run, values)
    assert.throws(() => retryPlan(f))
  }
})

test('runtime, dependency and build changes cannot promote old artifacts', () => {
  for (const file of [
    'apps/api/package.json',
    'pnpm-lock.yaml',
    '.deploy/api/Dockerfile',
    '.deploy/application-images/services.mjs',
    '.github/workflows/build-application-images.yml'
  ]) {
    const f = fixture()
    f.git = (...args) => (args[0] === 'diff' ? `${file}\0` : '')
    assert.throws(() => retryPlan(f), /Runtime or build inputs changed/)
  }
  const f = fixture()
  f.git = () => {
    throw new Error('Not an ancestor')
  }
  assert.throws(() => retryPlan(f), /Not an ancestor/)
})

test('failed builds and missing, expired, duplicate or foreign artifacts cannot authorize publication', () => {
  for (const mutate of [
    (f) => {
      f.jobs[0].conclusion = 'failure'
    },
    (f) => {
      f.jobs[1].conclusion = 'failure'
    },
    (f) => {
      f.jobs.pop()
    },
    (f) => {
      f.artifacts = []
    },
    (f) => {
      f.artifacts[0].expired = true
    },
    (f) => {
      f.artifacts.push(f.artifacts[0])
    },
    (f) => {
      f.artifacts[0].workflow_run.id = 999
    },
    (f) => {
      f.jobs[1].name = 'build / Build and verify unknown'
    }
  ]) {
    const f = fixture()
    mutate(f)
    assert.throws(() => retryPlan(f))
  }
})
