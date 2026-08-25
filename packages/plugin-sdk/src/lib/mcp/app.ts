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
  title?: string
  description?: string
  csp?: McpAppCsp
  permissions?: McpAppPermissions
}

export function defineMcpApp(definition: McpAppDefinition): Readonly<McpAppDefinition> {
  return Object.freeze(definition)
}
