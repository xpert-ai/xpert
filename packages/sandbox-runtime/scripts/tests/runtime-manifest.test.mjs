import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { verifyRuntimeManifest } from '../verify-runtime-manifest.mjs'

const definition = JSON.parse(
  await readFile(
    new URL(
      '../../../server-ai/src/sandbox/sandbox-job/runtime-definitions/compute-node-python-v1.json',
      import.meta.url
    ),
    'utf8'
  )
)

test('Compute release verification checks the complete API manifest contract', () => {
  verifyRuntimeManifest({ ...definition.expectedManifest, nodeVersion: 'v20.19.0' }, definition)
  for (const key of Object.keys(definition.expectedManifest)) {
    assert.throws(
      () => verifyRuntimeManifest({ ...definition.expectedManifest, [key]: 'wrong' }, definition),
      new RegExp(key)
    )
    const missing = { ...definition.expectedManifest }
    delete missing[key]
    assert.throws(() => verifyRuntimeManifest(missing, definition), new RegExp(key))
  }
})
