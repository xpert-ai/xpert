import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const familyRoot = new URL('../', import.meta.url)
const suiteRoot = new URL('../../../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('runtime/manifest.json', familyRoot), 'utf8'))
const runner = await readFile(new URL('images/browser/runtime/runner-host.mjs', suiteRoot))

assert.equal(manifest.imageFamily, 'browser-video')
assert.equal(manifest.profileName, 'browser/video-playwright-1.61/v1')
assert.equal(manifest.nodeVersion, '22.17.1')
assert.equal(manifest.ffmpegVersion, '6.1')
assert.equal(manifest.runnerHostSha256, createHash('sha256').update(runner).digest('hex'))
assert.ok(!/presentation|motion|hyperframes/i.test(JSON.stringify(manifest)))
process.stdout.write('sandbox browser video runtime contract verified\n')
