import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium } from 'playwright'
import { startRemoteViewPreview } from '../../../../../../../../tools/remote-view-preview/preview-host.mjs'
import config from './preview.config.mjs'

test('runs and persists the complete Agent Evolution workflow in the real generated Remote View', async (context) => {
    const preview = await startRemoteViewPreview(config, { port: 0, logStartup: false })
    const browser = await chromium.launch({ headless: true })
    context.after(async () => {
        await browser.close()
        await preview.close()
    })

    const page = await browser.newPage({ viewport: { width: 1488, height: 1058 }, locale: 'zh-CN' })
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text())
    })

    await page.goto(preview.url)
    const frame = page.frameLocator('#remote-view')
    await frame.getByTestId('evolution-center').waitFor()
    await frame.getByText('尚无进化执行').waitFor()
    await frame.getByTestId('empty-run-simulation').click()
    await frame.getByRole('alertdialog').waitFor()
    await frame.getByRole('alertdialog').getByRole('button', { name: '运行完整模拟' }).click()

    await frame.getByRole('tab', { name: '发布与运行' }).waitFor()
    await frame.getByText('CFM-preview-v2', { exact: true }).waitFor()
    await frame.getByText('active_pointer.cas_activated', { exact: true }).waitFor()

    const stateResponse = await page.request.get(new URL('/__xpert/remote-view-preview/state', preview.url).href)
    const state = await stateResponse.json()
    assert.equal(state.simulationRuns, 1)
    assert.ok(state.requestCount >= 3)
    assert.equal(state.dashboard.releases[0].status, 'active')
    assert.equal(state.dashboard.pointers[0].activeVersionId, 'CFM-preview-v2')
    assert.match(state.lastNotification.message, /Active Pointer/)

    const screenshotPath = process.env.WORKBENCH_E2E_SCREENSHOT
    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true })

    await page.reload()
    await frame.getByTestId('evolution-center').waitFor()
    await frame.getByRole('tab', { name: '发布与运行' }).click()
    await frame.getByText('CFM-preview-v2', { exact: true }).waitFor()
    assert.deepEqual(pageErrors, [])
})
