export interface AssistantCapabilityDeclaration {
  key: string
  /** Required capabilities cannot be disabled; optional capabilities default to off. */
  required?: boolean
}

/** Portable identity for an existing workspace connection; never a URL or credential. */
export interface AssistantCapabilityToolsetRequirement {
  bindingKey: string
  category: 'mcp'
  requiredTools: readonly string[]
  /** Omitted means the primary Agent. */
  targetAgentKey?: string
}

/** Credential-free resource snapshot used during graph composition. */
export interface AssistantCapabilityToolsetBinding {
  requirement: AssistantCapabilityToolsetRequirement
  toolset: {
    id: string
    name: string
    type?: string
    category: 'mcp'
    options: { capabilityBindingKey: string }
  }
}

/** Structural template preview, never an authorization decision for a running user. */
export interface AssistantCapabilitySummary {
  agents: { key: string; label: string; middleware: { provider: string; toolNames: string[] }[] }[]
  skills: {
    pluginName: string
    source?: import('./assistant-template-dependencies.model').AgentPluginTemplateDependencySource
    componentKey: string
    targetAgentKey?: string
  }[]
  sandbox: boolean
}
