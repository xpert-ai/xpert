import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { chromium, expect } from '@playwright/test'
import { startRemoteViewPreview } from '../remote-view-preview/preview-host.mjs'
import { build } from 'esbuild'
import previewConfig from '../../packages/server-ai/src/xpert-project/plugins/project-configuration/remote-components/project-configuration/preview.config.mjs'
const root = resolve(import.meta.dirname, '../..')
// Test this checkout's bridge even when plugin-sdk/dist is stale or rebuilt concurrently.
const rendererBuild = await build({
  entryPoints: [resolve(root, 'packages/plugin-sdk/src/lib/view-extension/remote-component-html.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false
})
const renderers = await import(
  `data:text/javascript;base64,${Buffer.from(rendererBuild.outputFiles[0].contents).toString('base64')}`
)
const config = { ...previewConfig, renderers }
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
        const frame = page.frameLocator('#remote-view'), panel = frame.getByRole('tabpanel')
        const labels = {
          instructions: text('指令','Instructions'), type: text('类型配置','Type configuration'),
          experts: text('专家','Experts'), members: text('成员','Members'), skills: text('技能','Skills'),
          connectors: text('连接器','Connectors'), automations: text('自动化','Automations'), delete: text('删除项目','Delete project')
        }
        const tab = (key) => frame.getByRole('tab', { name: labels[key], exact: true })
        const button = (cn, en, target = panel) => target.getByRole('button', { name: text(cn, en), exact: true })
        const open = async (key) => {
          await tab(key).click()
          await expect(tab(key)).toHaveAttribute('aria-selected', 'true')
          await expect(panel).toHaveCount(1)
          await expect(panel.getByText(text('处理中…','Working…'), { exact: true })).toHaveCount(0)
          await expect(frame.getByRole('dialog')).toHaveCount(0)
        }
        const choose = async (label, option) => {
          await panel.getByRole('combobox', { name: label, exact: true }).click()
          await frame.getByRole('option', { name: option, exact: true }).click()
        }
        const confirm = async () => { await frame.getByRole('alertdialog').getByRole('button', { name: text('确认','Confirm'), exact: true }).click() }
        const input = frame.getByRole('textbox', { name: text('项目指令','Project instructions'), exact: true })
        const save = button('保存指令','Save instructions',frame)
        await expect(frame.getByRole('heading', { level: 1 })).toHaveText(state.item.name)
        await expect(tab('instructions')).toHaveAttribute('aria-selected', 'true')
        await expect(input).toHaveValue(state.item.instruction)
        await tab('instructions').focus()
        await tab('instructions').press('ArrowRight')
        await expect(tab('type')).toBeFocused()
        await tab('type').press('Enter')
        await expect(tab('type')).toHaveAttribute('aria-selected','true')
        await open('instructions')
        await input.fill('Updated project instructions')
        await open('members'); await open('instructions')
        await expect(input).toHaveValue('Updated project instructions')
        await save.click()
        await expect(frame.getByRole('status')).toHaveText(text('已保存','Saved'))
        await page.reload(); await expect(input).toHaveValue('Updated project instructions')
        for (const section of ['type','experts','members','skills','connectors','automations','delete']) await open(section)
        await open('instructions')
        if (scenario.name === 'light') {
          await open('type')
          await panel.getByRole('spinbutton').fill('10800')
          state.failType = true; await button('保存配置','Save settings').click()
          await expect(panel.getByRole('alert')).toContainText('Revision conflict')
          await expect(panel.getByRole('spinbutton')).toHaveValue('10800')
          state.failType = false; await button('保存配置','Save settings').click()
          await expect(panel.getByRole('alert')).toHaveCount(0)
          await open('instructions'); await open('type'); await expect(panel.getByRole('spinbutton')).toHaveValue('10800')
          await open('experts')
          const picker = button('添加专家','Add expert')
          await expect(picker).toHaveAttribute('aria-expanded','false')
          await picker.click(); await expect(picker).toHaveAttribute('aria-expanded','true')
          const searchExperts = panel.getByRole('searchbox', { name: '搜索专家' })
          await searchExperts.fill('未匹配'); await expect(panel.getByText('没有匹配的专家，请换个关键词。')).toBeVisible()
          await searchExperts.fill(''); await button('添加','Add').click()
          await expect(panel.getByText('当前没有可添加到此项目的专家。')).toBeVisible()
          await expect(panel.getByText('验收助手',{exact:true})).toHaveCount(1)
          await picker.click(); await expect(searchExperts).toHaveCount(0)
          await open('members'); await button('添加成员','Add member').click(); await button('添加','Add').click()
          await expect(panel.getByText('新成员',{exact:true})).toHaveCount(1)
          await expect(frame.locator('header dl div').filter({ has: frame.getByText('成员', { exact: true }) }).locator('dd')).toHaveText('3')
          await button('邮件邀请','Invite by email').click(); await panel.getByRole('textbox',{name:'邮箱'}).fill('invite@example.test'); await button('发送邀请','Send invitation').click()
          await expect(panel.getByText('invite@example.test')).toBeVisible(); await button('撤销','Revoke').click(); await expect(panel.getByText('invite@example.test')).toHaveCount(0)
          await open('skills'); await panel.getByRole('checkbox').click(); await expect(panel.getByRole('checkbox')).not.toBeChecked()
          await button('安装技能','Install skill').click(); await button('安装','Install').click(); await expect(panel.getByRole('checkbox')).toHaveCount(2); await expect(panel.getByText('已安装',{exact:true})).toBeVisible()
          await panel.getByLabel('上传技能包',{exact:true}).setInputFiles({ name: 'skill.zip', mimeType: 'application/zip', buffer: Buffer.from('preview archive') })
          await expect(panel.getByText('Uploaded skill')).toBeVisible(); assert.equal(state.uploads[0].name,'skill.zip'); assert.equal(Buffer.from(state.uploads[0].bufferBase64,'base64').toString(),'preview archive')
          await open('connectors'); await button('添加连接器','Add connector').click(); await expect(panel.getByText('当前没有可添加的共享连接器。')).toBeVisible(); await button('连接设置','Connection settings').click(); await panel.getByLabel('API key',{exact:true}).fill('preview-token')
          await button('连接','Connect').click(); await expect(panel.getByText('已连接',{exact:true})).toBeVisible()
          await choose('认证方式','OAuth 2.0'); await button('连接','Connect').click()
          const link = panel.getByRole('link',{name:'打开授权页面'}); await expect(link).toBeVisible()
          await page.context().route('https://example.test/oauth-launch', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>OAuth launch</title><script>document.cookie="oauth_binding=verified; SameSite=Lax; Secure"</script>Authorize' }))
          const popupWait = page.waitForEvent('popup'); await link.click(); const popup = await popupWait
          await popup.waitForLoadState(); assert.match(await popup.evaluate(() => document.cookie),/oauth_binding=verified/); await popup.close()
          await open('automations'); await button('暂停','Pause').click(); await button('恢复','Resume').click()
          await button('编辑','Edit').click(); await panel.getByRole('textbox',{name:'名称',exact:true}).fill('Updated automation')
          await panel.getByRole('checkbox').check(); await button('保存配置','Save settings').click()
          await expect(panel.getByText('Updated automation',{exact:true})).toBeVisible()
          await choose('选择运行用户','协作成员'); await button('提议运行身份','Propose run-as user').click()
          await expect(panel.getByText('待确认运行身份: 协作成员')).toBeVisible()
          state.item.userId = 'member'; state.item.canManage = false; state.item.canEdit = false; state.item.isOwner = false
          await page.reload(); await expect(input).toBeDisabled(); await open('automations')
          await button('接受运行身份','Accept run-as role').click(); await expect(button('接受运行身份','Accept run-as role')).toHaveCount(0)
          await button('编辑','Edit').click(); await expect(panel.getByRole('textbox',{name:'名称',exact:true})).toHaveCount(0)
          await panel.getByRole('checkbox').uncheck(); await button('保存配置','Save settings').click()
          await expect(panel.getByRole('checkbox')).toHaveCount(0)
          assert.equal(state.tasks[0].runAsUserId,'member'); assert.deepEqual(state.tasks[0].runtimeState.human ?? state.tasks[0].runtimeState.__human ?? {},{})
          state.item.userId = 'owner'; state.item.canManage = true; state.item.canEdit = true; state.item.isOwner = true; await page.reload(); await expect(input).toBeEnabled()
        }
        state.failSave = true; await input.fill('Retained after failure'); await save.click()
        await expect(frame.getByRole('alert')).toContainText('Save denied'); await expect(input).toHaveValue('Retained after failure')
        state.failSave = false; await save.click(); await expect(frame.getByRole('alert')).toHaveCount(0)
        await open('instructions')
        await page.screenshot({ animations: 'disabled', path: resolve(output,`${scenario.name}.png`) })
        await open('members')
        await expect(panel.getByText(state.item.members[0].name, { exact: true })).toBeVisible()
        await expect(button('添加成员','Add member')).toBeVisible()
        await page.screenshot({ animations: 'disabled', path: resolve(output,`${scenario.name}-editor.png`) })
        assert.equal(await panel.evaluate((element) => element.scrollWidth > element.clientWidth),false)
        for (const [section, cn, en] of [['experts','添加专家','Add expert'],['members','添加成员','Add member'],['skills','安装技能','Install skill'],['connectors','添加连接器','Add connector'],['automations','添加自动化','Add automation']]) {
          await open(section)
          const trigger = button(cn,en)
          if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click()
          await expect(trigger).toHaveAttribute('aria-expanded','true')
          assert.equal(await panel.evaluate((el) => el.scrollWidth > el.clientWidth),false)
        }
        const frequency = text('频率','Frequency')
        await choose(frequency, text('每年','Yearly'))
        await panel.getByRole('textbox', { name: text('名称','Name'), exact: true }).fill('Annual review')
        await panel.getByRole('textbox', { name: text('任务指令','Instructions'), exact: true }).fill('Review')
        await button('保存配置','Save settings').click()
        await expect(panel.getByRole('alert')).toHaveText(text('请为此计划选择日期。','Choose a date for this schedule.'))
        const date = panel.getByRole('button', { name: zh ? /^日期 / : /^Date / })
        await expect(date).toBeFocused()
        await date.click()
        const calendar = frame.getByRole('dialog', { name: text('选择日期','Choose a date') })
        const day = calendar.locator('[data-day]:focus')
        await expect(day).toHaveCount(1)
        await day.press('ArrowRight')
        const selected = await day.getAttribute('data-day')
        await day.press('Enter')
        await expect(calendar).toHaveCount(0)
        await expect(date).toBeFocused()
        const timeField = panel.getByRole('button', { name: zh ? /^时间 / : /^Time \d/ })
        await timeField.click()
        const clock = frame.getByRole('dialog', { name: text('选择时间','Choose a time') })
        const hour = clock.getByRole('slider', { name: text('小时','Hour') })
        await hour.press('Home'); await hour.press('Enter')
        const minute = clock.getByRole('slider', { name: text('分钟','Minute') })
        await minute.press('End')
        await button('完成','Done',clock).click()
        await expect(timeField).toContainText('00:59')
        const zoneField = panel.getByRole('button', { name: zh ? /^时区 / : /^Time zone / })
        await zoneField.click()
        const zones = frame.getByRole('dialog', { name: text('时区','Time zone'), exact: true })
        const searchZone = zones.getByRole('combobox')
        await searchZone.fill('not-a-zone')
        await expect(zones.getByText(text('没有匹配结果，请换个关键词。','No matches. Try another search.'))).toBeVisible()
        await searchZone.fill(text('纽约','new york'))
        await searchZone.press('Enter')
        await expect(zoneField).toContainText('America/New_York')
        await button('保存配置','Save settings').click()
        const [, month, dayOfMonth] = selected.split('-').map(Number)
        await expect.poll(() => state.tasks.find((task) => task.name === 'Annual review')?.options)
          .toEqual({ frequency: 'Yearly', date: selected, month, dayOfMonth, time: '00:59' })
        assert.equal(state.tasks.find((task) => task.name === 'Annual review').timeZone, 'America/New_York')
        const metrics = await frame.getByRole('main').evaluate((element) => ({ overflow: element.scrollWidth > element.clientWidth, background: getComputedStyle(element).backgroundColor }))
        assert.equal(metrics.overflow,false); assert.equal(metrics.background,dark ? 'rgb(9, 9, 11)' : 'rgb(255, 255, 255)')
        await open('type')
        // A theme update must not close the open editor or discard its draft.
        await panel.getByRole('spinbutton').fill('9000')
        await open('members'); await open('type')
        await expect(panel.getByRole('spinbutton')).toHaveValue('9000')
        await page.evaluate((locale) => document.querySelector('#remote-view').contentWindow.postMessage({ channel: 'xpertai.remote_component', type: 'init', instanceId: 'project-configuration-preview', scopeRevision: 1, locale, theme: { mode: 'dark', density: 'default', tokens: { colorBackground: '#09090b', colorForeground: '#fafafa', borderRadius: '0px' } } }, '*'), scenario.locale)
        await expect(panel.getByRole('spinbutton')).toHaveValue('9000')
        // Context switches destroy open editors and discard previous-project drafts.
        state.item = { ...state.item, projectId: 'project-b', name: 'Second project', instruction: 'Read-only project', canEdit: false, canManage: false, isOwner: false }
        await page.evaluate(() => window.XpertRemoteViewPreview.emitHostEvent({ type: 'view.context.changed', data: { revision: 2, runtimeScope: { projectId: 'project-b', conversationId: null } } }))
        await expect(tab('instructions')).toHaveAttribute('aria-selected','true'); await expect(tab('delete')).toHaveCount(0); await expect(input).toHaveValue('Read-only project'); await expect(input).toBeDisabled(); await expect(save).toHaveCount(0)
        await open('automations'); await expect(button('添加自动化','Add automation')).toHaveCount(0)
        await open('experts'); await expect(button('添加专家','Add expert')).toHaveCount(0)
        await open('members'); await expect(button('添加成员','Add member')).toHaveCount(0)
        await open('skills'); await expect(button('安装技能','Install skill')).toHaveCount(0)
        await open('connectors'); await expect(button('添加连接器','Add connector')).toHaveCount(0)
        if (scenario.name === 'light') {
          state.item.canManage = true; state.item.isOwner = true; state.item.canEdit = true; await page.reload(); await expect(input).toBeEnabled()
          await open('delete'); await panel.getByRole('textbox').fill('Second project'); await button('删除项目','Delete project').click(); await confirm()
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
        await frame.getByRole('tab', { name: 'Type configuration', exact: true }).click()
        const panel = frame.getByRole('tabpanel'), editor = panel.getByRole('textbox')
        await expect(editor).toHaveValue(JSON.stringify({ target: 'node' }, null, 2))
        await editor.fill('[]')
        await panel.getByRole('button', { name: 'Save settings', exact: true }).click()
        assert.equal(state.calls.filter((call) => call.key === 'type-save').length, 0)
        const values = { target: 'python', nested: { flags: [true, 'strict'] } }
        await editor.fill(JSON.stringify(values))
        await panel.getByRole('button', { name: 'Save settings', exact: true }).click()
        await expect.poll(() => state.type.revision).toBe(2)
        assert.deepEqual(state.type.effectiveValues, values)
      } finally { await page.close(); await preview.close() }
    }
  } finally { await browser.close() }
})

test('Project type enum editors preserve primitive and structured JSON values', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    for (const scenario of [
      { field: { enum: ['auto', 2, false, null] }, initial: 'auto', next: false, primitive: true },
      { field: { type: 'object', properties: { mode: { type: 'string' } }, enum: [{ mode: 'node' }, { mode: 'python' }] }, initial: { mode: 'node' }, next: { mode: 'python' } },
      { field: { type: 'array', enum: [['node'], ['python', true]] }, initial: ['node'], next: ['python', true] },
      { field: { enum: ['auto', { flags: [true, 2] }] }, initial: 'auto', next: { flags: [true, 2] } },
      { root: true, field: { type: 'object', properties: { mode: { type: 'string' } }, enum: [{ mode: 'node' }, { mode: 'python' }] }, initial: { mode: 'node' }, next: { mode: 'python' } }
    ]) {
      const state = structuredClone(config.state)
      state.type.schema = scenario.root ? scenario.field : { type: 'object', properties: { choice: { ...scenario.field, title: 'Choice' } } }
      state.type.effectiveValues = scenario.root ? scenario.initial : { choice: scenario.initial }
      const preview = await startRemoteViewPreview({ ...config, state, isolatedOrigin: true, logStartup: false,
        hostContext: { ...config.hostContext, locale: 'en-US' } }, { port: 0 })
      const page = await browser.newPage()
      try {
        await page.goto(preview.url)
        const frame = page.frameLocator('#remote-view')
        await frame.getByRole('tab', { name: 'Type configuration', exact: true }).click()
        const panel = frame.getByRole('tabpanel'), save = panel.getByRole('button', { name: 'Save settings', exact: true })
        if (scenario.primitive) {
          await panel.getByRole('combobox', { name: 'Choice' }).click()
          await frame.getByRole('option', { name: 'false', exact: true }).click()
        } else {
          const editor = panel.getByRole('textbox')
          await expect(editor).toHaveValue(JSON.stringify(scenario.initial, null, 2))
          await editor.fill('{')
          await save.click()
          assert.equal(state.calls.filter((call) => call.key === 'type-save').length, 0)
          await editor.fill(JSON.stringify(scenario.next))
        }
        await save.click()
        await expect.poll(() => state.type.revision).toBe(2)
        assert.deepEqual(state.type.effectiveValues, scenario.root ? scenario.next : { choice: scenario.next })
        await expect(panel.getByRole('alert')).toHaveCount(0)
        await frame.getByRole('tab', { name: 'Instructions', exact: true }).click()
        await frame.getByRole('tab', { name: 'Type configuration', exact: true }).click()
        if (scenario.primitive) await expect(panel.getByRole('combobox', { name: 'Choice' })).toHaveText('false')
        else await expect(panel.getByRole('textbox')).toHaveValue(JSON.stringify(scenario.next, null, 2))
      } finally { await page.close(); await preview.close() }
    }
  } finally { await browser.close() }
})
