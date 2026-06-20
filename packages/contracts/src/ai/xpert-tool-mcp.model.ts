export enum MCPServerType {
  SSE = 'sse',
  STDIO = 'stdio',
  CODE = 'code',
  HTTP = 'http'
}

/**
 * Configuration for stdio transport connection
 */
export interface StdioConnection {
  transport: 'stdio'
  command: string
  args: string[]
  env?: Record<string, string>
  encoding?: string
  encodingErrorHandler?: 'strict' | 'ignore' | 'replace'
}

/**
 * Configuration for SSE transport connection
 */
export interface SSEConnection {
  transport: 'sse'
  url: string
  headers?: Record<string, string>
  useNodeEventSource?: boolean
}

/**
 * Configuration for Streamable HTTP transport connection
 */
export interface HttpConnection {
  transport: 'http'
  url: string
  headers?: Record<string, string>
  /**
   * Whether to automatically fallback to SSE if Streamable HTTP is not available.
   * Defaults to true.
   */
  automaticSSEFallback?: boolean
}

export type TMCPServerReconnect = {
  /**
   * Whether to automatically restart the process if it exits
   */
  enabled?: boolean
  /**
   * Maximum number of restart attempts
   */
  maxAttempts?: number
  /**
   * Delay in milliseconds between restart attempts
   */
  delayMs?: number
}

export type TMCPServer = {
  type: MCPServerType
  command?: string
  args?: string[]
  env?: Record<string, string>
  encoding?: string
  encodingErrorHandler?: string
  /**
   * Additional reconnection settings
   */
  reconnect?: TMCPServerReconnect

  url?: string
  headers?: Record<string, string>
  useNodeEventSource?: boolean
  /**
   * Whether to automatically fallback to SSE if Streamable HTTP is not available.
   * Defaults to true. Only applicable for HTTP transport.
   */
  automaticSSEFallback?: boolean
  /**
   * Default timeout in milliseconds for tool execution. Must be greater than 0.
   * If not specified, tools will use their own configured timeout values.
   */
  defaultToolTimeout?: number

  files?: { name: string; content: string }[]

  toolNamePrefix?: string
  /**
   * Init scripts for sandbox
   */
  initScripts?: string
}

export type TMCPSchema = {
  servers?: Record<string, TMCPServer>
  mcpServers?: Record<string, TMCPServer>
}

export const MCP_APP_RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app'

export type TMcpAppVisibility = 'model' | 'app'

export type TMcpAppCsp = {
  connectDomains?: string[]
  resourceDomains?: string[]
  frameDomains?: string[]
  baseUriDomains?: string[]
}

export type TMcpAppPermissionGrant = boolean | Record<string, unknown>

export type TMcpAppPermissions = {
  camera?: TMcpAppPermissionGrant
  microphone?: TMcpAppPermissionGrant
  geolocation?: TMcpAppPermissionGrant
  clipboardWrite?: TMcpAppPermissionGrant
}

export type TMcpAppUiMeta = {
  resourceUri: string
  /**
   * @deprecated MCP Apps resource security metadata belongs on the resource
   * content item `_meta.ui`. Tool-level values are kept only as a legacy
   * fallback while older plugins migrate.
   */
  csp?: TMcpAppCsp
  /**
   * @deprecated MCP Apps resource security metadata belongs on the resource
   * content item `_meta.ui`. Tool-level values are kept only as a legacy
   * fallback while older plugins migrate.
   */
  permissions?: TMcpAppPermissions
  domain?: string
  prefersBorder?: boolean
}

export type TMcpToolAppMeta = {
  serverName: string
  name: string
  displayName: string
  visibility: TMcpAppVisibility[]
  ui?: TMcpAppUiMeta
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

export type TMcpAppComponentData = {
  type: 'McpApp'
  appInstanceId: string
  resourceUri: string
  toolName: string
  toolCallId?: string
  toolsetId?: string
  serverName?: string
  executionId?: string
  title?: string
  csp?: TMcpAppCsp
  permissions?: TMcpAppPermissions
  domain?: string
  prefersBorder?: boolean
  toolInput?: Record<string, unknown>
  visibility?: TMcpAppVisibility[]
  status?: 'running' | 'success' | 'fail'
  error?: string
}
