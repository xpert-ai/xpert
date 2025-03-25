export type TMCPServer = {
  transport: 'sse' | 'stdio',
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
  servers: Record<string, TMCPServer>
}