import assert from 'node:assert/strict'
import test from 'node:test'

import { validateRuntimeReleaseChange } from './verify-release-change.mjs'

const changedFiles = ['packages/sandbox-runtime/images/document/Dockerfile']

test('requires a Sandbox Runtime Changeset when image inputs change without a version bump', () => {
  assert.throws(
    () =>
      validateRuntimeReleaseChange({
        changedFiles,
        baseVersion: '1.2.0',
        currentVersion: '1.2.0',
        changesetContents: []
      }),
    /must include a Changeset for @xpert-ai\/sandbox-runtime/
  )
})

test('accepts a changed Changeset for the Sandbox Runtime package', () => {
  assert.doesNotThrow(() =>
    validateRuntimeReleaseChange({
      changedFiles,
      baseVersion: '1.2.0',
      currentVersion: '1.2.0',
      changesetContents: ['---\n"@xpert-ai/sandbox-runtime": patch\n---\n\nRelease a new image family.\n']
    })
  )
})

test('accepts the generated version commit without a remaining Changeset', () => {
  assert.doesNotThrow(() =>
    validateRuntimeReleaseChange({
      changedFiles,
      baseVersion: '1.2.0',
      currentVersion: '1.2.1',
      changesetContents: []
    })
  )
})

test('does not require release metadata when no image family changed', () => {
  assert.doesNotThrow(() =>
    validateRuntimeReleaseChange({
      changedFiles: [],
      baseVersion: '1.2.0',
      currentVersion: '1.2.0',
      changesetContents: []
    })
  )
})

test('does not require a release for test-only changes', () => {
  assert.doesNotThrow(() =>
    validateRuntimeReleaseChange({
      changedFiles: ['packages/sandbox-runtime/images/document/tests/runtime-contract.test.mjs'],
      baseVersion: '1.2.0',
      currentVersion: '1.2.0',
      changesetContents: []
    })
  )
})
