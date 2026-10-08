import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const toolsRequire = createRequire(new URL('./release-tools/package.json', import.meta.url))
const parseRequire = createRequire(toolsRequire.resolve('@changesets/parse'))
const { load } = parseRequire('js-yaml')
const workflow = (name) => load(readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8'))
const { jobs } = workflow('docker-publish')

test('image builds wait for dependency checks of the exact planned source SHA', () => {
  assert.deepEqual(jobs.build.needs, ['prepare', 'validate-api', 'validate-web'])
  for (const [job, name] of [
    ['validate-api', 'api-runtime-dependencies'],
    ['validate-web', 'webapp-dependencies']
  ]) {
    assert.equal(jobs[job].uses, `./.github/workflows/${name}.yml`)
    assert.equal(jobs[job].with.sha, '${{ needs.prepare.outputs.sha }}')
    const called = workflow(name)
    assert.deepEqual(Object.keys(called.on), ['workflow_call'])
    assert.equal(called.jobs.validate.steps[0].with.ref, '${{ inputs.sha }}')
    assert.ok(!called.jobs['image-health'], 'Heavy image checks must run only once in the caller')
    assert.match(
      jobs.build.if,
      new RegExp(`needs\\.${job}\\.result == 'success' \\|\\| needs\\.${job}\\.result == 'skipped'`)
    )
  }
})

test('build jobs have no publication credentials and export an image only after health checks', () => {
  const steps = jobs.build.steps
  const build = steps.find((step) => step.uses === 'docker/build-push-action@v6')
  assert.equal(build.with.load, true)
  assert.equal(build.with.push, false)
  assert.equal(build.with.platforms, 'linux/amd64')
  assert.ok(!steps.some((step) => step.uses === 'docker/login-action@v3'))
  assert.ok(!jobs.build.environment)
  const health = steps.findIndex((step) => step.run === 'node "$HEALTH_CHECK" "$LOCAL_IMAGE"')
  const save = steps.findIndex((step) => step.run?.includes('docker save'))
  const upload = steps.findIndex((step) => step.uses === 'actions/upload-artifact@v4')
  assert.ok(health > 0 && save > health && upload > save)
  assert.equal(steps[save].if, 'matrix.publish')
  assert.equal(steps[upload].if, 'matrix.publish')
})

test('publication requires every build to pass and loads the matching artifact without rebuilding', () => {
  assert.deepEqual(jobs.publish.needs, ['prepare', 'build'])
  assert.equal(jobs.publish.if, "github.event_name == 'push' && needs.prepare.outputs.publish == 'true'")
  assert.equal(jobs.publish.environment, 'production')
  assert.ok(!jobs.publish.steps.some((step) => step.uses === 'docker/build-push-action@v6'))
  assert.ok(jobs.publish.steps.some((step) => step.run?.startsWith('docker load ')))
  const upload = jobs.build.steps.find((step) => step.uses === 'actions/upload-artifact@v4')
  const download = jobs.publish.steps.find((step) => step.uses === 'actions/download-artifact@v4')
  assert.equal(download.with.name, upload.with.name)
  assert.ok(!download.with.name.includes('run_attempt'), 'A publish-only retry must find the original artifact')
  const push = jobs.publish.steps.at(-1)
  assert.equal(push.run, 'node .deploy/application-images/publish-verified-image.mjs')
  assert.equal(push.env.IMAGE_SHA, '${{ needs.prepare.outputs.sha }}')
  assert.equal(jobs.build.steps[0].with.ref, '${{ needs.prepare.outputs.sha }}')
  assert.equal(jobs.publish.steps[0].with.ref, '${{ needs.prepare.outputs.sha }}')
})
