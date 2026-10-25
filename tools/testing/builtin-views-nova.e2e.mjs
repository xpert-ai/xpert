import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium, expect } from '@playwright/test'
import { startRemoteViewPreview } from '../remote-view-preview/preview-host.mjs'
import conversation from '../../packages/server-ai/src/chat-conversation/conversation-map/remote-components/conversation-map/preview.config.mjs'
import scheduler from '../../packages/server-ai/src/xpert-task/remote-components/scheduler-detail/preview.config.mjs'
import coding from '../../packages/server-ai/src/agent-invocation/remote-components/coding-execution/preview.config.mjs'

const root = resolve(import.meta.dirname, '../..')
const output = process.env.BUILTIN_VIEWS_E2E_OUTPUT ?? resolve(tmpdir(), 'builtin-views-nova')
const document = { id: 'doc', name: '示例文档', isFolder: false, status: 'understood' }
const knowledge = {
  workspaceRoot: root,
  component: {
    root: 'packages/server-ai/src/knowledgebase/plugins/knowledge-workbench/remote-components/knowledge-workbench',
    runtime: 'react'
  },
  hostContext: { locale: 'zh-Hans' },
  state: { actions: [] },
  handleRequest(message, { state }) {
    if (message.type === 'requestData')
      return {
        type: 'data',
        data: {
          items: [document],
          total: 1,
          summary: {
            activeKnowledgebaseId: 'kb',
            knowledgebases: [{ id: 'kb', name: '示例知识库', documentNum: 1 }],
            selectedDocument: {
              document,
              chunks: [{ id: 'chunk', pageContent: '# 示例\n\n验证官方组件和宿主主题。' }],
              totalChunks: 1
            }
          }
        }
      }
    if (message.type === 'executeAction') {
      state.actions.push(message)
      return { type: 'actionResult', data: { success: true } }
    }
    return { type: 'clientCommandResult', data: { success: true } }
  }
}
const results = {
  workspaceRoot: root,
  component: { root: 'packages/server-ai/src/agent-invocation/remote-components/agent-results', runtime: 'module' },
  hostContext: { locale: 'zh-Hans', initialQuery: { selectionId: 'task' } },
  handleRequest() {
    return {
      data: {
        item: {
          id: 'task',
          status: 'succeeded',
          selectedItemId: null,
          result: { text: '结果示例', artifacts: [{ id: 'report', name: 'report.txt', versionId: 'version' }] }
        }
      }
    }
  }
}

async function assertDialog(dialog, dark) {
  await expect(dialog).toBeVisible()
  // Wait for the official open animation before measuring its footer edges.
  await dialog.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
  })
  const style = await dialog.evaluate((element) => {
    const footer = element.querySelector('[data-slot="dialog-footer"]')
    const close = element.querySelector('[data-slot="dialog-close"][data-size="icon-sm"]')
    const bounds = element.getBoundingClientRect(),
      foot = footer.getBoundingClientRect()
    return {
      background: getComputedStyle(element).backgroundColor,
      footerBackground: getComputedStyle(footer).backgroundColor,
      border: getComputedStyle(footer).borderTopWidth,
      left: Math.abs(bounds.left - foot.left),
      right: Math.abs(bounds.right - foot.right),
      titleWeight: getComputedStyle(element.querySelector('[data-slot="dialog-title"]')).fontWeight,
      closeSize: close?.getAttribute('data-size'),
      inViewport: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight
    }
  })
  assert.equal(style.background, dark ? 'rgb(24, 24, 27)' : 'rgb(255, 255, 255)')
  assert.notEqual(style.footerBackground, 'rgba(0, 0, 0, 0)')
  assert.equal(style.border, '1px')
  assert.ok(style.left < 2 && style.right < 2 && style.inViewport)
  assert.equal(style.titleWeight, '500')
  assert.equal(style.closeSize, 'icon-sm')
}

test('built-in Views use shared Nova controls and preserve their interactions', async () => {
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const errors = []
  try {
    for (const scenario of [
      { name: 'light', mode: 'light', width: 1280 },
      { name: 'dark', mode: 'dark', width: 1280 },
      { name: 'narrow', mode: 'light', width: 390 }
    ]) {
      const { mode } = scenario
      for (const [name, config] of Object.entries({ conversation, scheduler, knowledge, coding, results })) {
        const preview = await startRemoteViewPreview(
          {
            ...config,
            workspaceRoot: root,
            logStartup: false,
            state: structuredClone(config.state ?? {}),
            hostContext: {
              ...config.hostContext,
              theme: {
                mode,
                density: mode === 'dark' ? 'compact' : 'default',
                tokens:
                  mode === 'dark'
                    ? {
                        colorBackground: '#09090b',
                        colorForeground: '#fafafa',
                        colorCard: '#18181b',
                        colorCardForeground: '#fafafa',
                        colorPopover: '#18181b',
                        colorPopoverForeground: '#fafafa',
                        colorMuted: '#27272a',
                        colorMutedForeground: '#a1a1aa',
                        colorBorder: '#3f3f46',
                        colorInput: '#3f3f46',
                        colorPrimary: '#fafafa',
                        colorPrimaryForeground: '#18181b',
                        colorSecondary: '#27272a',
                        colorSecondaryForeground: '#fafafa'
                      }
                    : {}
              }
            }
          },
          { port: 0 }
        )
        const page = await browser.newPage({ viewport: { width: scenario.width, height: 900 } })
        page.setDefaultTimeout(10000)
        page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`))
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(`${name}: ${message.text()}`)
        })
        try {
          await page.goto(preview.url)
          const frame = page.frameLocator('#remote-view')
          if (name === 'conversation') {
            const trigger = frame.getByRole('button', { name: '新建对话', exact: true })
            await trigger.click()
            const dialog = frame.getByRole('dialog')
            await assertDialog(dialog, mode === 'dark')
            await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('示例对话')
            await page.screenshot({ path: resolve(output, `${scenario.name}-${name}.png`) })
            await dialog.getByRole('button', { name: '取消', exact: true }).click()
            await expect(dialog).toHaveCount(0)
            await expect(trigger).toBeFocused()
          } else if (name === 'scheduler') {
            await frame.getByRole('combobox', { name: '频率', exact: true }).click()
            await frame.getByRole('option', { name: '每周', exact: true }).click()
            const day = frame.locator('#weekday')
            await expect(day).toBeVisible()
            await day.fill('2')
            await frame.getByRole('button', { name: '保存修改', exact: true }).click()
            await expect.poll(() => preview.state.task.options.frequency).toBe('Weekly')
            assert.equal(preview.state.task.options.dayOfWeek, 2)
          } else if (name === 'knowledge') {
            await frame.getByRole('tab', { name: '原文', exact: true }).click()
            await expect(frame.getByRole('tab', { name: '原文', exact: true })).toHaveAttribute('aria-selected', 'true')
            await frame.getByRole('button', { name: '新建文件夹', exact: true }).click()
            const dialog = frame.getByRole('dialog')
            await assertDialog(dialog, mode === 'dark')
            await dialog.getByRole('textbox').fill('示例文件夹')
            await page.screenshot({ path: resolve(output, `${scenario.name}-${name}.png`) })
            await dialog.getByRole('button', { name: '创建', exact: true }).click()
            await expect(dialog).toHaveCount(0)
            assert.equal(preview.state.actions.at(-1).input.name, '示例文件夹')
            await expect(frame.getByRole('button', { name: '新建文件夹', exact: true })).toBeFocused()
          } else if (name === 'coding') {
            await expect(frame.locator('.execution-status')).toContainText('执行成功')
            await frame.getByRole('button', { name: /搜索/ }).first().click()
            await frame.getByRole('searchbox').fill('校验')
            await expect(frame.locator('.search-count')).not.toBeEmpty()
            await expect(frame.locator('.search-bar [data-slot="button"]').first()).toBeVisible()
          } else {
            const button = frame.getByRole('button', { name: /下载/ })
            await expect(button).toHaveAttribute('data-slot', 'button')
            assert.ok(await button.evaluate((element) => parseFloat(getComputedStyle(element).borderTopWidth) > 0))
          }
          if (!['conversation', 'knowledge'].includes(name))
            await page.screenshot({ path: resolve(output, `${scenario.name}-${name}.png`) })
        } catch (error) {
          console.error(name, mode, errors, await page.frameLocator('#remote-view').locator('body').innerText())
          await page.screenshot({ path: resolve(output, `${scenario.name}-${name}-failure.png`) })
          throw error
        } finally {
          await page.close()
          await preview.close()
        }
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
