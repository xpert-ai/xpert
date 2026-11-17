import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { desktopContractsManifest } from '../contracts-manifest.mjs'

test('isolated contracts resolve emitted entries for browser bundles, Node and types', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'desktop-contracts-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const packageDirectory = join(directory, 'node_modules/@xpert-ai/contracts')
  mkdirSync(packageDirectory, { recursive: true })
  const source = JSON.parse(readFileSync(new URL('../../../packages/contracts/package.json', import.meta.url), 'utf8'))
  const manifest = desktopContractsManifest(source)
  writeFileSync(join(packageDirectory, 'package.json'), JSON.stringify(manifest))
  writeFileSync(join(packageDirectory, 'index.esm.js'), 'export const browserContract = 42')
  writeFileSync(join(packageDirectory, 'index.cjs.js'), 'exports.nodeContract = 24')
  writeFileSync(join(packageDirectory, 'index.d.ts'), 'export declare const browserContract: number')

  const bundled = await build({
    stdin: { contents: 'export { browserContract } from "@xpert-ai/contracts"', resolveDir: directory },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false
  })
  const browser = await import(`data:text/javascript,${encodeURIComponent(bundled.outputFiles[0].text)}`)
  assert.equal(browser.browserContract, 42)
  const require = createRequire(join(directory, 'consumer.cjs'))
  assert.equal(require('@xpert-ai/contracts').nodeContract, 24)
  assert.match(readFileSync(join(packageDirectory, manifest.exports['.'].types), 'utf8'), /browserContract/)
})
