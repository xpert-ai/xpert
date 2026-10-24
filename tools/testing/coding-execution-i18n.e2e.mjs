import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium, expect } from '@playwright/test'
import { startRemoteViewPreview } from '../remote-view-preview/preview-host.mjs'
import config from '../../packages/server-ai/src/agent-invocation/remote-components/coding-execution/preview.config.mjs'

const root = resolve(import.meta.dirname, '../..')
const output = process.env.CODING_I18N_E2E_OUTPUT ?? resolve(tmpdir(), 'coding-execution-i18n')
const locales = [
  {
    locale: 'en_US',
    lang: 'en-US',
    title: 'Codex · Execution',
    search: 'Search (/)',
    placeholder: 'Search loaded activity…',
    close: 'Close search',
    theme: 'Color theme',
    palette: 'Midnight',
    copy: 'Copy output',
    info: 'Technical info',
    count: '{…} · 1 field'
  },
  {
    locale: 'zh_CN',
    lang: 'zh-Hans',
    title: 'Codex · 执行过程',
    search: '搜索（/）',
    placeholder: '搜索已加载的过程…',
    close: '关闭搜索',
    theme: '颜色主题',
    palette: '深蓝',
    copy: '复制输出',
    info: '技术信息',
    count: '{…} · 1 个字段'
  },
  {
    locale: 'zh_TW',
    lang: 'zh-Hant',
    title: 'Codex · 執行過程',
    search: '搜尋（/）',
    placeholder: '搜尋已載入的過程…',
    close: '關閉搜尋',
    theme: '色彩主題',
    palette: '深藍',
    copy: '複製輸出',
    info: '技術資訊',
    count: '{…} · 1 個欄位'
  }
]

test('built Coding Execution localizes all three languages on desktop and narrow screens', async () => {
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const errors = []
  try {
    for (const locale of locales)
      for (const width of [1280, 390]) {
        const preview = await startRemoteViewPreview(
          {
            ...config,
            workspaceRoot: root,
            logStartup: false,
            hostContext: { ...config.hostContext, locale: locale.locale },
            async handleRequest(message) {
              const reply = await config.handleRequest(message)
              const activity = reply.data.item.activity
              const last = activity.items.at(-1)
              activity.items.push({
                id: 'json-preview',
                seq: last.seq + 1,
                firstSeq: last.seq + 1,
                observedAt: last.observedAt,
                content: { kind: 'message', text: '{"files":["原始.txt"]}' }
              })
              activity.nextCursor++
              return reply
            }
          },
          { port: 0 }
        )
        const page = await browser.newPage({ viewport: { width, height: 900 } })
        page.setDefaultTimeout(10000)
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text())
        })
        try {
          await page.goto(preview.url)
          const frame = page.frameLocator('#remote-view')
          await expect(frame.locator('html')).toHaveAttribute('lang', locale.lang)
          await expect(frame.getByRole('heading', { level: 1 })).toHaveText(locale.title)
          await expect(frame.getByRole('button', { name: locale.copy, exact: true }).first()).toBeVisible()
          const theme = frame.getByRole('combobox', { name: locale.theme, exact: true })
          await theme.click()
          await frame.getByRole('option', { name: locale.palette, exact: true }).click()
          await expect(theme).toContainText(locale.palette)
          await frame.getByRole('button', { name: locale.search, exact: true }).click()
          const input = frame.getByRole('searchbox', { name: locale.placeholder, exact: true })
          await input.fill('校验')
          await expect(frame.locator('.search-count')).toHaveText('1 / 2')
          await frame.getByRole('button', { name: locale.close, exact: true }).click()
          await expect(frame.locator('.search-bar')).toBeHidden()
          const info = frame.locator('.technical-info > summary')
          await expect(info).toHaveText(locale.info)
          await info.click()
          await expect(frame.locator('.technical-body')).toContainText('2026')
          await info.click()
          await expect(frame.locator('.json-tree .json-description').first()).toHaveText(locale.count)
          await expect(frame.locator('.public-message').first()).toHaveText(
            '我会补充数组求和的输入校验，再验证已有行为。'
          )
          const viewport = await frame
            .locator('html')
            .evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth }))
          assert.ok(viewport.scroll <= viewport.width + 1, `${locale.lang} overflow at ${width}px`)
          await page.screenshot({ path: resolve(output, `${locale.lang}-${width}.png`) })
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
