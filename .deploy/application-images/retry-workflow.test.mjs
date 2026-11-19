import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(new URL('./release-tools/package.json', import.meta.url))
const parseRequire = createRequire(require.resolve('@changesets/parse'))
const { load } = parseRequire('js-yaml')
const workflow = load(
  readFileSync(new URL('../../.github/workflows/retry-application-image-publication.yml', import.meta.url), 'utf8')
)

test('recovery is main-only, shares publication concurrency and retains production approval', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'])
  assert.equal(workflow.on.workflow_dispatch.inputs.run_id.required, true)
  assert.match(workflow.jobs.prepare.if, /github.ref == 'refs\/heads\/main'/)
  assert.equal(workflow.concurrency.group, 'application-images-refs/heads/main')
  assert.equal(workflow.concurrency['cancel-in-progress'], false)
  assert.equal(workflow.jobs.publish.environment, 'production')
  assert.equal(workflow.jobs.prepare.permissions, undefined)
  assert.equal(workflow.permissions.packages, undefined)
  assert.equal(workflow.jobs.publish.permissions.packages, 'write')
})

test('recovery downloads the original run artifact and uses the repaired publisher without rebuilding', () => {
  const steps = workflow.jobs.publish.steps
  const download = steps.find((step) => step.uses === 'actions/download-artifact@v4')
  assert.equal(download.with['run-id'], '${{ inputs.run_id }}')
  assert.equal(download.with.name, '${{ matrix.artifact }}')
  assert.ok(steps.some((step) => step.run?.includes('docker load')))
  assert.ok(!steps.some((step) => step.uses === 'docker/build-push-action@v6'))
  assert.equal(steps.at(-1).env.IMAGE_SHA, '${{ needs.prepare.outputs.sha }}')
  assert.equal(steps.at(-1).env.IMAGE_PROMOTION_SHA, '${{ needs.prepare.outputs.promotion_sha }}')
  assert.equal(steps.at(-1).run, 'node .deploy/application-images/publish-verified-image.mjs')
})
