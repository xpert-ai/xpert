import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { startRemoteViewPreview } from '../remote-view-preview/preview-host.mjs'

const label = (en_US, zh_Hans) => ({ en_US, zh_Hans })
const icon = (value) => ({ type: 'font', value })
const examples = [
  ['github', 'GitHub 事件', '拉取请求', 'git-pull-request', 'PR #42 · 更新接口', 'handled'],
  ['procurement', '采购事件', '报价修订', 'package', '供应商 A 延迟交货', 'handled'],
  ['lark', '飞书消息', '卡片操作', 'send', '采购风险回复', 'blocked']
].map(([key, category, type, glyph, title, state], i) => ({
  id: String(i),
  type: key + '.example',
  schemaVersion: 1,
  title,
  state,
  subject: 'subject-' + i,
  receivedAt: '2026-11-15T01:00:00Z',
  assistantId: 'a' + i,
  assistant: category + ' Assistant',
  display: {
    label: label(type, type),
    icon: icon(glyph),
    category: { key, label: label(category, category), icon: icon(glyph) }
  }
}))
const directory = process.env.XPERT_EVENT_VIEW_EVIDENCE_DIR
const screenshots = process.env.XPERT_EVENT_VIEW_SCREENSHOTS
async function capture(frame, name) {
  if (!screenshots) return
  await mkdir(screenshots, { recursive: true })
  await frame.locator('body').screenshot({ path: resolve(screenshots, name + '.png') })
}
const fixtures = directory
  ? await Promise.all(
      ['github', 'procurement', 'lark'].map(async (key) =>
        JSON.parse(await readFile(resolve(directory, key + '.json'), 'utf8'))
      )
    )
  : examples
test('personal and Assistant hosts render the same three-column inbox; narrow screens open a detail sheet', async () => {
  const browser = await chromium.launch()
  try {
    for (const personal of [true, false]) {
      const commands = []
      const preview = await startRemoteViewPreview(
        {
          workspaceRoot: resolve(import.meta.dirname, '../..'),
          component: { root: 'packages/server-ai/src/agent-event/remote-components/event-inbox', runtime: 'react' },
          logStartup: false,
          hostContext: { locale: 'zh-Hans' },
          state: {},
          handleRequest({ type, query = {}, commandKey, payload }) {
            if (type === 'invokeClientCommand') {
              commands.push({ commandKey, payload })
              return { type: 'clientCommandResult', result: { success: true } }
            }
            const visible = personal ? fixtures : fixtures.slice(0, 1)
            if (query.selectionId) {
              const row = visible.find((r) => r.id === query.selectionId)
              // The preview host grants only the first receipt a conversation action.
              const conversationAction = row.id === fixtures[0].id ? { type: 'open_conversation' } : undefined
              return {
                type: 'data',
                data: {
                  item: directory
                    ? { ...row, conversationAction }
                    : {
                        conversationAction,
                        ...row,
                        sourceEventId: 'external',
                        occurredAt: row.receivedAt,
                        attempt: 1,
                        canRetry: false,
                        decision:
                          row.state === 'blocked'
                            ? { status: 'blocked', reasonCode: 'card_access_changed' }
                            : { status: 'handled' },
                        ...(row.id === '1'
                          ? {
                              result: {
                                action: label('View risk', '查看风险'),
                                fields: [{ label: label('Severity', '风险等级'), value: 'high' }]
                              }
                            }
                          : {})
                      }
                }
              }
            }
            const matches = visible.filter((r) => !query.search || r.title.includes(query.search))
            return {
              type: 'data',
              data: {
                items: matches.filter(
                  (r) => !query.parameters?.category || r.display.category.key === query.parameters.category
                ),
                summary: {
                  personal,
                  count: matches.length,
                  assistants: visible.map((r) => ({ id: r.assistantId, name: r.assistant })),
                  categories: matches.map((r) => ({
                    key: r.display.category.key,
                    display: r.display.category,
                    count: 1
                  }))
                }
              }
            }
          }
        },
        { port: 0 }
      )
      const page = await browser.newPage({ viewport: { width: 1440, height: 880 } })
      try {
        const errors = []
        page.on('pageerror', (err) => errors.push(err.message))
        await page.goto(preview.url)
        const frame = page.frameLocator('#remote-view')
        await expect(frame.getByRole('button', { name: fixtures[0].title })).toBeVisible()
        await expect(frame.getByRole('combobox', { name: 'Assistant', exact: true })).toHaveCount(personal ? 1 : 0)
        const positions = await frame
          .locator('main > aside,main > section')
          .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().x))
        assert(positions.length === 3 && positions[0] < positions[1] && positions[1] < positions[2])
        const openConversation = frame.getByRole('button', { name: '打开会话', exact: true })
        await openConversation.click()
        await expect
          .poll(() => commands)
          .toEqual([{ commandKey: 'open_conversation', payload: { receiptId: fixtures[0].id } }])
        if (directory) {
          await frame.getByRole('button', { name: '打开评审' }).click()
          await expect(frame.getByText('Verified review result', { exact: true })).toBeVisible()
        }
        await capture(frame, personal ? 'personal-inbox' : 'assistant-inbox')
        if (personal) {
          await frame.getByRole('button', { name: /采购事件.*1/ }).click()
          await frame.getByRole('button', { name: fixtures[1].title }).click()
          await frame.getByRole('button', { name: '查看风险' }).click()
          await expect(frame.getByText('风险等级', { exact: true })).toBeVisible()
          await frame.getByRole('button', { name: /全部事件/ }).click()
          await frame.getByRole('textbox').fill(fixtures[2].title)
          await expect(frame.getByRole('table').getByRole('button')).toHaveCount(1)
          await page.setViewportSize({ width: 520, height: 840 })
          await frame.getByRole('button', { name: fixtures[2].title }).click()
          await expect(frame.getByRole('dialog')).toContainText('card_access_changed')
          await expect(openConversation).toHaveCount(0)
          await capture(frame, 'narrow-inbox')
          await page.keyboard.press('Escape')
          await expect(frame.getByRole('dialog')).toHaveCount(0)
        }
        assert.deepEqual(errors, [])
      } finally {
        await page.close()
        await preview.close()
      }
    }
  } finally {
    await browser.close()
  }
})

test('refresh and retry retain the selected event across pages and in the narrow detail sheet', async (t) => {
  const [review, original] = examples
  const procurement = { ...original, state: 'isolated' }
  let rows = [review, procurement]
  let listReads = 0
  let retries = 0
  const preview = await startRemoteViewPreview(
    {
      workspaceRoot: resolve(import.meta.dirname, '../..'),
      component: { root: 'packages/server-ai/src/agent-event/remote-components/event-inbox', runtime: 'react' },
      logStartup: false,
      hostContext: { locale: 'en' },
      handleRequest({ type, query = {}, actionKey, targetId }) {
        if (type === 'executeAction') {
          assert.equal(actionKey, 'retry')
          assert.equal(targetId, procurement.id)
          retries++
          procurement.state = 'pending'
          return { type: 'actionResult', result: { success: true, refresh: true } }
        }
        if (query.selectionId) {
          const row = rows.find((r) => r.id === query.selectionId)
          if (!row) return { type: 'error', message: 'Receipt unavailable' }
          return {
            type: 'data',
            data: {
              item: {
                ...row,
                sourceEventId: row.id,
                occurredAt: row.receivedAt,
                attempt: 1,
                canRetry: row.state === 'isolated'
              }
            }
          }
        }
        listReads++
        const offset = Number(query.cursor ?? 0)
        return {
          type: 'data',
          data: {
            items: rows.slice(offset, offset + 1),
            nextCursor: offset + 1 < rows.length ? String(offset + 1) : undefined,
            summary: { personal: true, assistants: [], categories: [], count: rows.length }
          }
        }
      }
    },
    { port: 0 }
  )
  t.after(() => preview.close())
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 880 } })
  await page.goto(preview.url)
  const frame = page.frameLocator('#remote-view')
  await frame.getByRole('button', { name: 'Load more' }).click()
  const selected = frame.getByRole('button', { name: procurement.title, exact: true })
  await selected.click()
  const detail = frame.getByRole('region', { name: 'Event details' })
  await expect(detail.getByRole('heading', { name: procurement.title })).toBeVisible()
  const reads = listReads
  await frame.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => listReads).toBeGreaterThanOrEqual(reads + 2)
  await expect(selected).toHaveAttribute('aria-pressed', 'true')
  await expect(detail.getByRole('heading', { name: procurement.title })).toBeVisible()

  await page.setViewportSize({ width: 520, height: 840 })
  await selected.click()
  const sheet = frame.getByRole('dialog', { name: 'Event details' })
  await sheet.getByRole('button', { name: 'Retry' }).click()
  await frame.getByRole('alertdialog').getByRole('button', { name: 'Retry' }).click()
  await expect(sheet.getByText('Pending', { exact: true })).toBeVisible()
  await expect(sheet.getByRole('heading', { name: procurement.title })).toBeVisible()
  assert.equal(retries, 1)

  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 880 })
  rows = [review]
  await frame.getByRole('button', { name: 'Refresh' }).click()
  await expect(detail.getByRole('heading', { name: review.title })).toBeVisible()
  await expect(selected).toHaveCount(0)
})
