/** Official resource packages imported into the selected organization, without publishing workspace bindings. */
export const DEFAULT_AGENT_PLUGINS_SOURCE = {
  url: 'https://github.com/xpert-ai/xpert-plugins.git',
  ref: 'main',
  subdirectory: 'agent-plugins',
  browseUrl: 'https://github.com/xpert-ai/xpert-plugins/tree/main/agent-plugins'
} as const

export interface DefaultAgentPluginImportItem {
  id: string
  status: 'imported' | 'existing' | 'failed'
  packageId?: string
  title?: string
  diagnosticCount?: number
  error?: string
}

export interface DefaultAgentPluginsImportResult {
  commit: string
  items: DefaultAgentPluginImportItem[]
}
