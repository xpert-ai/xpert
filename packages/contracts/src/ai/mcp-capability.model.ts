import type { JSONValue } from '../core.model'

export const MCP_CAPABILITY_DESCRIPTOR_VERSION = 1 as const

export const MCP_CAPABILITY_TYPES = ['tool', 'resource', 'resource_template', 'prompt', 'app'] as const
export type McpCapabilityType = (typeof MCP_CAPABILITY_TYPES)[number]

export const MCP_TOOL_RISKS = ['read', 'write', 'dangerous'] as const
export type McpToolRisk = (typeof MCP_TOOL_RISKS)[number]

export const MCP_TOOL_SIDE_EFFECTS = ['none', 'reversible', 'irreversible'] as const
export type McpToolSideEffect = (typeof MCP_TOOL_SIDE_EFFECTS)[number]

export const MCP_TOOL_IDEMPOTENCY = ['safe', 'idempotent', 'non_idempotent'] as const
export type McpToolIdempotency = (typeof MCP_TOOL_IDEMPOTENCY)[number]

export const MCP_REQUIRED_CONTEXTS = [
  'tenant',
  'organization',
  'workspace',
  'principal',
  'project',
  'conversation',
  'agent',
  'execution',
  'store',
  'checkpoint'
] as const
export type McpRequiredContext = (typeof MCP_REQUIRED_CONTEXTS)[number]

export const MCP_CAPABILITY_VISIBILITIES = ['model', 'app'] as const
export type McpCapabilityVisibility = (typeof MCP_CAPABILITY_VISIBILITIES)[number]

/** JSON Schema 2020-12 document stored and transported without framework-specific schema objects. */
export type McpJsonSchema = {
  [keyword: string]: JSONValue
}

export interface McpToolBehavior {
  risk: McpToolRisk
  sideEffect: McpToolSideEffect
  idempotency: McpToolIdempotency
}

export interface McpToolAnnotations {
  title?: string
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export interface McpCapabilitySource {
  toolsetId: string
  pluginName?: string
  pluginVersion?: string
  /** Configured server within a multi-server MCP Consumer toolset. */
  serverName?: string
  /** Capability name used on the remote MCP server before host-side disambiguation. */
  remoteName?: string
}

export interface McpCapabilityDescriptorBase {
  descriptorVersion: typeof MCP_CAPABILITY_DESCRIPTOR_VERSION
  capabilityType: McpCapabilityType
  capabilityKey: string
  title?: string
  description?: string
  /** Lower-priority guidance supplied by the plugin or remote MCP server. */
  providerInstructions?: string
  source: McpCapabilitySource
  requiredContext: McpRequiredContext[]
  visibility: McpCapabilityVisibility[]
}

export interface McpToolCapabilityDescriptor extends McpCapabilityDescriptorBase {
  capabilityType: 'tool'
  inputSchema: McpJsonSchema
  outputSchema?: McpJsonSchema
  behavior: McpToolBehavior
  annotations?: McpToolAnnotations
  appResourceKey?: string
  taskMode?: 'optional' | 'required'
  taskMaxLifetimeMs?: number
}

export interface McpResourceCapabilityDescriptor extends McpCapabilityDescriptorBase {
  capabilityType: 'resource'
  uri: string
  mimeType?: string
  cacheTtlMs?: number
}

export interface McpResourceTemplateCapabilityDescriptor extends McpCapabilityDescriptorBase {
  capabilityType: 'resource_template'
  uriTemplate: string
  mimeType?: string
  argumentSchema: McpJsonSchema
  supportsCompletion: boolean
  cacheTtlMs?: number
}

export interface McpPromptCapabilityDescriptor extends McpCapabilityDescriptorBase {
  capabilityType: 'prompt'
  name: string
  argumentSchema: McpJsonSchema
  supportsCompletion?: boolean
}

export interface McpAppCapabilityDescriptor extends McpCapabilityDescriptorBase {
  capabilityType: 'app'
  entry: string
  csp?: {
    connectDomains?: string[]
    resourceDomains?: string[]
  }
  permissions?: {
    clipboardWrite?: boolean
    camera?: boolean
    microphone?: boolean
    geolocation?: boolean
  }
}

export type McpCapabilityDescriptor =
  | McpToolCapabilityDescriptor
  | McpResourceCapabilityDescriptor
  | McpResourceTemplateCapabilityDescriptor
  | McpPromptCapabilityDescriptor
  | McpAppCapabilityDescriptor

type McpCapabilityDeclarationOf<TDescriptor extends McpCapabilityDescriptor> =
  TDescriptor extends McpCapabilityDescriptor
    ? Omit<TDescriptor, 'source'> & {
        source?: Omit<McpCapabilitySource, 'toolsetId'>
      }
    : never

/** Plugin-side declaration before the host binds it to a concrete toolset instance. */
export type McpCapabilityDeclaration = McpCapabilityDeclarationOf<McpCapabilityDescriptor>
