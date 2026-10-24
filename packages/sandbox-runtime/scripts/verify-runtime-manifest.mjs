import assert from 'node:assert/strict'

/** Compare the image's live manifest (including its computed runner hash) to the API contract. */
export function verifyRuntimeManifest(actual, definition) {
  assert.ok(actual && typeof actual === 'object' && !Array.isArray(actual), 'Runtime manifest must be an object')
  assert.ok(
    definition.expectedManifest && Object.keys(definition.expectedManifest).length,
    'Runtime Definition must pin its manifest'
  )
  for (const [key, expected] of Object.entries(definition.expectedManifest)) {
    assert.equal(actual[key], expected, `Runtime manifest ${key} does not match ${definition.name}`)
  }
}
