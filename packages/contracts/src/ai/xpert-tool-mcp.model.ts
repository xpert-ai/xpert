export enum MCPServerTransport {
  SSE = 'sse',
  STDIO = 'stdio'
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
  /**
   * Additional restart settings
   */
  restart?: {
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
  };
}

/**
 * Configuration for SSE transport connection
 */
export interface SSEConnection {
  transport: "sse";
  url: string;
  headers?: Record<string, string>;
  useNodeEventSource?: boolean;
  /**
   * Additional reconnection settings
   */
  reconnect?: {
    /**
     * Whether to automatically reconnect if the connection is lost
     */
    enabled?: boolean;
    /**
     * Maximum number of reconnection attempts
     */
    maxAttempts?: number;
    /**
     * Delay in milliseconds between reconnection attempts
     */
    delayMs?: number;
  };
}

export type TMCPServer = {
  transport: MCPServerTransport,
  command?: string
  args?: string[]
  env?: Record<string, string>
  encoding?: string
  encodingErrorHandler?: string
  restart: {
    "enabled": true,
    "maxAttempts": 3,
    "delayMs": 1000
  }

  url?: string,
  headers?: Record<string, string>
  useNodeEventSource?: boolean
  reconnect: {
    "enabled": true,
    "maxAttempts": 3,
    "delayMs": 1000
  }
}

export type TMCPSchema = {
  servers?: Record<string, TMCPServer>
  mcpServers?: Record<string, TMCPServer>
}