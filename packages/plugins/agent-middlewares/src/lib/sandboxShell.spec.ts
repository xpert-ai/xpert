import { DEFAULT_SANDBOX_SHELL_TIMEOUT_MS, ExecuteResponse } from '@xpert-ai/plugin-sdk'
import { SandboxShellMiddleware } from './sandboxShell'

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
  const createTool = async () => {
    const middleware = new SandboxShellMiddleware()
    const agentMiddleware = await Promise.resolve(middleware.createMiddleware({}, {} as any))
    return agentMiddleware.tools[0]
  }

  const createBackend = (response: ExecuteResponse) => ({
    execute: jest.fn().mockResolvedValue(response),
    streamExecute: jest.fn().mockResolvedValue(response)
  })

  beforeEach(() => {
    jest.clearAllMocks()
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
})
