import type { McpAppDefinition } from './app'
import type { McpPromptDefinition } from './prompt'
import type { McpResourceDefinition } from './resource'
import type { McpResourceTemplateDefinition } from './resource-template'
import type { AnyXpertToolDefinition } from '../toolset/define-tool'

export interface McpCapabilityDefinitions {
  /** Lower-priority server guidance merged after platform and Publication instructions. */
  instructions?: string
  tools?: readonly AnyXpertToolDefinition[]
  resources?: readonly McpResourceDefinition[]
  resourceTemplates?: readonly McpResourceTemplateDefinition[]
  prompts?: readonly McpPromptDefinition[]
  apps?: readonly McpAppDefinition[]
}

/** Implemented by toolsets that provide host-executed MCP capabilities in addition to tools. */
export interface McpCapabilityRuntimeProvider {
  getMcpCapabilityDefinitions(): Readonly<McpCapabilityDefinitions>
  getMcpCapabilitySource?(): { pluginName?: string; pluginVersion?: string }
}

export function defineMcpCapabilities(definitions: McpCapabilityDefinitions): Readonly<McpCapabilityDefinitions> {
  return Object.freeze({
    instructions: definitions.instructions,
    tools: freezeItems(definitions.tools),
    resources: freezeItems(definitions.resources),
    resourceTemplates: freezeItems(definitions.resourceTemplates),
    prompts: freezeItems(definitions.prompts),
    apps: freezeItems(definitions.apps)
  })
}

function freezeItems<T>(items?: readonly T[]) {
  return items ? Object.freeze([...items]) : undefined
}
