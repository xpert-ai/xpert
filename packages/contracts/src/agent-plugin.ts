import type { JSONValue } from './core.model'
import type { IconDefinition, TAvatar } from './types'
import type { I18nText } from './i18n.model'

/**
 * Selectable standard package, configured middleware, or published platform Assistant.
 * agent_plugin is distinct from a native server-code plugin.
 */
export type RuntimeResourceKind = 'agent_plugin' | 'middleware' | 'external_xpert'

/**
 * Availability in the current user/project context; execution still revalidates access.
 * partial means some components are usable; requires_auth needs personal authorization;
 * configuration_required needs administrator configuration.
 */
export type RuntimeResourceStatus = 'ready' | 'requires_auth' | 'configuration_required' | 'partial' | 'unavailable'

/** Version-pinned catalog reference; copy both fields unchanged when selecting. */
export interface RuntimeResourceReference {
  /** Opaque resource ID, not necessarily a UUID; distinct from Connector or invocation IDs. */
  bindingId: string
  /** Opaque resource version; existing selections must not silently upgrade. */
  version: string
}

/**
 * Complete conversation selection, independent of graph runtimeCapabilities.
 * Updates apply to the next execution without changing the Assistant graph.
 */
export interface RuntimeResourcesSelection {
  /** Optimistic concurrency revision: use the latest server value; new selections start at zero. */
  revision: number
  /** Full replacement set; an empty array clears the selection. */
  resources: RuntimeResourceReference[]
}

/** Package or component diagnostic. Use code for programmatic handling, message for display. */
export interface AgentPluginDiagnostic {
  /** Component key/path or package-level location. */
  component: string
  code: string
  message: string
}

/** Contextual resource descriptor. Selection identity is bindingId plus version. */
export interface RuntimeResourceCatalogItem extends RuntimeResourceReference {
  kind: RuntimeResourceKind
  title: string
  description?: I18nText
  icon?: string
  /** Actual resource avatar, including published Assistant avatars. */
  avatar?: TAvatar
  /** Middleware/provider icon; use a category fallback when absent. */
  iconDefinition?: IconDefinition
  /** Related middleware Views for display, not active View instances. */
  views?: RuntimeResourceView[]
  status: RuntimeResourceStatus
  diagnostics: AgentPluginDiagnostic[]
  /** Package components and their individual availability. Plugins are selected as a whole. */
  components: Array<{
    key: string
    kind: 'skill' | 'mcp' | 'middleware' | 'external_xpert'
    status: RuntimeResourceStatus
  }>
}

/** Related View metadata; displaying it neither activates the View nor grants access. */
export interface RuntimeResourceView {
  key: string
  title: string
  description?: I18nText
  icon?: IconDefinition
  /** Feature keys used to associate the View with middleware. */
  requiredFeatures: string[]
}

/** Paginated resource search result in the authorized context. */
export interface RuntimeResourceCatalog {
  items: RuntimeResourceCatalogItem[]
  /** Total matches before pagination. */
  total: number
}

/**
 * Portable extensions["cn.xpertai"] manifest data. References installed capabilities;
 * contains no server code, deployment IDs or credentials.
 */
export interface AgentPluginXpertExtension {
  /** Extension schema version, independent of the Agent Plugins spec version. */
  version: 1
  interface?: {
    displayName?: string
    description?: string
    icon?: string
  }
  /** Presets for already installed middleware providers. */
  middlewares?: Array<{
    key: string
    provider: string
    options?: { [key: string]: JSONValue }
  }>
  /** Logical expert references mapped to published Assistants by the administrator. */
  experts?: Array<{
    key: string
    reference: string
  }>
  /** Authentication dependencies keyed by the exact server name in mcp.json. */
  connectors?: { [serverName: string]: AgentPluginConnectorAuth }
}

/** Portable MCP authorization requirement: generic MCP OAuth or an existing Connector provider. */
export type AgentPluginConnectorAuth =
  | {
      type: 'mcp_oauth'
      scopes?: string[]
      /** OAuth client registration mode; omission uses host defaults. */
      clientRegistration?: 'dynamic' | 'preregistered'
    }
  | {
      type: 'existing'
      provider: string
      /** Resource/audience understood by the Connector provider. */
      resource: string
      scopes?: string[]
    }

/** Host-local authorization binding; never include it in a portable package. */
export interface AgentPluginConnectorBinding {
  bindingId: string
  provider: string
}

/** Administrator-owned resource configuration; deployment-local IDs are allowed here. */
export type RuntimeResourceDefinition =
  | {
      kind: 'agent_plugin'
      packageId: string
      /** Portable expert reference to approved, published Assistant ID. */
      experts: { [reference: string]: string }
      /** Direct MCP OAuth server names; must not overlap connectorServers. */
      oauthServers?: string[]
      /** Connector requirements, optionally populated from the package extension. */
      connectorServers?: { [serverName: string]: AgentPluginConnectorAuth }
    }
  | {
      kind: 'middleware'
      provider: string
      options: { [key: string]: JSONValue }
    }
  | {
      kind: 'external_xpert'
      /** Published platform Assistant ID, not a remote Agent URL. */
      xpertId: string
    }

/** Administrator request to publish a resource binding. */
export interface RuntimeResourceBindingInput {
  /** Supersede an existing binding; its conversation selections are not silently rewritten. */
  replacesBindingId?: string
  title: string
  description?: string
  /** Workspaces granted access within the organization. */
  workspaceIds: string[]
  definition: RuntimeResourceDefinition
}
