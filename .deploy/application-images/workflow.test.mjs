import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const toolsRequire = createRequire(new URL('./release-tools/package.json', import.meta.url))
const parseRequire = createRequire(toolsRequire.resolve('@changesets/parse'))
const { load } = parseRequire('js-yaml')
const workflow = (name) => load(readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8'))
const { jobs } = workflow('docker-publish')
const imageBuild = workflow('build-application-images').jobs.build

test('planning pins main from the fetched repository history', () => {
  const checkout = jobs.prepare.steps.find((step) => step.uses === 'actions/checkout@v4')
  assert.equal(checkout.with['fetch-depth'], 0)
  const plan = jobs.prepare.steps.find((step) => step.id === 'plan')
  assert.match(plan.run, /git rev-parse refs\/remotes\/origin\/main/)
  assert.match(
    plan.run,
    /IMAGE_RELEASE_MAIN="\$image_release_main_sha" node \.deploy\/application-images\/release-plan\.mjs/
  )
})

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

test('PR builds cannot write registry caches or receive publication credentials', () => {
  for (const name of ['build', 'build-pr']) {
    const caller = jobs[name]
    assert.equal(caller.uses, './.github/workflows/build-application-images.yml')
    assert.equal(caller.with.sha, '${{ needs.prepare.outputs.sha }}')
    assert.equal(caller.with.matrix, '${{ needs.prepare.outputs.validation_matrix }}')
    assert.equal(caller.secrets, undefined)
  }
  assert.match(jobs.build.if, /github.event_name == 'push'/)
  assert.equal(jobs.build.permissions.packages, 'write')
  assert.equal(jobs.build.with['write-cache'], true)
  assert.match(jobs['build-pr'].if, /github.event_name == 'pull_request'/)
  assert.deepEqual(jobs['build-pr'].permissions, { contents: 'read' })
  assert.equal(jobs['build-pr'].with['write-cache'], false)
  const login = imageBuild.steps.find((step) => step.uses === 'docker/login-action@v3')
  assert.match(login.if, /inputs.write-cache && github.event_name == 'push'/)
  assert.match(login.if, /github.ref == 'refs\/heads\/develop'/)
  assert.match(login.if, /github.ref == 'refs\/heads\/main'/)
  assert.equal(login.with.registry, 'ghcr.io')
  assert.equal(login.with.password, '${{ secrets.GITHUB_TOKEN }}')
  assert.ok(!JSON.stringify(imageBuild).includes('secrets.DOCKERHUB_TOKEN'))
  assert.ok(!JSON.stringify(imageBuild).includes('secrets.ACR_PASSWORD'))
})

test('registry caches are isolated by repository, image, architecture and trusted branch', () => {
  const build = imageBuild.steps.find((step) => step.uses === 'docker/build-push-action@v6')
  for (const direction of ['cache-from', 'cache-to']) {
    assert.match(build.with[direction], /inputs.write-cache &&/)
    assert.match(build.with[direction], /ghcr.io\/\{0\}-buildcache:\{1\}-linux-amd64-/)
    assert.match(build.with[direction], /github.repository, matrix.image_name/)
  }
  assert.match(build.with['cache-from'], /linux-amd64-develop/)
  assert.match(build.with['cache-from'], /linux-amd64-main/)
  assert.match(build.with['cache-to'], /github.event_name == 'push'/)
  assert.match(build.with['cache-to'], /github.ref_name/)
  assert.match(build.with['cache-to'], /mode=max/)
})

test('image artifacts are exported only after health checks, without publishing application tags', () => {
  const steps = imageBuild.steps
  const build = steps.find((step) => step.uses === 'docker/build-push-action@v6')
  assert.equal(build.with.load, true)
  assert.equal(build.with.push, false)
  assert.equal(build.with.platforms, 'linux/amd64')
  assert.ok(!imageBuild.environment)
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
  const upload = imageBuild.steps.find((step) => step.uses === 'actions/upload-artifact@v4')
  const download = jobs.publish.steps.find((step) => step.uses === 'actions/download-artifact@v4')
  assert.equal(download.with.name, upload.with.name.replace('inputs.sha', 'needs.prepare.outputs.sha'))
  assert.ok(!download.with.name.includes('run_attempt'), 'A publish-only retry must find the original artifact')
  const push = jobs.publish.steps.at(-1)
  assert.equal(push.run, 'node .deploy/application-images/publish-verified-image.mjs')
  assert.equal(push.env.IMAGE_SHA, '${{ needs.prepare.outputs.sha }}')
  assert.equal(imageBuild.steps[0].with.ref, '${{ inputs.sha }}')
  assert.equal(jobs.publish.steps[0].with.ref, '${{ needs.prepare.outputs.sha }}')
})
