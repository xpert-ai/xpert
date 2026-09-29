import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const base = process.env.BOSI_UI_BASE || 'http://127.0.0.1:4391'
const output = process.env.BOSI_UI_OUTPUT || '/tmp/bosi-trigger-ui'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1100, height: 850 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const open = (query = '') => page.goto(`${base}/tests/fixtures/trigger-preview.html${query}`)
const tab = (name) => page.getByRole('tab', { name, exact: true }).click()
const button = (name) => page.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog')
const countHostCalls = () =>
  page.evaluateHandle(() => {
    const calls = {}
    const fetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      if (input === '/__desktop') {
        const { method } = JSON.parse(String(init?.body))
        calls[method] = (calls[method] || 0) + 1
      }
      return fetch(input, init)
    }
    return calls
  })
const visible = async (locator) => {
  await locator.waitFor({ state: 'visible' })
  assert.equal(await locator.isVisible(), true)
}
try {
  // Exercise the production hover card: the pinned fixture cannot catch portal dismissal.
  for (const [category, name] of [
    ['Channels', 'Telegram'],
    ['Automations', 'Daily project briefing']
  ]) {
    await open('?floating&strict')
    await button('Preview ClawXpert').hover()
    const profile = page.getByRole('dialog', { name: 'Assistant profile', includeHidden: true })
    await visible(profile)
    await tab(category)
    const manage = button(`Manage ${name}`)
    await manage.click()
    await visible(page.getByRole('menu'))
    await page.mouse.move(1000, 50)
    await page.waitForTimeout(400) // Longer than the hover card's 250 ms close delay.
    assert.equal(await profile.isVisible(), true, `${category} menu must keep the floating profile open`)
    await page.keyboard.press('Escape')
    await page.getByRole('menu').waitFor({ state: 'hidden' })
    assert.equal(await button('Pin profile').getAttribute('aria-pressed'), 'false')
    assert.equal(await button('Close profile').isEnabled(), true, 'Dismissed menus must release the hold')

    await manage.click()
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
    const editor = page.getByRole('dialog', { name: category === 'Channels' ? 'Manage channel' : 'Edit automation' })
    await visible(editor)
    await page.waitForTimeout(400)
    assert.equal(await profile.isVisible(), true, 'The menu must hand its hold to the editor')
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    await manage.click()
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: `Delete ${name}?`, exact: true })
    await visible(confirmation)
    await page.waitForTimeout(400)
    assert.equal(await profile.isVisible(), true, 'Delete confirmation must keep the profile open')
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()

    await manage.click()
    await page.getByRole('menuitem', { name: 'Pause', exact: true }).click()
    await visible(page.getByText('Paused', { exact: true }))
    await manage.click()
    await page.getByRole('menuitem', { name: 'Enable', exact: true }).click()
    await page.getByText('Paused', { exact: true }).waitFor({ state: 'hidden' })
    await button('Close profile').click()
    await profile.waitFor({ state: 'hidden' })
    await button('Preview ClawXpert').hover()
    await visible(profile)
    await page.mouse.click(1000, 50)
    await profile.waitFor({ state: 'hidden' })
  }
  await open('?locale=zh-Hans')
  const calls = await countHostCalls()
  assert.deepEqual(await page.getByRole('tab').allTextContents(), ['动态', '渠道', '自动化', '关于'])
  await tab('渠道')
  await visible(page.getByText('@ClawXpertBot', { exact: true }))
  await page.screenshot({ path: `${output}/channels.png` })
  await page.getByRole('textbox', { name: '搜索渠道' }).fill('Telegram')
  await tab('关于')
  await visible(page.getByText('助理能力', { exact: true }))
  await tab('自动化')
  await visible(page.getByText('Daily project briefing', { exact: true }))
  await page.screenshot({ path: `${output}/automations.png` })
  await page.getByRole('textbox', { name: '搜索自动化' }).fill('briefing')
  await tab('渠道')
  assert.equal(await page.getByRole('textbox', { name: '搜索渠道' }).inputValue(), 'Telegram')
  await page.getByRole('textbox', { name: '搜索渠道' }).fill('')
  const channelPanel = page.getByRole('tabpanel', { name: '渠道', exact: true })
  await visible(channelPanel.getByText('XpertAI Workspace', { exact: true }))
  const scrollTop = await channelPanel.evaluate((panel) => {
    panel.scrollTop = 100
    return panel.scrollTop
  })
  assert.ok(scrollTop > 0)
  const beforeSwitch = await calls.jsonValue()
  assert.equal(beforeSwitch.assistantTriggers, 1)
  await tab('动态')
  await tab('关于')
  await tab('自动化')
  assert.equal(await page.getByRole('textbox', { name: '搜索自动化' }).inputValue(), 'briefing')
  await tab('渠道')
  assert.equal(await channelPanel.evaluate((panel) => panel.scrollTop), scrollTop)
  assert.deepEqual(await calls.jsonValue(), beforeSwitch, 'Tab switches must reuse loaded data and account labels')
  await button('刷新').click()
  await page.locator('[role="tabpanel"]:not([hidden]) button[aria-label="刷新"]:enabled').waitFor()
  assert.equal((await calls.jsonValue()).assistantTriggers, 2, 'Explicit refresh must reload the shared snapshot')

  await open('?empty')
  await tab('Automations')
  await visible(page.getByText('No automations yet', { exact: true }))
  await tab('Channels')
  await button('Add channel').click()
  await page.getByRole('button', { name: /Telegram Connect an account/ }).click()
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: '@ClawXpertBot' }).click()
  await button('Continue').click()
  await visible(page.getByRole('switch', { name: 'Receive direct messages' }))
  await page.screenshot({ path: `${output}/channel-settings.png` })
  await button('Continue').click()
  await button('Test configuration').click()
  await visible(page.getByText('Configuration verified', { exact: true }))
  await button('Finish connection').click()
  await visible(page.getByText('Channel configuration saved', { exact: true }))
  await button('Done').click()
  await visible(button('Manage Telegram'))
  await button('Add channel').click()
  await page.getByRole('button', { name: /Linear Connect an account/ }).click()
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'XpertAI Workspace' }).click()
  await button('Continue').click()
  await page.getByRole('switch', { name: 'Respond to assigned issues', exact: true }).click()
  await button('Continue').click()
  await button('Test configuration').click()
  await button('Finish connection').click()
  await button('Done').click()
  await visible(button('Manage Linear'))

  await tab('Automations')
  await button('New automation').click()
  await button('Schedule').click()
  await page.getByLabel('Automation name').fill('Weekly status report')
  await page.getByLabel('Repeat').click()
  await page.getByRole('option', { name: 'Every week', exact: true }).click()
  await page.getByLabel('Time (server timezone)').fill('09:00')
  await button('Continue').click()
  await page.getByLabel('Additional Instructions', { exact: true }).fill('Focus on blocked issues.')
  await button('Continue').click()
  await dialog().getByRole('button', { name: 'Create automation', exact: true }).click()
  await button('Done').click()
  await visible(button('Manage Weekly status report'))
  await tab('Channels')
  await button('Manage Telegram').click()
  await page.getByRole('menuitem', { name: 'Pause', exact: true }).click()
  await visible(page.getByText('Paused', { exact: true }))
  await button('Manage Telegram').click()
  await page.getByRole('menuitem', { name: 'Enable', exact: true }).click()
  await page.getByText('Paused', { exact: true }).waitFor({ state: 'hidden' })
  await tab('Automations')
  await button('New automation').click()
  assert.equal(await button('Schedule Already configured').isDisabled(), true)
  await button('Cancel').click()
  await button('Manage Weekly status report').click()
  await page.getByRole('menuitem', { name: 'Pause', exact: true }).click()
  await visible(page.getByText('Paused', { exact: true }))
  await button('Manage Weekly status report').click()
  await page.getByRole('menuitem', { name: 'Enable', exact: true }).click()
  await visible(page.getByText('Active', { exact: true }))
  await button('Manage Weekly status report').click()
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
  assert.equal(await page.getByLabel('Automation name').inputValue(), 'Weekly status report')
  assert.equal(await page.getByLabel('Time (server timezone)').inputValue(), '09:00')
  await page.getByLabel('Automation name').fill('Monday status report')
  await button('Continue').click()
  assert.equal(
    await page.getByLabel('Additional Instructions', { exact: true }).inputValue(),
    'Focus on blocked issues.'
  )
  await button('Continue').click()
  await button('Save changes').click()
  await button('Done').click()
  await button('Manage Monday status report').click()
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  await dialog().getByRole('button', { name: 'Delete', exact: true }).click()
  await visible(page.getByText('No automations yet', { exact: true }))

  await open('?dark&locale=zh-Hans')
  await tab('渠道')
  await visible(page.getByText('@ClawXpertBot', { exact: true }))
  await page.screenshot({ path: `${output}/channels-dark.png` })
  await open('?readonly')
  await tab('Automations')
  await visible(button('New automation'))
  assert.equal(await button('New automation').isDisabled(), true)
  await open('?error')
  await tab('Channels')
  await visible(page.getByRole('alert'))
  await open('?conflict')
  await tab('Automations')
  await button('Manage Daily project briefing').click()
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Automation name').fill('Unsaved change')
  await button('Continue').click()
  await button('Continue').click()
  await button('Save changes').click()
  await visible(dialog().getByRole('alert'))
  assert.equal(await dialog().isVisible(), true)
  assert.deepEqual(errors, [])
  // The QR path shares the real wizard and bridge, with deterministic authorization states.
  const qr = async (query = '') => {
    await open('?empty&strict' + query)
    const calls = await countHostCalls()
    await tab('Channels')
    await button('Add channel').click()
    await page.getByRole('button', { name: /Feishu Connect an account/ }).click()
    await button('Connect with QR code').click()
    return calls
  }
  const firstQr = await qr()
  await visible(page.getByRole('img', { name: 'Channel authorization QR code' }))
  assert.equal((await firstQr.jsonValue()).beginAssistantTriggerQr, 1, 'StrictMode must start only one QR session')
  await page.screenshot({ path: `${output}/feishu-qr.png` })
  await visible(page.getByText('Channel configuration saved', { exact: true }))
  await button('Done').click()
  await visible(page.getByText('Feishu Test Bot', { exact: true }))

  await qr('&qr-expired')
  await visible(page.getByText('This QR code has expired.', { exact: true }))
  await button('Try again').click()
  await visible(page.getByRole('img', { name: 'Channel authorization QR code' }))
  await button('Back').click()

  await qr('&qr-denied')
  await visible(page.getByText('Authorization was declined.', { exact: true }))
  await button('Back').click()

  const retries = await qr('&qr-retry')
  await visible(page.getByRole('alert'))
  await button('Try again').click()
  await visible(page.getByText('Channel configuration saved', { exact: true }))
  assert.equal((await retries.jsonValue()).beginAssistantTriggerQr, 1)
  assert.equal((await retries.jsonValue()).completeAssistantTriggerQr, 2)

  const cancellation = await qr('&qr-delay&qr-waiting')
  await button('Back').click()
  await page.waitForTimeout(900)
  assert.equal(
    (await cancellation.jsonValue()).cancelAssistantTriggerQr,
    1,
    'Closing before begin resolves must cancel its late session'
  )
  assert.equal((await cancellation.jsonValue()).pollAssistantTriggerQr, undefined)
  assert.equal(errors.length, 0, errors.join('\n'))

  console.log(
    `Passed: floating profile menus and dialog handoff; QR authorization, expiry/retry, denial, activation retry and cancellation; cached tabs/search/scroll, shared revisions and manual refresh, About merge, channel setup/test/save, automation create/edit/pause/resume/delete, light/dark, read-only, load failure and stale-save recovery. Screenshots: ${output}`
  )
} finally {
  await browser.close()
}
