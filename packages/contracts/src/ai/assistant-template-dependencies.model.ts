import type { PluginName, XpertPluginMcpServerPolicy } from '../plugin'

/** Portable package identity. The installer pins an omitted digest before writing an Assistant. */
export interface AgentPluginTemplateDependencySource {
  kind: 'agent-plugin'
  name: string
  digest?: string
}

export interface AssistantTemplateSkillDependency {
  pluginName?: PluginName
  source?: AgentPluginTemplateDependencySource
  componentKey: string
  targetAgentKey?: string
}

export interface AssistantTemplateMcpServerDependency {
  pluginName?: PluginName
  source?: AgentPluginTemplateDependencySource
  componentKey: string
  targetAgentKey?: string
  policyOverrides?: XpertPluginMcpServerPolicy
}

export interface AssistantTemplateHookDependency {
  pluginName?: PluginName
  componentKey: string
  targetAgentKey?: string
  events?: string[]
}

export interface AssistantTemplateAppDependency {
  pluginName?: PluginName
  componentKey: string
  auth?: 'on_install' | 'on_first_use'
}

export interface AssistantTemplateToolsetDependency {
  pluginName?: PluginName
  provider: string
  templateNodeKey: string
  targetAgentKey?: string
  instanceName?: string
}

export interface AssistantTemplateDependencies {
  /** Explicit exact runtime requirements. Omit for dependencies that support compatible upgrades. */
  versions?: { pluginName: PluginName; version: string }[]
  plugins?: PluginName[]
  skills?: AssistantTemplateSkillDependency[]
  mcpServers?: AssistantTemplateMcpServerDependency[]
  hooks?: AssistantTemplateHookDependency[]
  apps?: AssistantTemplateAppDependency[]
  toolsets?: AssistantTemplateToolsetDependency[]
}
