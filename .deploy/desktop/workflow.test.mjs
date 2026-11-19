import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const toolsRequire = createRequire(new URL('./release-tools/package.json', import.meta.url))
const parseRequire = createRequire(toolsRequire.resolve('@changesets/parse'))
const { load } = parseRequire('js-yaml')
const workflow = load(readFileSync(new URL('../../.github/workflows/desktop-release.yml', import.meta.url), 'utf8'))
const mirrorWorkflow = load(readFileSync(new URL('../../.github/workflows/desktop-oss.yml', import.meta.url), 'utf8'))

test('Desktop planning pins main from the fetched repository history', () => {
  const checkout = workflow.jobs.prepare.steps.find((step) => step.uses === 'actions/checkout@v4')
  assert.equal(checkout.with['fetch-depth'], 0)
  const plan = workflow.jobs.prepare.steps.find((step) => step.id === 'plan')
  assert.match(plan.run, /git rev-parse refs\/remotes\/origin\/main/)
  assert.match(plan.run, /DESKTOP_RELEASE_MAIN="\$desktop_release_main_sha" node \.deploy\/desktop\/release-plan\.mjs/)
})

test('release tooling repairs run checks while installer builds and publication retain their gates', () => {
  assert.deepEqual(workflow.on.pull_request['branches-ignore'], ['develop'])
  assert.ok(workflow.on.pull_request.paths.includes('libs/template-installation/**'))
  assert.ok(workflow.on.pull_request.paths.includes('packages/plugin-sdk/src/lib/agent/runtime/process-supervisor.ts'))
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

test('packaging dependency tests run in the installed Desktop workspace before the build', () => {
  const command = 'node --test .deploy/desktop/installed/*.test.mjs'
  const prepareSteps = workflow.jobs.prepare.steps
  assert.ok(prepareSteps.some((step) => step.run === 'node --test .deploy/desktop/*.test.*'))
  assert.ok(!prepareSteps.some((step) => step.run?.includes(command)))
  const steps = workflow.jobs.build.steps
  const installIndex = steps.findIndex((step) => step.run?.includes('corepack pnpm install --frozen-lockfile'))
  const testIndex = steps.findIndex((step) => step.run === command)
  const buildIndex = steps.findIndex((step) => step.run === 'node .deploy/desktop/build.mjs')
  assert.ok(installIndex >= 0 && testIndex > installIndex && buildIndex > testIndex)
  assert.equal(steps[testIndex]['working-directory'], '.local/desktop-ci')
  assert.equal(steps[testIndex].if, undefined)
})

test('only the stable publisher and a main-branch backfill can assume the OSS role', () => {
  const caller = workflow.jobs.mirror
  assert.equal(caller.uses, './.github/workflows/desktop-oss.yml')
  assert.deepEqual(caller.needs, ['prepare', 'release'])
  assert.equal(caller.with.tag, 'desktop-v${{ needs.prepare.outputs.version }}')
  assert.match(caller.if, /needs\.release\.result == 'success'/)
  assert.equal(workflow.jobs.build.env.BOSI_OSS_DOMAIN, '${{ vars.BOSI_OSS_DOMAIN }}')
  assert.deepEqual(Object.keys(mirrorWorkflow.on).sort(), ['workflow_call', 'workflow_dispatch'])
  assert.match(mirrorWorkflow.jobs.prepare.if, /github\.ref == 'refs\/heads\/main'/)
  assert.equal(mirrorWorkflow.permissions['id-token'], undefined)
  assert.equal(mirrorWorkflow.jobs.prepare.environment, undefined)
  for (const job of [mirrorWorkflow.jobs.upload, mirrorWorkflow.jobs.finalize]) {
    assert.equal(job.environment, 'bosi-oss')
    assert.equal(job.permissions['id-token'], 'write')
  }
})

test('OSS uploads receive independent credential budgets after fetching their verified files', () => {
  const { prepare, upload, finalize } = mirrorWorkflow.jobs
  assert.deepEqual(mirrorWorkflow.concurrency, { group: 'bosi-oss-publisher', queue: 'max' })
  assert.ok(Object.values(mirrorWorkflow.jobs).every((job) => !job.concurrency))
  assert.equal(upload.needs, 'prepare')
  assert.equal(upload.if, "needs.prepare.outputs.upload == 'true'")
  assert.equal(upload.strategy['max-parallel'], 3)
  assert.equal(upload.strategy['fail-fast'], false)
  assert.equal(upload.strategy.matrix, '${{ fromJSON(needs.prepare.outputs.matrix) }}')
  assert.equal(upload.env.BOSI_ASSET, '${{ matrix.asset }}')
  const snapshot = prepare.steps.find((step) => step.uses === 'actions/upload-artifact@v4')
  assert.equal(snapshot.with.overwrite, true)
  assert.equal(snapshot.with['retention-days'], 30)
  assert.doesNotMatch(snapshot.with.name, /run_attempt/)
  for (const job of [upload, finalize]) {
    const download = job.steps.find((step) => step.uses === 'actions/download-artifact@v4')
    assert.equal(download.with.name, snapshot.with.name)
    const fetchIndex = job.steps.findIndex((step) => step.run?.includes('stages.py fetch'))
    const authIndex = job.steps.findIndex((step) =>
      step.uses?.startsWith('aliyun/configure-aliyun-credentials-action@')
    )
    assert.ok(fetchIndex >= 0 && authIndex > fetchIndex)
    assert.equal(job.steps[authIndex].with['role-session-expiration'], 3600)
    assert.ok(job['timeout-minutes'] < 60)
    assert.match(job.steps.at(-1).run, /stages\.py (upload|finalize)/)
  }
  assert.match(upload.steps.at(-1).run, /--asset "\$BOSI_ASSET"/)
  assert.doesNotMatch(finalize.steps.at(-1).run, /--asset/)
})

test('the index waits for every upload, permits empty matrices, and never runs after failure or cancellation', () => {
  const { finalize } = mirrorWorkflow.jobs
  assert.deepEqual(finalize.needs, ['prepare', 'upload'])
  const condition = finalize.if.replace(/^\$\{\{\s*|\s*\}\}$/g, '')
  const canFinalize = new Function('needs', 'cancelled', `return (${condition})`)
  for (const prepareResult of ['success', 'failure', 'skipped', 'cancelled']) {
    for (const uploadResult of ['success', 'failure', 'skipped', 'cancelled']) {
      for (const hasUploads of ['true', 'false']) {
        for (const cancelled of [true, false]) {
          const expected =
            !cancelled &&
            prepareResult === 'success' &&
            (uploadResult === 'success' || (hasUploads === 'false' && uploadResult === 'skipped'))
          assert.equal(
            canFinalize(
              {
                prepare: { result: prepareResult, outputs: { upload: hasUploads } },
                upload: { result: uploadResult }
              },
              () => cancelled
            ),
            expected
          )
        }
      }
    }
  }
})

test('OSS behavior tests run in pull request planning before any release decision', () => {
  const steps = workflow.jobs.prepare.steps
  const testIndex = steps.findIndex((step) => step.run?.includes('python -m unittest discover -s .deploy/desktop/oss'))
  const planIndex = steps.findIndex((step) => step.id === 'plan')
  assert.ok(testIndex >= 0 && planIndex > testIndex)
  assert.equal(steps[testIndex].if, undefined)
  assert.ok(workflow.on.pull_request.paths.includes('.deploy/desktop/**'))
  assert.ok(workflow.on.pull_request.paths.includes('.github/workflows/desktop-oss.yml'))
})
