import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { startRemoteViewPreview } from '../remote-view-preview/preview-host.mjs'
import config from '../../packages/server-ai/src/xpert-project/remote-components/project-tasks/preview.config.mjs'

const root = resolve(import.meta.dirname, '../..')
const output = process.env.PROJECT_TASK_REVIEW_E2E_OUTPUT ?? resolve(tmpdir(), 'project-task-review-e2e')
const rendererBuild = await build({
  entryPoints: [resolve(root, 'packages/plugin-sdk/src/lib/view-extension/remote-component-html.ts')],
  bundle: true, format: 'esm', platform: 'node', write: false
})
const renderers = await import(`data:text/javascript;base64,${Buffer.from(rendererBuild.outputFiles[0].contents).toString('base64')}`)
execFileSync(process.execPath, [resolve(config.component.root, 'build.mjs'), '--check'], { cwd: root, stdio: 'pipe' })

const implementationId = '11111111-1111-4111-8111-111111111111'
const reviewId = '22222222-2222-4222-8222-222222222222'
const invocationId = '33333333-3333-4333-8333-333333333333'
const specificationDigest = `sha256:${'a'.repeat(64)}`
const evidence = [{ type: 'invocation_result', invocationId, revision: 3 }]

for (const scenario of [
  { name: 'execution-en', locale: 'en-US', mode: 'light', width: 1280, verdict: 'changes_required' },
  { name: 'execution-zh', locale: 'zh-Hans', mode: 'dark', width: 1280, verdict: 'pass' },
  { name: 'execution-narrow', locale: 'en-US', mode: 'light', width: 390, verdict: 'indeterminate' },
  { name: 'evidence-only', locale: 'en-US', mode: 'light', width: 1280, verdict: 'pass', evidenceOnly: true }
]) {
  test(`review details retain runtime success and show acceptance evidence: ${scenario.name}`, async () => {
    await mkdir(output, { recursive: true })
    const state = structuredClone(config.state)
    const task = { ...state.graph.tasks[1], id: 'review-fixture', title: 'Review display fixture',
      status: 'review', parentTaskId: null, predecessorIds: [] }
    const purpose = { type: 'review', mode: scenario.evidenceOnly ? 'evidence_only' : 'execution',
      ...(scenario.evidenceOnly ? {} : { candidatePaths: ['plugin'] }),
      implementationExecutionId: implementationId, implementationInvocationId: invocationId,
      specificationDigest, evidence }
    const report = { version: scenario.evidenceOnly ? 1 : 2, verdict: scenario.verdict,
      implementationInvocationId: invocationId, specificationDigest, evidence, limitations: ['Fixture environment only'],
      ...(scenario.evidenceOnly ? { findings: ['Static evidence supports the requirements'] } : {
        mode: 'execution', summary: 'Independent acceptance summary',
        checks: [{ description: 'Run plugin smoke test', outcome: scenario.verdict === 'pass' ? 'passed' : 'failed',
          command: 'npm run test:smoke', expected: 'The plugin responds correctly', actual: 'Observed plugin response',
          evidencePaths: ['evidence/smoke.log'] }],
        findings: [{ id: 'F1', kind: scenario.verdict === 'pass' ? 'suggestion' : 'defect', blocking: scenario.verdict !== 'pass',
          description: 'Plugin result feedback', requirement: 'Plugin works after installation',
          reproduction: 'Install the candidate\nInvoke the example API', expected: 'Expected response', actual: 'Observed response' }]
      }) }
    state.graph = { ...state.graph, canEditPlan: false, tasks: [task], executions: [
      { ...state.graph.executions[0], id: reviewId, taskId: task.id, invocationId, invocationStatus: 'succeeded' }
    ] }
    state.detail = { id: task.id, revision: 1, status: 'review', requirements: ['Plugin works after installation'], executions: [
      { id: reviewId, attempt: 2, invocationId, invocationStatus: 'succeeded', runtimeProvider: 'sandbox',
        purpose, reviewReport: report, executionBudget: { maxDurationSeconds: 7200, deadline: '2026-11-11T12:00:00.000Z' } },
      { id: implementationId, attempt: 1, invocationId, invocationStatus: 'succeeded', runtimeProvider: 'sandbox',
        purpose: { type: 'implementation', reviewer: { bindingId: reviewId, mode: 'execution' },
          rework: { reviewExecutionId: reviewId, findingIds: ['F1'] } } }
    ] }
    const preview = await startRemoteViewPreview({ ...config, state, renderers, isolatedOrigin: true,
      logStartup: false, logErrors: false,
      hostContext: { ...config.hostContext, locale: scenario.locale, theme: { mode: scenario.mode,
        tokens: scenario.mode === 'dark' ? {
          colorBackground: '#09090b', colorForeground: '#fafafa', colorCard: '#18181b', colorCardForeground: '#fafafa',
          colorPopover: '#18181b', colorPopoverForeground: '#fafafa', colorBorder: '#3f3f46',
          colorMuted: '#27272a', colorMutedForeground: '#a1a1aa', colorSecondary: '#27272a', colorSecondaryForeground: '#fafafa'
        } : config.hostContext.theme.tokens } },
      handleRequest(message, context) {
        if (message.type === 'executeAction' && message.actionKey === 'task-detail')
          return { data: { success: true, data: context.state.detail } }
        return config.handleRequest(message, context)
      }
    }, { port: 0 })
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: scenario.width, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const zh = scenario.locale.startsWith('zh')
    try {
      await page.goto(preview.url)
      const frame = page.frameLocator('#remote-view')
      await frame.getByRole('tab', { name: zh ? '全部任务' : 'All tasks', exact: true }).click()
      await frame.getByText(task.title, { exact: true }).click()
      const dialog = frame.getByRole('dialog')
      await expect(dialog).toHaveCSS('background-color', scenario.mode === 'dark' ? 'rgb(24, 24, 27)' : 'rgb(255, 255, 255)')
      const detail = dialog.getByRole('region', { name: zh ? '结果与验收' : 'Results & acceptance', exact: true })
      await expect(detail).toBeVisible()
      await expect(detail).toContainText(zh ? '运行成功' : 'Succeeded')
      await expect(detail).toContainText(zh ? '执行上限 2 h' : 'Execution limit 2 h')
      await expect(detail.locator(`[title^="${zh ? '截止时间' : 'Deadline'}:"]`)).toHaveCount(1)
      await expect(detail).toContainText(zh ? '独立验收方式 · 实际执行' : 'Independent review mode · Execution')
      await expect(detail).toContainText(zh ? '本次返工反馈: F1' : 'Rework findings: F1')
      if (scenario.evidenceOnly) {
        await expect(detail).toContainText('Independent review · evidence only')
        await expect(detail).toContainText('Static evidence supports the requirements')
        await expect(detail).not.toContainText('Executed checks')
      } else {
        await expect(detail).toContainText(zh ? '独立验收 · 实际执行' : 'Independent acceptance · execution')
        await expect(detail).toContainText(zh ? '通过' : scenario.verdict === 'changes_required' ? 'Changes required' : 'Indeterminate')
        for (const text of ['Independent acceptance summary', 'Run plugin smoke test', 'npm run test:smoke',
          'The plugin responds correctly', 'Observed plugin response', 'evidence/smoke.log',
          'Plugin result feedback', 'Install the candidate', 'Expected response', 'Observed response'])
          await expect(detail).toContainText(text)
        await expect(detail).toContainText(zh ? '非阻断' : 'Blocking')
      }
      await expect(detail).toContainText('Fixture environment only')
      assert.equal(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth), false)
      assert.deepEqual(errors, [])
      await page.screenshot({ path: resolve(output, `${scenario.name}.png`) })
      const rework = detail.getByText(zh ? '本次返工反馈: F1' : 'Rework findings: F1', { exact: true })
      await rework.scrollIntoViewIfNeeded()
      await expect(rework).toBeInViewport()
    } finally { await browser.close(); await preview.close() }
  })
}
