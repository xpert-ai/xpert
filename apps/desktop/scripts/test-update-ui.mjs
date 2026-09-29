import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
const base = process.env.BOSI_UI_BASE || 'http://127.0.0.1:4391'
const output = process.env.BOSI_UI_OUTPUT || '/tmp/bosi-update-ui'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 900, height: 640 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const open = (query = '') => page.goto(`${base}/tests/fixtures/update-preview.html${query}`)
const button = (name) => page.getByRole('button', { name, exact: true })
try {
  await open()
  const update = button('Update')
  await update.waitFor({ state: 'visible' })
  assert.equal((await update.boundingBox()).width, 32)
  await update.hover()
  await page.waitForFunction(() => document.querySelector('button[aria-label="Update"]').offsetWidth === 64)
  await update.focus()
  await page.mouse.move(700, 300)
  assert.equal(Math.round((await update.boundingBox()).width), 64)
  await page.keyboard.press('Enter')
  await button('Downloading update: 42%').waitFor({ state: 'visible' })
  assert.equal(await page.getByRole('dialog').count(), 0)
  await button('Downloading update: 42%').click()
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '42')
  await button('Close').click()
  await button('Toggle sidebar').click()
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="Downloading update: 42%"]')?.offsetWidth === 32
  )
  assert.equal(Math.round((await button('Downloading update: 42%').boundingBox()).width), 32)
  await button('Complete download').click()
  await page.getByRole('dialog', { name: 'Update ready to install' }).waitFor()
  assert.equal(await page.locator('html').getAttribute('data-installs'), null)
  await button('Later').click()
  await button('Toggle sidebar').click()
  assert.equal(await page.getByRole('dialog').count(), 0)
  await button('Install and restart').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Install and restart', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.installs === '1')
  await page.getByRole('heading', { name: 'Installing update…' }).waitFor()

  await open('?fail')
  await button('Update').click()
  await button('Retry update').click()
  await page.getByRole('alert').waitFor()
  await button('Retry').click()
  await page.getByRole('progressbar').waitFor()
  await open('?race')
  await button('Downloading update: 73%').waitFor()
  await page.waitForTimeout(200)
  assert.equal(await button('Update').count(), 0)
  for (const query of ['?idle', '?browser']) {
    await open(query)
    await button('User menu: Tiven Wang').waitFor()
    assert.equal(await button('Update').count(), 0)
  }
  for (const theme of ['', '&dark']) {
    await open(`?locale=zh-Hans${theme}`)
    await button('更新').waitFor()
    await page.screenshot({ animations: 'disabled', path: `${output}/update-${theme ? 'dark' : 'light'}.png` })
    await button('更新').hover()
    await page.waitForFunction(() => document.querySelector('button[aria-label="更新"]').offsetWidth === 64)
    await page.screenshot({ animations: 'disabled', path: `${output}/hover-${theme ? 'dark' : 'light'}.png` })
    await button('更新').click()
    await button('正在下载更新：42%').waitFor()
    await page.screenshot({ animations: 'disabled', path: `${output}/downloading-${theme ? 'dark' : 'light'}.png` })
    await button('Complete download').click()
    await page.getByRole('dialog', { name: '更新已准备就绪' }).waitFor()
    await page.screenshot({ animations: 'disabled', path: `${output}/ready-${theme ? 'dark' : 'light'}.png` })
  }
  assert.deepEqual(errors, [])
  console.log(
    `Passed: hover/focus, progress, collapse, later/reopen, explicit install, retry, snapshot race, web/idle, Chinese light/dark. Screenshots: ${output}`
  )
} finally {
  await browser.close()
}
