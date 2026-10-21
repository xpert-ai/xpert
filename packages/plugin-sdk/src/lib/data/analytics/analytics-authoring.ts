import type { AnalyticsVersionedSourceRef, JSONValue } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'
import type { DataSourceActor } from '../datasource/workbench'
import type { WorkspaceFilesApi } from '../../runtime/capabilities/workspace-files'

/** Captured by host middleware, never accepted from model arguments. */
export interface AnalyticsAuthoringScope {
  actor: DataSourceActor
  workspaceId: string
  xpertId: string
  files: Pick<WorkspaceFilesApi, 'resolveRuntimeReference' | 'resolveFile' | 'readBuffer'>
}
export type AnalyticsAuthoringConnection =
  | { kind: 'workspace-files' }
  | { kind: 'rest-toolset'; toolsetId: string }
  | { kind: 'mcp-toolset'; toolsetId: string; serverName: string }
  | { kind: 'integration'; integrationId: string }
export interface AnalyticsAuthoringContext extends AnalyticsAuthoringScope {
  connection: AnalyticsAuthoringConnection
  signal: AbortSignal
  deadlineAt: number
}
/** Plugins own business mappings; the host owns identities, ACLs and persistence. */
export interface AnalyticsDefinitionAuthoring {
  integrationProvider?: string
  inspectSchema: Record<string, JSONValue>
  definitionSchema: Record<string, JSONValue>
  instructions: string
  inspect(input: Record<string, JSONValue>, context: AnalyticsAuthoringContext): Promise<JSONValue>
  prepare(input: Record<string, JSONValue>, context: AnalyticsAuthoringContext): Promise<Record<string, JSONValue>>
}
export interface AnalyticsAuthoringCandidate {
  providerId: string
  connectionKey: string
  name: string
}
export interface AnalyticsAuthoringSelection {
  providerId: string
  connectionKey: string
}
export interface AnalyticsDefinitionRegistration extends AnalyticsAuthoringSelection {
  /** Stable per intended definition. Reusing a key with changed content rejects. */
  requestId: string
  name: string
  definition: Record<string, JSONValue>
}
export interface AnalyticsDefinitionReceipt {
  source: Extract<AnalyticsVersionedSourceRef, { kind: 'definition' }>
  providerId: string
  name: string
  discoveryRequest: {
    source: Extract<AnalyticsVersionedSourceRef, { kind: 'definition' }>
    providerId: string
    request: Record<string, JSONValue>
  }
}
export interface AnalyticsDefinitionAuthoringApi {
  catalog(scope: AnalyticsAuthoringScope): Promise<AnalyticsAuthoringCandidate[]>
  inspect(
    scope: AnalyticsAuthoringScope,
    selection: AnalyticsAuthoringSelection,
    input: Record<string, JSONValue>
  ): Promise<{
    inspectSchema: Record<string, JSONValue>
    definitionSchema: Record<string, JSONValue>
    instructions: string
    metadata: JSONValue
  }>
  register(scope: AnalyticsAuthoringScope, input: AnalyticsDefinitionRegistration): Promise<AnalyticsDefinitionReceipt>
}
/** Separate from the read-only analytics query capability. No HTTP or model-supplied actor scope. */
export const AnalyticsDefinitionAuthoringCapability = createRuntimeCapability<AnalyticsDefinitionAuthoringApi>(
  'platform.analytics.definitions',
  {
    description: 'Discover authorized inputs and register immutable Agent-generated analytics definitions.'
  }
)
