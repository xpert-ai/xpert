import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium, expect } from '@playwright/test'
import { startRemoteViewPreview } from '../remote-view-preview/preview-host.mjs'
process.env.TASKS_PREVIEW_SCENARIO = 'pipeline-managed'
const { default: config } =
  await import('../../packages/server-ai/src/xpert-project/remote-components/project-tasks/preview.config.mjs')

const root = resolve(import.meta.dirname, '../..')
const viewRoot = resolve(root, 'packages/server-ai/src/xpert-project/remote-components/project-tasks')
const output = process.env.PROJECT_TASKS_E2E_OUTPUT ?? resolve(tmpdir(), 'project-tasks-shadcn')
execFileSync(process.execPath, [resolve(viewRoot, 'build.mjs'), '--check'], { cwd: root, stdio: 'pipe' })

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
