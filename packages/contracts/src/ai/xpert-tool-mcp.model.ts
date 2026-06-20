import type { TMcpAppCsp, TMcpAppPermissions, TMcpAppToolResult, TMcpAppVisibility } from '@xpert-ai/chatkit-types'
import type { I18nObject } from '../i18n.model'
import type { IconDefinition } from '../types'

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
  stderr?: 'pipe' | 'inherit' | 'ignore' | string
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

export type TMcpStdioRuntimePolicy = {
  /**
   * Runtime provider requested by the toolset or plugin. v1 supports
   * local-process; sandbox and sidecar are reserved extension points.
   */
  provider?: 'local-process' | 'sandbox' | 'sidecar' | string
  /**
   * Maximum startup wait time in milliseconds.
   */
  startupTimeoutMs?: number
  /**
   * Maximum idle lifetime in milliseconds before the host may close the runtime.
   */
  idleTimeoutMs?: number
  /**
   * Maximum total lifetime in milliseconds.
   */
  maxLifetimeMs?: number
  /**
   * Optional command allow-list requested by the plugin/toolset. The platform
   * allow-list remains authoritative.
   */
  allowedCommands?: string[]
}

export type TMCPServer = {
  type: MCPServerType
  command?: string
  args?: string[]
  env?: Record<string, string>
  stderr?: 'pipe' | 'inherit' | 'ignore' | string
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

  /**
   * Requested stdio runtime policy. The platform clamps this policy before use.
   */
  runtime?: TMcpStdioRuntimePolicy
}

export type TMCPSchema = {
  servers?: Record<string, TMCPServer>
  mcpServers?: Record<string, TMCPServer>
}

export const MCP_APP_RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app'

export type TMcpAppUiMeta = {
  resourceUri: string
  title?: string | I18nObject
  description?: string | I18nObject
  icon?: IconDefinition
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
  inputSchema?: Record<string, unknown>
  visibility: TMcpAppVisibility[]
  ui?: TMcpAppUiMeta
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
}

export type TMcpAppComponentData = {
  type: 'McpApp'
  appInstanceId: string
  appInstanceToken?: string
  resourceUri: string
  toolName: string
  toolCallId?: string
  toolsetId?: string
  serverName?: string
  executionId?: string
  title?: string | I18nObject
  description?: string | I18nObject
  icon?: IconDefinition
  csp?: TMcpAppCsp
  permissions?: TMcpAppPermissions
  domain?: string
  prefersBorder?: boolean
  toolInput?: Record<string, unknown>
  /**
   * Standardized initial CallToolResult used to replay MCP App history without
   * re-running the originating tool. Raw app HTML is never persisted here.
   */
  toolResult?: TMcpAppToolResult
  /** Serialized byte size of the initial tool result when known. */
  toolResultSize?: number
  /** True when the initial tool result was too large to inline in chat history. */
  toolResultTruncated?: boolean
  visibility?: TMcpAppVisibility[]
  status?: 'running' | 'success' | 'fail'
  error?: string
}
