// Recovery can change the publisher, never the image that passed health checks.
// Only a completed main push with successful builds and retained artifacts qualifies.
// Channel promotion requires unchanged runtime inputs and an unchanged recovery head.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const images = ['xpert-api', 'xpert-webapp', 'xpert-nsjail-runner']
const publicationFiles = new Set([
  '.deploy/application-images/publish-verified-image.mjs',
  '.deploy/application-images/publish-verified-image.test.mjs',
  '.deploy/application-images/docker-command.mjs',
  '.deploy/application-images/docker-command.test.mjs',
  '.deploy/application-images/retry-publication.mjs',
  '.deploy/application-images/retry-publication.test.mjs',
  '.deploy/application-images/retry-workflow.test.mjs',
  '.deploy/application-images/README.md',
  '.github/workflows/retry-application-image-publication.yml'
])

export function retryPlan({ runId, repository, mainSha, run, jobs, artifacts, git }) {
  assert.match(runId, /^[1-9][0-9]*$/)
  assert.equal(String(run.id), runId)
  assert.equal(run.head_repository?.full_name, repository, 'Source run must belong to this repository')
  assert.equal(run.path, '.github/workflows/docker-publish.yml', 'Source must be the application image workflow')
  assert.equal(run.event, 'push', 'Only trusted push artifacts may be published')
  assert.equal(run.head_branch, 'main', 'Only main artifacts may be published')
  assert.equal(run.status, 'completed', 'Wait for the source workflow to finish')
  assert.match(run.head_sha, /^[a-f0-9]{40}$/)
  assert.match(mainSha, /^[a-f0-9]{40}$/)
  git('merge-base', '--is-ancestor', run.head_sha, mainSha)
  const changed = git('diff', '--name-only', '-z', run.head_sha, mainSha).split('\0').filter(Boolean)
  assert.ok(
    changed.every((file) => publicationFiles.has(file)),
    'Runtime or build inputs changed after the source run; use a new validated release'
  )
  assert.equal(jobs.find((job) => job.name === 'Check application image Changesets')?.conclusion, 'success')
  const builds = jobs.filter((job) => job.name.startsWith('build / Build and verify '))
  assert.ok(builds.length, 'No validated builds found')
  assert.ok(
    builds.every((job) => job.conclusion === 'success'),
    'Every source image build must succeed'
  )
  const include = builds.map((job) => {
    const image = job.name.slice('build / Build and verify '.length)
    assert.ok(images.includes(image), `Unexpected source image: ${image}`)
    const name = `verified-${image}-${run.head_sha}`
    const matches = artifacts.filter((artifact) => artifact.name === name)
    assert.equal(matches.length, 1, `Expected one original artifact: ${name}`)
    assert.equal(matches[0].expired, false, `Artifact expired: ${name}`)
    assert.equal(matches[0].workflow_run?.id, run.id, 'Artifact must originate from the source run')
    return { image_name: image, artifact: name }
  })
  assert.equal(new Set(include.map((entry) => entry.image_name)).size, include.length)
  return { sha: run.head_sha, promotionSha: mainSha, matrix: { include } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runId = process.env.SOURCE_RUN_ID
  assert.match(runId ?? '', /^[1-9][0-9]*$/)
  const repository = process.env.GITHUB_REPOSITORY
  assert.equal(repository, 'xpert-ai/xpert')
  const api = (path, paginate = false) =>
    JSON.parse(execFileSync('gh', ['api', path, ...(paginate ? ['--paginate', '--slurp'] : [])], { encoding: 'utf8' }))
  const root = `repos/${repository}/actions/runs/${runId}`
  const plan = retryPlan({
    runId,
    repository,
    mainSha: process.env.GITHUB_SHA,
    run: api(root),
    jobs: api(`${root}/jobs?filter=latest&per_page=100`, true).flatMap((page) => page.jobs),
    artifacts: api(`${root}/artifacts?per_page=100`, true).flatMap((page) => page.artifacts),
    git: (...args) => execFileSync('git', args, { encoding: 'utf8' })
  })
  console.log(JSON.stringify(plan))
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `sha=${plan.sha}\npromotion_sha=${plan.promotionSha}\nmatrix=${JSON.stringify(plan.matrix)}\n`
    )
}
