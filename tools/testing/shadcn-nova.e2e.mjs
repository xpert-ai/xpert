import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'

const root = resolve(import.meta.dirname, '../..')
const shared = resolve(root, 'packages/shadcn-ui')
const output = process.env.SHADCN_E2E_OUTPUT ?? resolve(tmpdir(), 'shadcn-nova')

test('official Nova primitives render and interact with host theme variables', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'shadcn-nova-build-'))
  const errors = []
  let browser, server
  try {
    await mkdir(output, { recursive: true })
    await build({
      entryPoints: [resolve(shared, 'test/nova-preview.tsx')],
      outfile: resolve(directory, 'app.js'),
      bundle: true,
      jsx: 'automatic',
      // Match the remote renderer: icons and primitives share one React runtime.
      alias: {
        '@': resolve(shared, 'src'),
        react: resolve(root, 'node_modules/react'),
        'react-dom': resolve(root, 'node_modules/react-dom')
      },
      logLevel: 'silent'
    })
    await writeFile(
      resolve(directory, 'input.css'),
      `@import "${shared}/src/styles.css";\n@source "${shared}/test/nova-preview.tsx";\n`
    )
    execFileSync(
      process.execPath,
      [
        resolve(root, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
        '-i',
        resolve(directory, 'input.css'),
        '-o',
        resolve(directory, 'app.css')
      ],
      { cwd: root, stdio: 'pipe' }
    )
    const assets = {
      '/': [
        'text/html',
        '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nova components</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'
      ],
      '/app.js': ['text/javascript', await readFile(resolve(directory, 'app.js'))],
      '/app.css': ['text/css', await readFile(resolve(directory, 'app.css'))]
    }
    server = createServer((request, response) => {
      const asset = assets[new URL(request.url, 'http://localhost').pathname]
      response.writeHead(asset ? 200 : 404, { 'Content-Type': asset?.[0] ?? 'text/plain' })
      response.end(asset?.[1] ?? 'Not found')
    })
    await new Promise((done) => server.listen(0, '127.0.0.1', done))
    browser = await chromium.launch({ headless: true })
    for (const scenario of [
      { name: 'light', theme: 'light', width: 1000, height: 760 },
      { name: 'dark', theme: 'dark', width: 1000, height: 760 },
      { name: 'compact', theme: 'light', width: 1000, height: 760, density: 'compact' },
      { name: 'narrow', theme: 'light', width: 390, height: 640, radius: '16px' }
    ]) {
      const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height } })
      page.setDefaultTimeout(10000)
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      try {
        const query = new URLSearchParams({
          theme: scenario.theme,
          density: scenario.density ?? 'default',
          radius: scenario.radius ?? '10px'
        })
        await page.goto(`http://127.0.0.1:${server.address().port}/?${query}`)
        const background = (locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor)
        const checkbox = page.getByRole('checkbox', { name: 'Accept terms' })
        const unchecked = await background(checkbox)
        await checkbox.check()
        await expect(checkbox).toBeChecked()
        await expect.poll(() => background(checkbox)).not.toBe(unchecked)
        const toggle = page.getByRole('switch', { name: 'Notifications' })
        const off = await background(toggle)
        await toggle.click()
        await expect(toggle).toBeChecked()
        await expect.poll(() => background(toggle)).not.toBe(off)
        await page.getByRole('radio', { name: 'Weekly' }).check()
        await expect(page.getByRole('radio', { name: 'Weekly' })).toBeChecked()
        await page.getByRole('button', { name: 'Pin', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Pin', exact: true })).toHaveAttribute('aria-pressed', 'true')
        await page.getByRole('combobox', { name: 'Workspace' }).click()
        await page.getByRole('option', { name: 'Team', exact: true }).click()
        await expect(page.getByRole('combobox', { name: 'Workspace' })).toHaveText('Team')
        await page.getByRole('tab', { name: 'History', exact: true }).click()
        await expect(page.getByText('History content', { exact: true })).toBeVisible()
        await page.getByRole('tab', { name: 'First', exact: true }).focus()
        await page.keyboard.press('ArrowDown')
        await expect(page.getByRole('tab', { name: 'Second', exact: true })).toBeFocused()
        await page.getByRole('button', { name: 'Details', exact: true }).click()
        await expect(page.getByText('Expanded content remains visible.')).toBeVisible()
        await page.getByRole('button', { name: 'Popover', exact: true }).click()
        const popover = page.getByText('Anchored shared popover')
        await expect(popover).toBeInViewport({ ratio: 1 })
        await page.keyboard.press('Escape')
        await expect(page.getByRole('button', { name: 'Popover', exact: true })).toBeFocused()
        await page.getByRole('button', { name: 'Confirmation', exact: true }).click()
        await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
        await expect(page.getByRole('button', { name: 'Confirmation', exact: true })).toBeFocused()
        await page.screenshot({ path: resolve(output, `${scenario.name}-controls.png`) })
        await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Edit profile', exact: true })
        await expect(dialog).toBeVisible()
        await dialog.evaluate(async (element) => {
          await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished))
        })
        const metrics = await dialog.evaluate((element) => {
          const style = getComputedStyle(element),
            bounds = element.getBoundingClientRect()
          const footer = element.querySelector('[data-slot="dialog-footer"]')
          const footerStyle = getComputedStyle(footer),
            footerBounds = footer.getBoundingClientRect()
          const close = element.querySelector('[data-slot="dialog-close"][data-size="icon-sm"]')
          return {
            background: style.backgroundColor,
            radius: parseFloat(style.borderRadius),
            x: bounds.x,
            y: bounds.y,
            right: bounds.right,
            bottom: bounds.bottom,
            width: innerWidth,
            height: innerHeight,
            footerBorder: footerStyle.borderTopWidth,
            footerBackground: footerStyle.backgroundColor,
            footerWidth: footerBounds.width,
            dialogWidth: bounds.width,
            closeSize: close?.getBoundingClientRect().width,
            rootSize: parseFloat(getComputedStyle(document.documentElement).fontSize)
          }
        })
        assert.equal(metrics.background, scenario.theme === 'dark' ? 'rgb(23, 23, 23)' : 'rgb(255, 255, 255)')
        assert.ok(Math.abs(metrics.radius - Number.parseFloat(scenario.radius ?? '10px') * 1.4) < 0.1)
        assert.equal(metrics.footerBorder, '1px')
        assert.notEqual(metrics.footerBackground, metrics.background)
        assert.ok(Math.abs(metrics.footerWidth - metrics.dialogWidth) < 1)
        assert.equal(metrics.closeSize, metrics.rootSize * 1.75)
        assert.ok(
          metrics.x >= 0 && metrics.y >= 0 && metrics.right <= metrics.width && metrics.bottom <= metrics.height
        )
        await page.screenshot({ path: resolve(output, `${scenario.name}-dialog.png`) })
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        await expect(dialog).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeFocused()
      } catch (error) {
        await page.screenshot({ path: resolve(output, `${scenario.name}-failure.png`) })
        throw new AggregateError([error, ...errors], `Nova scenario failed: ${scenario.name}`)
      } finally {
        await page.close()
      }
    }
    assert.deepEqual(errors, [])
  } finally {
    await browser?.close()
    if (server) await new Promise((done) => server.close(done))
    await rm(directory, { recursive: true, force: true })
  }
})
