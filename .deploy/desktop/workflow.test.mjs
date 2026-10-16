import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const toolsRequire = createRequire(new URL('./release-tools/package.json', import.meta.url))
const parseRequire = createRequire(toolsRequire.resolve('@changesets/parse'))
const { load } = parseRequire('js-yaml')
const workflow = load(readFileSync(new URL('../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'))

test('Desktop planning pins main from the fetched repository history', () => {
  const checkout = workflow.jobs.prepare.steps.find((step) => step.uses === 'actions/checkout@v4')
  assert.equal(checkout.with['fetch-depth'], 0)
  const plan = workflow.jobs.prepare.steps.find((step) => step.id === 'plan')
  assert.match(plan.run, /git rev-parse refs\/remotes\/origin\/main/)
  assert.match(plan.run, /DESKTOP_RELEASE_MAIN="\$desktop_release_main_sha" node \.deploy\/desktop\/release-plan\.mjs/)
})

test('release tooling repairs run checks while installer builds and publication retain their gates', () => {
  assert.ok(workflow.on.pull_request.paths.includes('libs/template-installation/**'))
  assert.deepEqual(workflow.on.push.branches, ['develop', 'main'])
  for (const file of ['.changeset/**', '.deploy/desktop/**', '.github/workflows/desktop-release.yml']) {
    assert.ok(workflow.on.push.paths.includes(file))
  }
  assert.equal(workflow.jobs.build.if, "needs.prepare.outputs.build == 'true'")
  assert.equal(
    workflow.jobs.release.if,
    "github.event_name == 'push' && needs.prepare.outputs.stable == 'true' && needs.build.result == 'success'"
  )
  assert.ok(workflow.jobs.release.steps.some((step) => step.run === 'node .deploy/desktop/release.mjs'))
})
