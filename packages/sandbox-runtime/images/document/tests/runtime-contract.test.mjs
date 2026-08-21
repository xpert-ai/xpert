import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const familyRoot = new URL('../', import.meta.url)
const suiteRoot = new URL('../../../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('runtime/manifest.json', familyRoot), 'utf8'))
const runner = await readFile(new URL('images/browser/runtime/runner-host.mjs', suiteRoot))

assert.equal(manifest.imageFamily, 'document')
assert.equal(manifest.profileName, 'document/libreoffice-v1')
assert.equal(manifest.nodeVersion, '20.20.2')
assert.equal(manifest.libreOfficeMajorVersion, '7')
assert.equal(manifest.runnerHostSha256, createHash('sha256').update(runner).digest('hex'))
assert.ok(!/bid|tender|proposal/i.test(JSON.stringify(manifest)))
process.stdout.write('sandbox document runtime contract verified\n')
