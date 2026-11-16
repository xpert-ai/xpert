import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium, expect } from '@playwright/test'
import { startRemoteViewPreview } from '../remote-view-preview/preview-host.mjs'

const workspaceRoot = resolve(import.meta.dirname, '../..')
const rows = [
  ['插件开发与验收', '验证插件安装与发布流程', 'owner'],
  ['客户门户改版', '交付新版客户工作台', 'manager'],
  ['服务接口联调', '跟进接口联调与回归测试', 'editor'],
  ['交付资料库', '共享交付模板与参考文档', 'member'],
  ['上一期交付', '', 'owner']
].map(([name, description, myRole], index) => ({
  id: randomUUID(), name, description, myRole, archived: index === 4, canEdit: index < 3, canManage: index < 2,
  applicationKey: 'platform', projectTypeKey: index === 3 ? 'space' : 'general', updatedAt: new Date().toISOString()
}))

test('directory renders role actions, filters and scoped navigation in the remote iframe', async () => {
  const commands = []
  const preview = await startRemoteViewPreview({
    workspaceRoot, component: { root: resolve(workspaceRoot, 'packages/server-ai/src/xpert-project/remote-components/project-list'), runtime: 'react' },
    title: 'Project list', isolatedOrigin: true, logStartup: false, logErrors: false,
    hostContext: { locale: 'zh-Hans', scopeRevision: 1, theme: { mode: 'light', density: 'compact', tokens: {} } },
    handleRequest(message) {
      if (message.type === 'invokeClientCommand') {
        commands.push(message.payload)
        return { data: { success: true } }
      }
      assert.equal(message.type, 'requestData')
      const { search, parameters } = message.query
      const visible = rows.filter((row) => !parameters.manageableOnly || row.canManage)
      const items = visible.filter((row) => (!search || row.name.includes(search)) && (!parameters.projectTypeKey || row.projectTypeKey === parameters.projectTypeKey))
      return { data: {
        items, total: items.length, summary: { assistantName: '编码交付助手', types: [
          { applicationKey: 'platform', projectTypeKey: 'general' }, { applicationKey: 'platform', projectTypeKey: 'space' }
        ] }
      } }
    }
  }, { port: 0 })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } })
    await page.goto(preview.url)
    const frame = page.frameLocator('#remote-view'), row = (name) => frame.getByRole('row', { name: new RegExp(name) })
    const config = (name) => row(name).getByRole('button', { name: '配置' })
    await expect(frame.getByRole('row')).toHaveCount(6)
    await expect(config('服务接口联调')).toBeVisible()
    await expect(config('交付资料库')).toHaveCount(0)
    await expect(row('上一期交付').getByRole('button')).toHaveCount(0)
    if (process.env.PROJECT_LIST_E2E_OUTPUT) {
      await mkdir(process.env.PROJECT_LIST_E2E_OUTPUT, { recursive: true })
      await page.locator('#remote-view').screenshot({ path: resolve(process.env.PROJECT_LIST_E2E_OUTPUT, 'project-list-implemented.png') })
    }
    await row('交付资料库').getByRole('button', { name: '打开' }).click()
    await config('服务接口联调').click()
    await expect.poll(() => commands.length).toBe(2)
    assert.deepEqual(commands, [
      { target: 'assistant.project', projectId: rows[3].id, viewKey: 'platform.project-tasks__timeline' },
      { target: 'assistant.project', projectId: rows[2].id, viewKey: 'platform.project-configuration__configuration' }
    ])
    await frame.getByRole('combobox').click()
    await frame.getByRole('option', { name: '协作空间' }).click()
    await expect(frame.getByRole('row')).toHaveCount(2)
    await frame.getByRole('tab', { name: '我可管理' }).click()
    await expect(frame.getByRole('row')).toHaveCount(3)
    await frame.getByRole('searchbox').fill('无匹配结果')
    await expect(frame.getByRole('status')).toHaveText('没有匹配的项目')
    await frame.getByRole('searchbox').fill('')
    await page.setViewportSize({ width: 390, height: 800 })
    await expect(config('客户门户改版')).toBeVisible()
    const overflows = await frame.locator('body').evaluate((body) => body.scrollWidth > body.clientWidth)
    assert.equal(overflows, false)
  } finally { await browser.close(); await preview.close() }
})
