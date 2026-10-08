import type { I18nObject, TMcpAppRefresh } from '@xpert-ai/contracts'

export interface McpAppCsp {
  connectDomains?: string[]
  resourceDomains?: string[]
}

export interface McpAppPermissions {
  clipboardWrite?: boolean
  camera?: boolean
  microphone?: boolean
  geolocation?: boolean
}

export interface McpAppDefinition {
  key: string
  entry: string
  title?: string | I18nObject
  description?: string
  /** Read-only tool called by the host Refresh action; never replays the entry tool. */
  refresh?: TMcpAppRefresh
  csp?: McpAppCsp
  permissions?: McpAppPermissions
}

/** App exposure is independent of publishing a tool on an external MCP server. */
export interface MiddlewareMcpApps {
  definitions: readonly McpAppDefinition[]
  tools: Readonly<
    Record<
      string,
      {
        resourceKey?: string
        visibility: readonly ('model' | 'app')[]
        /** Trusted plugin policy; omitted writes use the host approval flow. */
        approval?: 'required' | 'none'
      }
    >
  >
}

export function defineMcpApp(definition: McpAppDefinition): Readonly<McpAppDefinition> {
  return Object.freeze(definition)
}
