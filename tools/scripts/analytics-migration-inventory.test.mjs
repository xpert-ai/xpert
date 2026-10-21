import assert from 'node:assert/strict'
import test from 'node:test'
import { collectAnalyticsInventory } from './analytics-migration-inventory.mjs'
const id = 'b1234567-1234-4234-8234-123456789012',
  versionId = 'c1234567-1234-4234-8234-123456789012'
const digest = 'a'.repeat(64)
const source = {
  dataSourceId: id,
  type: 'workspace-files',
  providerId: 'file.table',
  providerAvailable: true,
  updatedAt: '2026-10-21T00:00:00Z',
  storedOptionsDigest: digest,
  configCheck: 'provider-validation-required',
  datasets: [{ id: 'sales', revision: 'v1', storedDatasetDigest: digest }],
  issues: []
}
const binding = {
  location: 'bindings[0]',
  bindingId: 'sales',
  schemaVersion: 1,
  providerId: 'file.table',
  source: { kind: 'data-source', dataSourceId: id },
  payloadDigest: digest,
  dataset: { id: 'sales', revision: 'v1', contractHash: digest }
}
function fixture(overrides = {}) {
  const calls = []
  return {
    calls,
    get: async (path) => {
      calls.push(path)
      if (overrides[path]) return overrides[path]()
      if (path.startsWith('/analytics/'))
        return { items: [{ ...source, secret: 'must-not-persist' }], total: 1, page: 1, pageSize: 100 }
      if (path.startsWith('/artifacts?'))
        return {
          items: path.includes('live-dashboard') ? [{ id, currentVersionId: versionId, status: 'active' }] : [],
          total: path.includes('live-dashboard') ? 1 : 0,
          page: 1,
          pageSize: 100
        }
      if (path === `/artifacts/${id}/versions?status=all`) return [{ id: versionId, status: 'active', sha256: digest }]
      if (path === `/artifacts/analytics-inventory/${id}/versions/${versionId}`)
        return {
          artifactId: id,
          versionId,
          state: 'version',
          contentDigest: digest,
          bindings: [binding],
          issues: [],
          options: { password: 'must-not-persist' }
        }
      if (path.endsWith('/draft'))
        return {
          artifactId: id,
          draftId: id,
          revision: 3,
          baseVersionId: versionId,
          state: 'draft',
          contentDigest: digest,
          bindings: [binding],
          issues: []
        }
      throw new Error('Unexpected fixture request')
    }
  }
}
test('collects immutable versions and drafts; strips incidental values and does not claim effective hash validation', async () => {
  const api = fixture(),
    report = await collectAnalyticsInventory(api.get)
  assert.equal(report.documents.length, 2)
  assert.equal(report.references.length, 2)
  assert.equal(report.gaps.length, 0)
  assert.equal(report.coverage.scope, 'current-actor-organization')
  assert.deepEqual(report.references[0].issues, ['effective-provider-contract-verification-required'])
  assert.ok(!JSON.stringify(report).includes('must-not-persist'))
  assert.ok(api.calls.every((path) => path.startsWith('/analytics/') || path.startsWith('/artifacts')))
})
test('reads every source page and rechecks configuration digests', async () => {
  let firstReads = 0
  const api = fixture({
    '/analytics/migration-inventory/sources?page=1': () => ({ items: [source], total: 2, page: 1, pageSize: 1 }),
    '/analytics/migration-inventory/sources?page=2': () => ({
      items: [{ ...source, dataSourceId: versionId, storedOptionsDigest: ++firstReads > 1 ? 'b'.repeat(64) : digest }],
      total: 2,
      page: 2,
      pageSize: 1
    })
  })
  const report = await collectAnalyticsInventory(api.get)
  assert.equal(report.sources.length, 2)
  assert.ok(report.gaps.some((gap) => gap.code === 'sources-changed'))
  assert.equal(report.coverage.completeWithinVisibleListings, false)
})
test('permission failures and archived versions become explicit coverage gaps with no exception text', async () => {
  const api = fixture({
    [`/artifacts/analytics-inventory/${id}/versions/${versionId}`]: () => {
      throw new Error('403 token=secret')
    }
  })
  const report = await collectAnalyticsInventory(api.get)
  assert.equal(report.gaps.length, 1)
  assert.ok(!JSON.stringify(report).includes('token=secret'))
})
test('reports unresolved dataset revisions, missing sources and script pins without remapping them', async () => {
  const scriptId = 'd1234567-1234-4234-8234-123456789012'
  const api = fixture({
    [`/artifacts/analytics-inventory/${id}/versions/${versionId}`]: () => ({
      artifactId: id,
      versionId,
      state: 'version',
      contentDigest: digest,
      issues: [],
      bindings: [
        { ...binding, dataset: { ...binding.dataset, revision: 'old' } },
        {
          ...binding,
          source: { kind: 'data-source', dataSourceId: scriptId },
          script: { artifactId: scriptId, versionId }
        }
      ]
    })
  })
  const report = await collectAnalyticsInventory(api.get)
  assert.ok(report.references[0].issues.includes('dataset-revision-unresolved'))
  assert.ok(report.references[1].issues.includes('source-not-in-legacy-inventory'))
  assert.ok(report.references[1].issues.includes('script-version-unresolved'))
})
