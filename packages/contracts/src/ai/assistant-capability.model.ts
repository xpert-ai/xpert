export interface AssistantCapabilityDeclaration {
  key: string
  /** Required capabilities cannot be disabled; optional capabilities default to off. */
  required?: boolean
}

/** Structural template preview, never an authorization decision for a running user. */
export interface AssistantCapabilitySummary {
  agents: { key: string; label: string; middleware: { provider: string; toolNames: string[] }[] }[]
  skills: { pluginName: string; componentKey: string; targetAgentKey?: string }[]
  seedMemoryCount: number
  sandbox: boolean
}
