import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium, expect } from '@playwright/test'
import { startRemoteViewPreview } from '../remote-view-preview/preview-host.mjs'
import { assertAttachedTabIndicator } from './tab-underline-assertions.mjs'
process.env.TASKS_PREVIEW_SCENARIO = 'pipeline-managed'
const { default: config } =
  await import('../../packages/server-ai/src/xpert-project/remote-components/project-tasks/preview.config.mjs')

const root = resolve(import.meta.dirname, '../..')
const viewRoot = resolve(root, 'packages/server-ai/src/xpert-project/remote-components/project-tasks')
const output = process.env.PROJECT_TASKS_E2E_OUTPUT ?? resolve(tmpdir(), 'project-tasks-shadcn')
execFileSync(process.execPath, [resolve(viewRoot, 'build.mjs'), '--check'], { cwd: root, stdio: 'pipe' })

test('searches tasks across tabs and selects a pipeline beyond the first catalog page', async () => {
  const state = structuredClone(config.state)
  const first = { ...state.pipeline.instance, title: '验收单 1040' }
  const target = { ...first, id: randomUUID(), title: '验收单 2087' }
  state.graph.tasks = [first, target].map((item, index) => ({
    ...state.graph.tasks[0],
    id: String(index),
    title: 'prepare',
    pipelineInstanceId: item.id,
    pipelineInstanceTitle: item.title
  }))
  const graphReads = []
  const preview = await startRemoteViewPreview(
    {
      ...config,
      state,
      logStartup: false,
      async handleRequest(message, context) {
        if (message.actionKey === 'pipeline-list') {
          const items = [first, target].filter((item) => item.title.includes(message.input.search ?? ''))
          const offset = message.input.after ? items.findIndex((item) => item.id === message.input.after) + 1 : 0
          return {
            data: {
              success: true,
              data: { items: items.slice(offset, offset + 1), next: items[offset + 1] ? items[offset].id : null }
            }
          }
        }
        if (message.actionKey === 'pipeline-graph') {
          graphReads.push(message.input.instanceId)
          context.state.pipeline.instance = [first, target].find((item) => item.id === message.input.instanceId)
        }
        return config.handleRequest(message, context)
      }
    },
    { port: 0 }
  )
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(preview.url)
    const frame = page.frameLocator('#remote-view')
    await frame.getByRole('tab', { name: '全部任务', exact: true }).click()
    await frame.getByRole('textbox', { name: /搜索任务/ }).fill('2087')
    for (const name of ['全部任务', '任务树', '甘特图', '状态看板']) {
      await frame.getByRole('tab', { name, exact: true }).click()
      await expect(frame.locator('footer')).toContainText('1 / 2')
    }
    await frame.getByRole('textbox', { name: /搜索任务/ }).fill('')
    await frame.getByRole('button', { name: '筛选', exact: true }).click()
    await frame.getByRole('combobox', { name: '流水线实例', exact: true }).click()
    const taskSearch = frame.getByPlaceholder('搜索流水线实例名')
    await taskSearch.fill('2087')
    await frame.getByRole('option', { name: /验收单 2087/ }).click()
    await expect(frame.getByRole('combobox', { name: '流水线实例', exact: true })).toHaveText(target.title)
    await frame.getByRole('combobox', { name: '流水线实例', exact: true }).press('Escape')
    await frame.getByRole('tab', { name: '任务树', exact: true }).click()
    await expect(frame.locator('footer')).toContainText('1 / 2')
    await frame.getByRole('tab', { name: '流水线', exact: true }).click()
    const trigger = frame.getByRole('combobox', { name: '切换流水线', exact: true })
    await trigger.click()
    const input = frame.getByPlaceholder('搜索流水线实例名')
    await input.fill('不存在')
    await expect(frame.getByText('没有匹配的流水线实例')).toBeVisible()
    await input.fill('验收单')
    await frame.getByRole('option', { name: '加载更多' }).click()
    const option = frame.getByRole('option', { name: /验收单 2087/ })
    await expect(option).toBeVisible()
    await option.click()
    await expect(input).toBeHidden()
    await expect(trigger).toHaveText(target.title)
    await expect.poll(() => graphReads.at(-1)).toBe(target.id)
    await trigger.click()
    await expect(input).toHaveValue('')
    await expect(input).toBeFocused()
    await input.press('Escape')
    await expect(trigger).toBeFocused()
  } finally {
    await browser.close()
    await preview.close()
  }
})

test('built Project tasks uses standard dialogs with host themes, scrolling and native controls', async () => {
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const errors = []
  try {
    for (const scenario of [
      { name: 'light', mode: 'light', width: 1280, height: 900, radius: '12px' },
      { name: 'dark', mode: 'dark', width: 1280, height: 900, radius: '20px' },
      { name: 'narrow', mode: 'light', width: 390, height: 640, radius: '12px' }
    ]) {
      const dark = scenario.mode === 'dark'
      const state = structuredClone(config.state)
      const node = state.pipeline.nodes.find((item) => item.projection.nodeKey === 'source')
      const theme = {
        mode: scenario.mode,
        density: dark ? 'compact' : 'default',
        tokens: {
          ...config.hostContext.theme.tokens,
          radiusLg: scenario.radius,
          densityRootFontSize: dark ? '14px' : '16px',
          colorBackground: dark ? '#09090b' : '#ffffff',
          colorPopover: dark ? '#09090b' : '#ffffff',
          colorForeground: dark ? '#fafafa' : '#18181b',
          colorMuted: dark ? '#27272a' : '#f4f4f5',
          colorMutedForeground: dark ? '#a1a1aa' : '#71717a',
          colorBorder: dark ? '#3f3f46' : '#e4e4e7',
          colorInput: dark ? '#3f3f46' : '#e4e4e7'
        }
      }
      const preview = await startRemoteViewPreview(
        {
          ...config,
          state,
          logStartup: false,
          hostContext: {
            ...config.hostContext,
            theme,
            initialQuery: {
              parameters: {
                initialTab: 'pipeline',
                pipelineInstanceId: state.pipeline.instance.id,
                pipelineNodeId: node.id
              }
            }
          }
        },
        { port: 0 }
      )
      const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height } })
      page.setDefaultTimeout(10000)
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        await page.goto(preview.url)
        const frame = page.frameLocator('#remote-view')
        const dialog = frame.getByRole('dialog', { name: node.projection.title, exact: true })
        await expect(dialog).toBeVisible()
        const metrics = await dialog.evaluate((element) => {
          const style = getComputedStyle(element)
          const bounds = element.getBoundingClientRect()
          return {
            background: style.backgroundColor,
            border: style.borderColor,
            radius: style.borderRadius,
            padding: parseFloat(style.paddingTop),
            x: bounds.x,
            y: bounds.y,
            right: bounds.right,
            bottom: bounds.bottom,
            width: innerWidth,
            height: innerHeight,
            header: !!element.querySelector('[data-slot="dialog-header"]'),
            footer: !!element.querySelector('[data-slot="dialog-footer"]')
          }
        })
        assert.equal(metrics.background, dark ? 'rgb(9, 9, 11)' : 'rgb(255, 255, 255)')
        assert.equal(metrics.border, dark ? 'rgb(63, 63, 70)' : 'rgb(228, 228, 231)')
        assert.ok(Math.abs(parseFloat(metrics.radius) - parseFloat(scenario.radius) * 1.4) < 0.1)
        assert.ok(metrics.padding > 0 && metrics.header && metrics.footer)
        assert.ok(
          metrics.x >= 0 && metrics.y >= 0 && metrics.right <= metrics.width && metrics.bottom <= metrics.height
        )
        await dialog.getByRole('button', { name: '版本与技术详情', exact: true }).click()
        await expect(dialog.getByRole('button', { name: '版本与技术详情', exact: true })).toHaveAttribute(
          'aria-expanded',
          'true'
        )
        await dialog.getByRole('tab', { name: /^执行记录/ }).click()
        await expect(dialog.getByRole('tab', { name: /^执行记录/ })).toHaveAttribute('aria-selected', 'true')
        await dialog.getByRole('tab', { name: '概览', exact: true }).click()
        await dialog.getByText('版本状态', { exact: true }).scrollIntoViewIfNeeded()
        await expect(dialog.getByText('版本状态', { exact: true })).toBeInViewport({ ratio: 1 })
        await page.screenshot({ path: resolve(output, `${scenario.name}-node.png`) })
        await dialog.getByRole('button', { name: 'Close', exact: true }).press('Escape')
        await expect(dialog).toHaveCount(0)

        // Keep visibility and divider alignment in the same regression check.
        for (const name of ['全部任务', '任务树', '甘特图', '状态看板', '流水线']) {
          const tab = frame.getByRole('tab', { name, exact: true })
          await tab.click()
          await assertAttachedTabIndicator(tab)
        }
        const stage = frame.getByRole('tab', { name: '阶段泳道', exact: true })
        await stage.focus()
        await stage.press('ArrowRight')
        const timeline = frame.getByRole('tab', { name: '执行时间轴', exact: true })
        await expect(timeline).toBeFocused()
        await expect(timeline).toHaveAttribute('aria-selected', 'true')
        await assertAttachedTabIndicator(frame.getByRole('tab', { name: '流水线', exact: true }))
        await timeline.press('ArrowLeft')
        await expect(stage).toHaveAttribute('aria-selected', 'true')
        await page.screenshot({ path: resolve(output, `${scenario.name}-tabs.png`) })

        // Native checkbox state must still feed the same configuration payload.
        await frame.getByRole('button', { name: '配置流水线', exact: true }).click()
        const settings = frame.getByRole('dialog', { name: '配置流水线', exact: true })
        await expect(settings).toBeVisible()
        await settings.getByRole('combobox', { name: '选择模板', exact: true }).click()
        await frame.getByRole('option', { name: /^技术资料审核/ }).click()
        await settings.getByRole('combobox', { name: '技术分析智能体', exact: true }).click()
        await frame.getByRole('option', { name: /^技术资料分析助手/ }).click()
        const sourceRequired = settings.getByRole('checkbox', { name: '要求提供来源引用', exact: true })
        await expect(sourceRequired).toBeChecked()
        await sourceRequired.uncheck()
        await expect(sourceRequired).not.toBeChecked()
        await sourceRequired.check()
        await expect(sourceRequired).toBeChecked()
        await sourceRequired.uncheck()
        await settings.getByRole('button', { name: '保存配置', exact: true }).click()
        await expect(settings.getByRole('status')).toContainText('配置已保存')
        assert.equal(preview.state.bindings.length, 1)
        assert.equal(preview.state.bindings[0].configuration.binding.parameters.requireReferences, false)
        await page.screenshot({ path: resolve(output, `${scenario.name}-settings.png`) })
        await settings.getByRole('button', { name: 'Close', exact: true }).click()
        await expect(settings).toHaveCount(0)
        await expect(frame.getByRole('button', { name: '配置流水线', exact: true })).toBeFocused()
      } finally {
        await page.close()
        await preview.close()
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
