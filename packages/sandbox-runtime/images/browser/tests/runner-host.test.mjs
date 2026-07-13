import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('runtime/manifest.json', root), 'utf8'))
const runner = await readFile(new URL('runtime/runner-host.mjs', root))

assert.equal(manifest.imageFamily, 'browser')
assert.equal(manifest.profileName, 'browser/playwright-1.61/v1')
assert.equal(manifest.runnerHostSha256, createHash('sha256').update(runner).digest('hex'))
assert.ok(!JSON.stringify(manifest).toLowerCase().includes('presentation'))
process.stdout.write('sandbox browser runner host contract verified\n')
