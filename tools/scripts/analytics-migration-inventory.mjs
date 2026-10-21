// Read-only inventory: the only non-GET request may be authentication through local-plugin-cli.
// Reports contain identifiers and digests, never options, credentials, payloads or published bytes.
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { z } from 'zod/v3'
import { parseCliArgs, requireAuthentication, createRequestHeaders, DEFAULT_API_URL } from './local-plugin-cli.mjs'

const uuid = z.string().uuid(),
  digest = z.string().regex(/^[a-f0-9]{64}$/)
const sourceRef = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('data-source'), dataSourceId: uuid }),
  z.object({ kind: z.literal('definition'), definitionId: uuid, versionId: uuid }),
  z.object({ kind: z.literal('artifact'), artifactId: uuid, versionId: uuid })
])
const sourceSchema = z.object({
  dataSourceId: uuid,
  type: z.enum(['workspace-files', 'rest-json', 'mcp-tools', 'data-xpert', 'workspace-script']),
  providerId: z.string(),
  providerAvailable: z.boolean(),
  updatedAt: z.string().nullable(),
  storedOptionsDigest: digest,
  configCheck: z.enum(['provider-validation-required', 'invalid-structure']),
  datasets: z.array(z.object({ id: z.string(), revision: z.string(), storedDatasetDigest: digest })),
  issues: z.array(z.string())
})
const bindingSchema = z.object({
  location: z.string(),
  bindingId: z.string(),
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  providerId: z.string(),
  source: sourceRef,
  payloadDigest: digest,
  dataset: z.object({ id: z.string(), revision: z.string(), contractHash: digest }).optional(),
  script: z.object({ artifactId: uuid, versionId: uuid }).optional()
})
const documentSchema = z
  .object({
    artifactId: uuid,
    versionId: uuid.optional(),
    draftId: uuid.optional(),
    revision: z.number().int().optional(),
    baseVersionId: uuid.nullable().optional(),
    state: z.enum(['version', 'draft', 'absent', 'not-editable']),
    contentDigest: digest.optional(),
    bindings: z.array(bindingSchema).optional(),
    issues: z.array(z.object({ location: z.string(), code: z.string() })).optional()
  })
  .superRefine((value, ctx) => {
    if (
      (value.state === 'version' || value.state === 'draft') &&
      (!value.contentDigest || !value.bindings || !value.issues)
    )
      ctx.addIssue({ code: 'custom', message: 'Missing inventory contents' })
  })
const artifactSchema = z.object({ id: uuid, currentVersionId: uuid.nullable().optional(), status: z.string() })
const versionSchema = z.object({ id: uuid, sha256: digest.nullable().optional(), status: z.string() })
const owners = [
  { pluginName: '@xpert-ai/plugin-live-dashboard', resourceType: 'live-dashboard' },
  { pluginName: '@xpert-ai/plugin-analytics-workspace-script', resourceType: 'definition' }
]
const pageSchema = (item) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive()
  })

/** get returns untrusted JSON; validation strips incidental fields before persisting the report. */
export async function collectAnalyticsInventory(get) {
  const gaps = [],
    sources = [],
    artifacts = [],
    documents = []
  async function read(path, schema, location) {
    try {
      return schema.parse(await get(path))
    } catch {
      gaps.push({ location, code: 'unavailable-or-invalid-response' })
      return null
    }
  }
  async function pages(path, schema, key, label) {
    const output = [],
      seen = new Set()
    let expectedTotal
    for (let page = 1; page <= 1000000; page++) {
      const current = await read(
        `${path}${path.includes('?') ? '&' : '?'}page=${page}`,
        pageSchema(schema),
        `${label}/page/${page}`
      )
      if (!current) break
      if (current.page !== page || (expectedTotal !== undefined && current.total !== expectedTotal)) {
        gaps.push({ location: label, code: 'listing-changed' })
        break
      }
      expectedTotal = current.total
      for (const item of current.items) {
        if (seen.has(item[key])) {
          gaps.push({ location: label, code: 'duplicate-page-item' })
          continue
        }
        seen.add(item[key])
        output.push(item)
      }
      if (page * current.pageSize >= current.total) {
        if (output.length !== current.total) gaps.push({ location: label, code: 'incomplete-listing' })
        break
      }
      if (!current.items.length) {
        gaps.push({ location: label, code: 'incomplete-listing' })
        break
      }
      if (page === 1000000) gaps.push({ location: label, code: 'page-limit' })
    }
    return output
  }
  sources.push(...(await pages('/analytics/migration-inventory/sources', sourceSchema, 'dataSourceId', 'sources')))
  for (const owner of owners) {
    const query = new URLSearchParams({ ...owner, status: 'all', pageSize: '100' })
    artifacts.push(...(await pages(`/artifacts?${query}`, artifactSchema, 'id', owner.resourceType)))
  }
  for (const artifact of artifacts) {
    const path = `/artifacts/${artifact.id}/versions?status=all`
    const versions = await read(path, z.array(versionSchema), `${artifact.id}/versions`)
    for (const version of versions ?? []) {
      const item = await read(
        `/artifacts/analytics-inventory/${artifact.id}/versions/${version.id}`,
        documentSchema,
        `${artifact.id}/${version.id}`
      )
      if (!item) continue
      if (
        item.artifactId !== artifact.id ||
        item.versionId !== version.id ||
        item.state !== 'version' ||
        (version.sha256 && version.sha256 !== item.contentDigest)
      ) {
        gaps.push({ location: `${artifact.id}/${version.id}`, code: 'version-identity-or-digest-mismatch' })
        continue
      }
      documents.push({ ...item, publishedCurrent: artifact.currentVersionId === version.id })
    }
    const draft = await read(
      `/artifacts/analytics-inventory/${artifact.id}/draft`,
      documentSchema,
      `${artifact.id}/draft`
    )
    if (draft && draft.artifactId === artifact.id && draft.state !== 'version') documents.push(draft)
    else if (draft) gaps.push({ location: `${artifact.id}/draft`, code: 'draft-identity-mismatch' })
    const after = await read(path, z.array(versionSchema), `${artifact.id}/versions/recheck`)
    if (versions && after && JSON.stringify(versions) !== JSON.stringify(after))
      gaps.push({ location: artifact.id, code: 'versions-changed' })
  }
  const afterArtifacts = []
  for (const owner of owners) {
    const query = new URLSearchParams({ ...owner, status: 'all', pageSize: '100' })
    afterArtifacts.push(...(await pages(`/artifacts?${query}`, artifactSchema, 'id', `${owner.resourceType}/recheck`)))
  }
  if (JSON.stringify(afterArtifacts) !== JSON.stringify(artifacts))
    gaps.push({ location: 'artifacts', code: 'artifacts-changed' })
  const afterSources = await pages(
    '/analytics/migration-inventory/sources',
    sourceSchema,
    'dataSourceId',
    'sources/recheck'
  )
  if (JSON.stringify(afterSources) !== JSON.stringify(sources))
    gaps.push({ location: 'sources', code: 'sources-changed' })
  const bySource = new Map(sources.map((source) => [source.dataSourceId, source]))
  const scannedVersions = new Set(
    documents.filter((doc) => doc.state === 'version').map((doc) => `${doc.artifactId}/${doc.versionId}`)
  )
  const references = documents.flatMap((doc) =>
    (doc.bindings ?? []).map((binding) => {
      const issues = []
      const source = binding.source.kind === 'data-source' ? bySource.get(binding.source.dataSourceId) : undefined
      if (binding.source.kind === 'data-source') {
        if (!source) issues.push('source-not-in-legacy-inventory')
        else {
          if (!source.providerAvailable) issues.push('provider-unavailable')
          if (source.providerId !== binding.providerId) issues.push('provider-ownership-mismatch')
          if (
            binding.dataset &&
            !source.datasets.some(
              (dataset) => dataset.id === binding.dataset.id && dataset.revision === binding.dataset.revision
            )
          )
            issues.push('dataset-revision-unresolved')
          if (source.configCheck === 'invalid-structure') issues.push('source-config-invalid')
          issues.push('effective-provider-contract-verification-required')
        }
      }
      if (binding.script && !scannedVersions.has(`${binding.script.artifactId}/${binding.script.versionId}`))
        issues.push('script-version-unresolved')
      return {
        artifactId: doc.artifactId,
        versionId: doc.versionId,
        draftId: doc.draftId,
        revision: doc.revision,
        ...binding,
        issues
      }
    })
  )
  return {
    schema: 'xpert.analytics.migration-inventory/v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    coverage: {
      scope: 'current-actor-organization',
      completeWithinVisibleListings: gaps.length === 0,
      limitations: [
        'Other users private artifacts and other organizations are not enumerated.',
        'Deleted containers are excluded by the management API; unavailable archived/deleted versions are reported as gaps.',
        'Live reads are not a database snapshot; rerun and compare digests before migration.',
        'Effective provider config parsing, resource ACL validation and upstream contract validation remain mandatory before migration.'
      ]
    },
    sources,
    artifacts,
    documents,
    references,
    gaps
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv, { booleanFlags: ['help', 'noKeychain'] })
  if (args.help) {
    console.log(
      'Usage: node tools/scripts/analytics-migration-inventory.mjs --org-id <authorized organization> --output <new report.json> [--api-url http://localhost:3000]'
    )
    return
  }
  if (!args.output) throw new Error('A new protected --output report path is required.')
  const orgId = args.orgId || process.env.XPERT_ORG_ID
  if (!orgId) throw new Error('Select an authorized organization with --org-id or XPERT_ORG_ID before scanning.')
  const authentication = await requireAuthentication(args)
  const headers = createRequestHeaders(
    { ...args, scope: 'organization', orgId },
    authentication.token,
    authentication.tenantId
  )
  const base =
    (args.apiUrl || process.env.XPERT_API_URL || DEFAULT_API_URL).replace(/\/+$/, '').replace(/\/api$/, '') + '/api'
  const report = await collectAnalyticsInventory(async (path) => {
    const response = await fetch(`${base}${path}`, {
      method: 'GET',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(30000)
    })
    if (!response.ok) throw new Error(`Inventory request failed (${response.status}).`)
    return response.json()
  })
  await writeFile(
    args.output,
    JSON.stringify({ ...report, scope: { tenantId: headers['tenant-id'] ?? null, organizationId: orgId } }, null, 2) +
      '\n',
    { mode: 0o600, flag: 'wx' }
  )
  console.log(
    `Inventory saved: ${report.sources.length} sources, ${report.documents.length} documents, ${report.references.length} bindings, ${report.gaps.length} coverage gaps.`
  )
  if (!report.coverage.completeWithinVisibleListings) process.exitCode = 2
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(
      'Inventory failed. Check authentication, organization scope, API availability and the new output path. No source or binding was modified.'
    )
    process.exitCode = 1
  })
}
