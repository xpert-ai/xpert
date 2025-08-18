export enum MCPServerType {
  SSE = 'sse',
  STDIO = 'stdio',
  CODE = 'code'
}

/**
 * Configuration for stdio transport connection
 */
export interface StdioConnection {
  transport: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
  encoding?: string;
  encodingErrorHandler?: "strict" | "ignore" | "replace";
}

/**
 * Configuration for SSE transport connection
 */
export interface SSEConnection {
  transport: "sse";
  url: string;
  headers?: Record<string, string>;
  useNodeEventSource?: boolean;
}

export type TMCPServerReconnect = {
  /**
   * Whether to automatically restart the process if it exits
   */
  enabled?: boolean;
  /**
    * Maximum number of restart attempts
    */
  maxAttempts?: number;
  /**
    * Delay in milliseconds between restart attempts
    */
  delayMs?: number;
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

  url?: string,
  headers?: Record<string, string>
  useNodeEventSource?: boolean

  files?: {name: string; content: string}[]

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