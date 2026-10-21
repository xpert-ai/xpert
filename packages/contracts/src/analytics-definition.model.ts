import type { AnalyticsProviderDescriptor } from './analytics-query.model'
import type { JSONValue } from './core.model'

/** Configuration is owned by a provider; bindings contain only immutable source identities. */
export type AnalyticsConfigurationEntry =
  | {
      kind: 'definition'
      schema: Record<string, JSONValue>
      connection: 'workspace-files' | 'rest-toolset' | 'mcp-toolset' | 'integration'
    }
  | { kind: 'artifact'; pluginName: string; resourceType: string; registrationTool: string }
export interface AnalyticsConfigurableProvider {
  descriptor: AnalyticsProviderDescriptor
  configuration: AnalyticsConfigurationEntry
}
export interface IAnalyticsDefinition {
  id: string
  tenantId: string
  organizationId: string
  userId: string
  name: string
  providerId: string
  visibility: 'private' | 'organization'
  status: 'active' | 'archived'
  currentVersionId: string | null
}
export interface IAnalyticsDefinitionVersion {
  id: string
  definitionId: string
  versionNumber: number
  options: Record<string, JSONValue>
  sha256: string
}
export interface AnalyticsDefinitionCreate {
  name: string
  providerId: string
  visibility: IAnalyticsDefinition['visibility']
  options: Record<string, JSONValue>
}
export interface AnalyticsDefinitionPublish {
  expectedCurrentVersionId: string
  options: Record<string, JSONValue>
}
