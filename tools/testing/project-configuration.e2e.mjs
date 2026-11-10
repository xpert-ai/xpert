import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium, expect } from '@playwright/test'
import { startRemoteViewPreview } from '../remote-view-preview/preview-host.mjs'
import config from '../../packages/server-ai/src/xpert-project/plugins/project-configuration/remote-components/project-configuration/preview.config.mjs'
const root = resolve(import.meta.dirname, '../..')
const output = process.env.PROJECT_CONFIGURATION_E2E_OUTPUT ?? resolve(tmpdir(), 'project-configuration-e2e')
execFileSync(process.execPath, [resolve(config.component.root, 'build.mjs'), '--check'], { cwd: root, stdio: 'pipe' })

test('one isolated configuration view edits all sections through public actions, preserves consent and follows host scope/theme', async () => {
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true }), errors = []
  try {
    for (const scenario of [
      { name: 'light', mode: 'light', width: 1280, locale: 'zh-Hans' },
      { name: 'dark', mode: 'dark', width: 1280, locale: 'en-US' },
      { name: 'narrow', mode: 'light', width: 390, locale: 'zh-Hans' }
    ]) {
      const state = structuredClone(config.state), dark = scenario.mode === 'dark', zh = scenario.locale === 'zh-Hans'
      const text = (cn, en) => zh ? cn : en
      const preview = await startRemoteViewPreview({ ...config, state, isolatedOrigin: true, logStartup: false, logErrors: false,
        hostContext: { ...config.hostContext, locale: scenario.locale, theme: { mode: scenario.mode, density: 'compact', tokens: {
          colorBackground: dark ? '#09090b' : '#ffffff', colorForeground: dark ? '#fafafa' : '#18181b',
          colorCard: dark ? '#18181b' : '#ffffff', colorCardForeground: dark ? '#fafafa' : '#18181b',
          colorPopover: dark ? '#18181b' : '#ffffff', colorPopoverForeground: dark ? '#fafafa' : '#18181b',
          colorSecondary: dark ? '#27272a' : '#f4f4f5', colorSecondaryForeground: dark ? '#fafafa' : '#18181b',
          colorPrimary: dark ? '#fafafa' : '#18181b', colorPrimaryForeground: dark ? '#18181b' : '#ffffff',
          colorBorder: dark ? '#3f3f46' : '#e4e4e7', colorInput: dark ? '#3f3f46' : '#e4e4e7',
          colorMuted: dark ? '#27272a' : '#f4f4f5', colorMutedForeground: dark ? '#a1a1aa' : '#71717a'
        } } } }, { port: 0 })
      const page = await browser.newPage({ viewport: { width: scenario.width, height: 850 } })
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        await page.goto(preview.url)
        const frame = page.frameLocator('#remote-view'), dialog = frame.getByRole('dialog')
        const button = (cn, en, target = dialog) => target.getByRole('button', { name: text(cn, en), exact: true })
        const open = async (section) => {
          await frame.locator(`section[aria-labelledby="heading-${section}"]`).getByRole('button').click()
          await expect(dialog).toBeVisible()
          await expect(dialog).toHaveCSS('opacity','1')
          await expect(dialog.getByRole('status')).toHaveCount(0)
          await expect(dialog.getByRole('alert')).toHaveCount(0)
        }
        const close = async () => { await button('完成','Done').click(); await expect(dialog).toHaveCount(0) }
        const choose = async (label, option) => {
          await dialog.getByRole('combobox', { name: label, exact: true }).click()
          await frame.getByRole('option', { name: option, exact: true }).click()
        }
        const confirm = async () => { await frame.getByRole('alertdialog').getByRole('button', { name: text('确认','Confirm'), exact: true }).click() }
        const input = frame.getByRole('textbox', { name: text('项目指令','Project instructions'), exact: true })
        const save = button('保存指令','Save instructions',frame)
        await expect(input).toHaveValue(state.item.instruction)
        await input.fill('Updated project instructions'); await save.click()
        await expect(frame.getByRole('status')).toHaveText(text('已保存','Saved'))
        await page.reload(); await expect(input).toHaveValue('Updated project instructions')
        for (const section of ['type','experts','members','skills','connectors','automations','delete']) { await open(section); await close() }
        if (scenario.name === 'light') {
          await open('type')
          await dialog.getByRole('spinbutton').fill('10800')
          state.failType = true; await button('保存配置','Save settings').click()
          await expect(dialog.getByRole('alert')).toContainText('Revision conflict')
          await expect(dialog.getByRole('spinbutton')).toHaveValue('10800')
          state.failType = false; await button('保存配置','Save settings').click()
          await expect(dialog.getByRole('alert')).toHaveCount(0)
          await close(); await open('type'); await expect(dialog.getByRole('spinbutton')).toHaveValue('10800'); await close()
          await open('experts'); await button('添加','Add').click(); await expect(dialog.getByText('验收助手',{exact:true})).toHaveCount(1); await close()
          await open('members'); await choose('选择成员','新成员'); await button('添加','Add').click()
          await expect(dialog.getByText('新成员',{exact:true})).toHaveCount(1)
          await dialog.getByRole('textbox',{name:'邮箱'}).fill('invite@example.test'); await button('发送邀请','Send invitation').click()
          await expect(dialog.getByText('invite@example.test')).toBeVisible(); await button('撤销','Revoke').click(); await expect(dialog.getByText('invite@example.test')).toHaveCount(0); await close()
          await open('skills'); await dialog.getByRole('checkbox').click(); await expect(dialog.getByRole('checkbox')).not.toBeChecked()
          await button('安装','Install').click(); await expect(dialog.getByRole('checkbox')).toHaveCount(2)
          await dialog.getByLabel('上传技能包',{exact:true}).setInputFiles({ name: 'skill.zip', mimeType: 'application/zip', buffer: Buffer.from('preview archive') })
          await expect(dialog.getByText('Uploaded skill')).toBeVisible(); assert.equal(state.uploads[0].name,'skill.zip'); assert.equal(Buffer.from(state.uploads[0].bufferBase64,'base64').toString(),'preview archive'); await close()
          await open('connectors'); await dialog.getByLabel('API key',{exact:true}).fill('preview-token')
          await button('连接','Connect').click(); await expect(dialog.getByText('已连接',{exact:true})).toBeVisible()
          await choose('认证方式','OAuth 2.0'); await button('连接','Connect').click()
          const link = dialog.getByRole('link',{name:'打开授权页面'}); await expect(link).toBeVisible()
          await page.context().route('https://example.test/oauth-launch', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>OAuth launch</title><script>document.cookie="oauth_binding=verified; SameSite=Lax; Secure"</script>Authorize' }))
          const popupWait = page.waitForEvent('popup'); await link.click(); const popup = await popupWait
          await popup.waitForLoadState(); assert.match(await popup.evaluate(() => document.cookie),/oauth_binding=verified/); await popup.close(); await close()
          await open('automations'); await button('暂停','Pause').click(); await button('恢复','Resume').click()
          await button('编辑','Edit').click(); await dialog.getByRole('textbox',{name:'名称',exact:true}).fill('Updated automation')
          await dialog.getByRole('checkbox').check(); await button('保存配置','Save settings').click()
          await expect(dialog.getByText('Updated automation',{exact:true})).toBeVisible()
          await choose('选择运行用户','协作成员'); await button('提议运行身份','Propose run-as user').click()
          await expect(dialog.getByText('待确认运行身份: 协作成员')).toBeVisible(); await close()
          state.item.userId = 'member'; state.item.canManage = false; state.item.canEdit = false; state.item.isOwner = false
          await page.reload(); await expect(input).toBeDisabled(); await open('automations')
          await button('接受运行身份','Accept run-as role').click(); await expect(button('接受运行身份','Accept run-as role')).toHaveCount(0)
          await button('编辑','Edit').click(); await expect(dialog.getByRole('textbox',{name:'名称',exact:true})).toHaveCount(0)
          await dialog.getByRole('checkbox').uncheck(); await button('保存配置','Save settings').click()
          await expect(dialog.getByRole('checkbox')).toHaveCount(0)
          assert.equal(state.tasks[0].runAsUserId,'member'); assert.deepEqual(state.tasks[0].runtimeState.human ?? state.tasks[0].runtimeState.__human ?? {},{})
          await close(); state.item.userId = 'owner'; state.item.canManage = true; state.item.canEdit = true; state.item.isOwner = true; await page.reload(); await expect(input).toBeEnabled()
        }
        state.failSave = true; await input.fill('Retained after failure'); await save.click()
        await expect(frame.getByRole('alert')).toContainText('Save denied'); await expect(input).toHaveValue('Retained after failure')
        state.failSave = false; await save.click(); await expect(frame.getByRole('alert')).toHaveCount(0)
        await frame.getByRole('main').evaluate((element) => element.scrollTo(0,0))
        await page.screenshot({ animations: 'disabled', path: resolve(output,`${scenario.name}.png`) })
        await open('members'); await page.screenshot({ animations: 'disabled', path: resolve(output,`${scenario.name}-editor.png`) })
        await expect(dialog).toHaveCSS('background-color',dark ? 'rgb(24, 24, 27)' : 'rgb(255, 255, 255)')
        assert.equal(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth),false)
        await close()
        const metrics = await frame.getByRole('main').evaluate((element) => ({ overflow: element.scrollWidth > element.clientWidth, background: getComputedStyle(element).backgroundColor }))
        assert.equal(metrics.overflow,false); assert.equal(metrics.background,dark ? 'rgb(9, 9, 11)' : 'rgb(255, 255, 255)')
        await open('type')
        // A theme update must not close the open editor or discard its draft.
        await dialog.getByRole('spinbutton').fill('9000')
        await page.evaluate((locale) => document.querySelector('#remote-view').contentWindow.postMessage({ channel: 'xpertai.remote_component', type: 'init', instanceId: 'project-configuration-preview', scopeRevision: 1, locale, theme: { mode: 'dark', density: 'default', tokens: { colorBackground: '#09090b', colorForeground: '#fafafa', borderRadius: '0px' } } }, '*'), scenario.locale)
        await expect(dialog.getByRole('spinbutton')).toHaveValue('9000')
        // Context switches destroy open editors and discard previous-project drafts.
        state.item = { ...state.item, projectId: 'project-b', name: 'Second project', instruction: 'Read-only project', canEdit: false, canManage: false, isOwner: false }
        await page.evaluate(() => window.XpertRemoteViewPreview.emitHostEvent({ type: 'view.context.changed', data: { revision: 2, runtimeScope: { projectId: 'project-b', conversationId: null } } }))
        await expect(dialog).toHaveCount(0); await expect(input).toHaveValue('Read-only project'); await expect(input).toBeDisabled(); await expect(save).toHaveCount(0)
        await open('members'); await expect(button('添加','Add')).toHaveCount(0); await close()
        if (scenario.name === 'light') {
          state.item.canManage = true; state.item.isOwner = true; state.item.canEdit = true; await page.reload(); await expect(input).toBeEnabled()
          await open('delete'); await dialog.getByRole('textbox').fill('Second project'); await button('删除项目','Delete project').click(); await confirm()
          await expect(frame.getByRole('status')).toHaveText('项目已删除'); assert.equal(state.deleted,true)
        }
      } finally { await page.close(); await preview.close() }
    }
    assert.deepEqual(errors,[])
  } finally { await browser.close() }
})


test('custom Project type schemas retain a JSON editor for composed and free-form settings', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    for (const schema of [
      { type: 'object', properties: {}, additionalProperties: true },
      { type: 'object', properties: {}, oneOf: [
        { properties: { target: { const: 'node' } }, required: ['target'] },
        { properties: { target: { const: 'python' } }, required: ['target'] }
      ] }
    ]) {
      const state = structuredClone(config.state)
      state.type.schema = schema
      state.type.effectiveValues = { target: 'node' }
      const preview = await startRemoteViewPreview({ ...config, state, isolatedOrigin: true, logStartup: false,
        hostContext: { ...config.hostContext, locale: 'en-US' } }, { port: 0 })
      const page = await browser.newPage()
      try {
        await page.goto(preview.url)
        const frame = page.frameLocator('#remote-view')
        await frame.locator('section[aria-labelledby="heading-type"]').getByRole('button').click()
        const dialog = frame.getByRole('dialog'), editor = dialog.getByRole('textbox')
        await expect(editor).toHaveValue(JSON.stringify({ target: 'node' }, null, 2))
        await editor.fill('[]')
        await dialog.getByRole('button', { name: 'Save settings', exact: true }).click()
        assert.equal(state.calls.filter((call) => call.key === 'type-save').length, 0)
        const values = { target: 'python', nested: { flags: [true, 'strict'] } }
        await editor.fill(JSON.stringify(values))
        await dialog.getByRole('button', { name: 'Save settings', exact: true }).click()
        await expect.poll(() => state.type.revision).toBe(2)
        assert.deepEqual(state.type.effectiveValues, values)
      } finally { await page.close(); await preview.close() }
    }
  } finally { await browser.close() }
})
