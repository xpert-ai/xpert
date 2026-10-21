// Invariants: inventory is read-only, contains no configuration values or native payloads,
// and never equates a stored JSON fingerprint with a provider's effective contract hash.
import { createHash } from 'node:crypto'
import { z } from 'zod/v3'
import type { AnalyticsSourceRef } from '@xpert-ai/contracts'
import { analyticsOptionsSchema } from './analytics.schema'
import { supportedAnalyticsBindingSchema } from './analytics-v2.schema'

export const legacyAnalyticsProviders = {
  'workspace-files': 'file.table',
  'rest-json': 'rest.json',
  'mcp-tools': 'mcp.tool',
  'data-xpert': 'data-xpert.ontology',
  'workspace-script': 'workspace_script.query'
} as const
export const analyticsInventoryOwners = {
  dashboard: { pluginName: '@xpert-ai/plugin-live-dashboard', resourceType: 'live-dashboard' },
  script: { pluginName: '@xpert-ai/plugin-analytics-workspace-script', resourceType: 'definition' }
} as const
export type AnalyticsInventoryFamily = keyof typeof analyticsInventoryOwners
export const analyticsInventoryPageSchema = z
  .object({ page: z.coerce.number().int().min(1).max(1000000).default(1) })
  .strict()
const identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/)
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/)
export function analyticsInventoryDigest(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}
const datasetIdentity = z.object({ id: identifier, revision: identifier }).strip()
export interface LegacyAnalyticsSourceInventory {
  dataSourceId: string
  type: keyof typeof legacyAnalyticsProviders
  providerId: string
  providerAvailable: boolean
  updatedAt: string | null
  /** Transport JSON fingerprint only; parser defaults/order may differ from the effective plugin contract. */
  storedOptionsDigest: string
  configCheck: 'provider-validation-required' | 'invalid-structure'
  datasets: Array<{ id: string; revision: string; storedDatasetDigest: string }>
  issues: string[]
}
export function inspectLegacyAnalyticsSource(
  source: { id: string; type: string; updatedAt?: Date; options: unknown },
  availableProviderIds: readonly string[]
): LegacyAnalyticsSourceInventory | null {
  const kind = z
    .enum(['workspace-files', 'rest-json', 'mcp-tools', 'data-xpert', 'workspace-script'])
    .safeParse(source.type)
  if (!kind.success) return null
  const parsed = analyticsOptionsSchema.safeParse(source.options ?? {})
  const providerId = legacyAnalyticsProviders[kind.data]
  const report: LegacyAnalyticsSourceInventory = {
    dataSourceId: source.id,
    type: kind.data,
    providerId,
    providerAvailable: availableProviderIds.includes(providerId),
    updatedAt: source.updatedAt?.toISOString() ?? null,
    storedOptionsDigest: analyticsInventoryDigest(JSON.stringify(source.options ?? {})),
    configCheck: 'provider-validation-required',
    datasets: [],
    issues: []
  }
  if (!parsed.success) {
    report.configCheck = 'invalid-structure'
    report.issues.push('invalid-options-json')
    return report
  }
  if (kind.data === 'workspace-files' || kind.data === 'rest-json' || kind.data === 'mcp-tools') {
    const datasets = z.object({ datasets: z.array(z.unknown()).min(1).max(100) }).safeParse(parsed.data)
    if (!datasets.success) {
      report.configCheck = 'invalid-structure'
      report.issues.push('invalid-datasets')
      return report
    }
    for (const dataset of datasets.data.datasets) {
      const identity = datasetIdentity.safeParse(dataset)
      if (!identity.success) {
        report.configCheck = 'invalid-structure'
        report.issues.push('invalid-dataset-identity')
        continue
      }
      report.datasets.push({
        id: identity.data.id,
        revision: identity.data.revision,
        storedDatasetDigest: analyticsInventoryDigest(JSON.stringify(dataset))
      })
    }
    if (new Set(report.datasets.map((item) => item.id)).size !== report.datasets.length) {
      report.configCheck = 'invalid-structure'
      report.issues.push('duplicate-dataset-id')
    }
  }
  return report
}
export interface AnalyticsBindingInventory {
  location: string
  bindingId: string
  schemaVersion: 1 | 2
  providerId: string
  source: AnalyticsSourceRef
  payloadDigest: string
  dataset?: { id: string; revision: string; contractHash: string }
  script?: { artifactId: string; versionId: string }
}
export interface AnalyticsDocumentInventory {
  contentDigest: string
  bindings: AnalyticsBindingInventory[]
  issues: Array<{ location: string; code: string }>
}
const dashboard = z.object({ schema: z.literal('xpert.live-dashboard/v1'), bindings: z.array(z.unknown()).max(1000) })
const document = z.discriminatedUnion('schema', [
  dashboard,
  z.object({ schema: z.literal('xpert.live-dashboard.package/v1'), manifest: dashboard }),
  z.object({
    schema: z.literal('xpert.analytics-script/v1'),
    sources: z.array(z.object({ binding: z.unknown() })).max(1000)
  })
])
/** Scans only explicit, known Binding locations; does not guess bindings in arbitrary JSON or validate presentation HTML. */
export function inspectAnalyticsDocument(
  bytes: Uint8Array,
  family: AnalyticsInventoryFamily
): AnalyticsDocumentInventory {
  const report: AnalyticsDocumentInventory = {
    contentDigest: analyticsInventoryDigest(bytes),
    bindings: [],
    issues: []
  }
  const issue = (location: string, code: string) => report.issues.push({ location, code })
  if (bytes.byteLength > 9000000) {
    issue('', 'document-too-large')
    return report
  }
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    issue('', 'invalid-json')
    return report
  }
  const parsed = document.safeParse(raw)
  if (!parsed.success) {
    issue('', 'unsupported-or-invalid-document')
    return report
  }
  const value = parsed.data
  if ((family === 'script') !== (value.schema === 'xpert.analytics-script/v1')) {
    issue('', 'document-owner-mismatch')
    return report
  }
  const entries =
    value.schema === 'xpert.analytics-script/v1'
      ? value.sources.map((source, index) => ({ binding: source.binding, location: `sources[${index}].binding` }))
      : (value.schema === 'xpert.live-dashboard/v1' ? value.bindings : value.manifest.bindings).map(
          (binding, index) => ({
            binding,
            location: `${value.schema === 'xpert.live-dashboard/v1' ? '' : 'manifest.'}bindings[${index}]`
          })
        )
  for (const entry of entries) {
    const parsedBinding = supportedAnalyticsBindingSchema.safeParse(entry.binding)
    if (!parsedBinding.success) {
      issue(entry.location, 'invalid-binding')
      continue
    }
    const binding = parsedBinding.data
    const item: AnalyticsBindingInventory = {
      location: entry.location,
      bindingId: binding.id,
      schemaVersion: binding.schemaVersion,
      providerId: binding.providerId,
      source:
        binding.schemaVersion === 1 ? { kind: 'data-source', dataSourceId: binding.dataSourceId } : binding.source,
      payloadDigest: analyticsInventoryDigest(JSON.stringify(binding.payload))
    }
    if (['file.table', 'rest.json', 'mcp.tool'].includes(binding.providerId)) {
      const identity = z
        .object({
          datasetId: identifier,
          revision: identifier,
          contractHash: fingerprint.optional(),
          operationContractHash: fingerprint.optional(),
          toolContractHash: fingerprint.optional()
        })
        .safeParse(binding.payload)
      if (!identity.success) issue(entry.location, 'invalid-dataset-reference')
      else {
        const hash =
          binding.providerId === 'file.table'
            ? identity.data.contractHash
            : binding.providerId === 'rest.json'
              ? identity.data.operationContractHash
              : identity.data.toolContractHash
        if (!hash) issue(entry.location, 'invalid-dataset-reference')
        else item.dataset = { id: identity.data.datasetId, revision: identity.data.revision, contractHash: hash }
      }
    }
    if (binding.providerId === 'workspace_script.query') {
      const reference = z
        .object({ artifactId: z.string().uuid(), versionId: z.string().uuid() })
        .strict()
        .safeParse(binding.payload)
      if (!reference.success) issue(entry.location, 'invalid-script-reference')
      else item.script = { artifactId: reference.data.artifactId, versionId: reference.data.versionId }
    }
    report.bindings.push(item)
  }
  return report
}
