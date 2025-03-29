export const Samples = {
  'server-name': {
    // For stdio transport (transport field is optional for stdio)
    transport: 'stdio', // Optional for stdio, defaults to "stdio" if command and args are present
    command: 'python',
    args: ['./server.py'],
    env: {
      ENV_VAR: 'value'
    },
    encoding: 'utf-8',
    encodingErrorHandler: 'strict',
    restart: {
      enabled: true,
      maxAttempts: 3,
      delayMs: 1000
    }
  },
  'server-name2': {
    transport: 'sse',
    url: 'http://localhost:8000/sse',
    headers: {
      Authorization: 'Bearer token'
    },
    useNodeEventSource: true,
    reconnect: {
      enabled: true,
      maxAttempts: 3,
      delayMs: 1000
    }
  }
}
