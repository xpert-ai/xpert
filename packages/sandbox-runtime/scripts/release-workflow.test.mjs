import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const workflow = await readFile('.github/workflows/sandbox-runtime-publish.yml', 'utf8')

test('preflights every immutable source before platform aliases can start', () => {
  assert.match(workflow, /\n  preflight-platform-release:\n/)

  const aliasJob = workflow.slice(workflow.indexOf('\n  alias-platform-release:\n'))
  assert.match(aliasJob, /needs:\n\s+- prepare\n\s+- preflight-platform-release\n/)
  assert.match(aliasJob, /needs\.preflight-platform-release\.result == 'success'/)
})

test('provides a controlled immutable version-tag recovery job', () => {
  assert.match(workflow, /\n      promote_version_tag:\n/)
  assert.match(workflow, /\n  promote-version-tag:\n/)
  assert.match(workflow, /--format '\{\{json \.Manifest\.Digest\}\}'/)
  assert.match(workflow, /Refusing to overwrite .* with different content/)
})
