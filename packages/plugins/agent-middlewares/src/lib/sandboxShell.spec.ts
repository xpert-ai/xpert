import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { DEFAULT_SANDBOX_SHELL_TIMEOUT_MS, ExecuteResponse } from '@xpert-ai/plugin-sdk'
import { SandboxShellMiddleware } from './sandboxShell'

jest.mock('@xpert-ai/contracts', () => ({
  WorkflowNodeTypeEnum: {
    MIDDLEWARE: 'middleware'
  }
}))

jest.mock('@xpert-ai/plugin-sdk', () => {
  class BaseSandbox {
    workingDirectory = ''
  }

  return {
    __esModule: true,
    BaseSandbox,
    DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC: 600,
    DEFAULT_SANDBOX_SHELL_TIMEOUT_MS: 600000,
    SANDBOX_SHELL_TIMEOUT_LIMITS_SEC: {
      min: 1,
      max: 3600
    },
    isSandboxBackend: (backend: { execute?: unknown }) => typeof backend?.execute === 'function',
    resolveSandboxBackend: (sandbox: unknown) => {
      if (!sandbox || typeof sandbox !== 'object') {
        return null
      }

      const backend = Reflect.has(sandbox, 'backend') ? Reflect.get(sandbox, 'backend') : sandbox
      return backend && typeof backend === 'object' && typeof Reflect.get(backend, 'execute') === 'function'
        ? backend
        : null
    },
    secondsToMilliseconds: (seconds: number) => Math.trunc(seconds * 1000),
    AgentMiddlewareStrategy: () => (target: unknown) => target
  }
})

jest.mock('./toolMessageUtils', () => ({
  __esModule: true,
  getToolCallId: () => 'tool-call-1',
  withStreamingToolMessage: async (
    _toolCallId: string,
    _toolName: string,
    command: string,
    backend: { streamExecute?: Function; execute: Function },
    executionOptions?: { timeoutMs?: number }
  ) =>
    backend.streamExecute
      ? backend.streamExecute(command, () => undefined, executionOptions)
      : backend.execute(command, executionOptions)
}))

describe('SandboxShellMiddleware', () => {
  const createXpertFeatures = () => ({
    opener: {
      enabled: false,
      message: '',
      questions: []
    },
    suggestion: {
      enabled: false,
      prompt: ''
    },
    textToSpeech: {
      enabled: false
    },
    speechToText: {
      enabled: false
    },
    sandbox: {
      enabled: true
    }
  })

  const createTool = async (xpertFeatures = createXpertFeatures()) => {
    const middleware = new SandboxShellMiddleware()
    const agentMiddleware = await Promise.resolve(
      middleware.createMiddleware({}, {
        tenantId: 'tenant-1',
        userId: 'user-1',
        xpertFeatures,
        node: {
          id: 'middleware-1',
          key: 'middleware-1',
          type: WorkflowNodeTypeEnum.MIDDLEWARE,
          provider: 'sandbox-shell'
        },
        tools: new Map()
      })
    )
    return agentMiddleware.tools[0]
  }

  const createBackend = (response: ExecuteResponse) => ({
    execute: jest.fn().mockResolvedValue(response),
    streamExecute: jest.fn().mockResolvedValue(response)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('requires the sandbox xpert feature before creating middleware', async () => {
    const middleware = new SandboxShellMiddleware()

    expect(() =>
        middleware.createMiddleware({}, {
          tenantId: 'tenant-1',
          userId: 'user-1',
          xpertFeatures: null,
          node: {
            id: 'middleware-1',
            key: 'middleware-1',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: 'sandbox-shell'
          },
          tools: new Map()
        })
    ).toThrow('SandboxShell requires the xpert sandbox feature to be enabled.')
  })

  it('passes the 600 second default timeout to the backend', async () => {
    const tool = await createTool()
    const backend = createBackend({
      output: 'install complete',
      exitCode: 0,
      truncated: false,
      timedOut: false
    })

    const result = await tool.invoke(
      { command: 'npm install' },
      {
        configurable: {
          sandbox: {
            backend
          }
        },
        metadata: {
          tool_call_id: 'tool-call-1'
        }
      }
    )

    expect(result).toBe('install complete')
    expect(backend.streamExecute).toHaveBeenCalledWith('npm install', expect.any(Function), {
      timeoutMs: DEFAULT_SANDBOX_SHELL_TIMEOUT_MS
    })
  })

  it('passes timeout_sec overrides through to the backend', async () => {
    const tool = await createTool()
    const backend = createBackend({
      output: 'done',
      exitCode: 0,
      truncated: false,
      timedOut: false
    })

    await tool.invoke(
      {
        command: 'cargo build',
        timeout_sec: 42
      },
      {
        configurable: {
          sandbox: {
            backend
          }
        }
      }
    )

    expect(backend.streamExecute).toHaveBeenCalledWith('cargo build', expect.any(Function), {
      timeoutMs: 42000
    })
  })

  it('returns explicit timeout output without an exitCode null wrapper', async () => {
    const tool = await createTool()
    const backend = createBackend({
      output: 'Command timed out after 2s (2000ms)',
      exitCode: null,
      truncated: false,
      timedOut: true
    })

    const result = await tool.invoke(
      { command: 'pytest', timeout_sec: 2 },
      {
        configurable: {
          sandbox: {
            backend
          }
        }
      }
    )

    expect(result).toBe('Command timed out after 2s (2000ms)')
  })

  it('accepts direct sandbox backend values from the runtime config', async () => {
    const tool = await createTool()
    const backend = createBackend({
      output: 'ok',
      exitCode: 0,
      truncated: false,
      timedOut: false
    })

    const result = await tool.invoke(
      { command: 'ls' },
      {
        configurable: {
          sandbox: backend
        }
      }
    )

    expect(result).toBe('ok')
    expect(backend.streamExecute).toHaveBeenCalledWith('ls', expect.any(Function), {
      timeoutMs: DEFAULT_SANDBOX_SHELL_TIMEOUT_MS
    })
  })
})
