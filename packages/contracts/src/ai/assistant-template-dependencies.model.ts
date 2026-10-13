import type { PluginName, XpertPluginMcpServerPolicy } from '../plugin'

export interface AssistantTemplateSkillDependency {
  pluginName?: PluginName
  componentKey: string
  targetAgentKey?: string
}

export interface AssistantTemplateMcpServerDependency {
  pluginName?: PluginName
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
  /** Exact compatible versions; the active version is pinned at installation. */
  versions?: { pluginName: PluginName; version: string }[]
  plugins?: PluginName[]
  skills?: AssistantTemplateSkillDependency[]
  mcpServers?: AssistantTemplateMcpServerDependency[]
  hooks?: AssistantTemplateHookDependency[]
  apps?: AssistantTemplateAppDependency[]
  toolsets?: AssistantTemplateToolsetDependency[]
}
