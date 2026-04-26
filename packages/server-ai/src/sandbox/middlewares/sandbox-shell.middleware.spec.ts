import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { CommandBus } from '@nestjs/cqrs'
import { DEFAULT_SANDBOX_SHELL_TIMEOUT_MS, ExecuteResponse } from '@xpert-ai/plugin-sdk'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { SandboxShellMiddleware } from './sandbox-shell.middleware'

jest.mock('@langchain/core/callbacks/dispatch', () => ({
  dispatchCustomEvent: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@xpert-ai/contracts', () => ({
  ChatMessageEventTypeEnum: {
    ON_TOOL_MESSAGE: 'ON_TOOL_MESSAGE'
  },
  ChatMessageStepCategory: {
    Program: 'Program'
  },
  SandboxManagedServiceErrorCode: {
    ConversationRequired: 'conversation_required',
    ProviderUnavailable: 'provider_unavailable'
  },
  WorkflowNodeTypeEnum: {
    MIDDLEWARE: 'middleware'
  },
  getToolCallIdFromConfig: (config: { metadata?: { tool_call_id?: string } }) => config?.metadata?.tool_call_id
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

describe('SandboxShellMiddleware', () => {
  let commandBus: {
    execute: jest.Mock
  }

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

  const createTool = async (toolName: string, xpertFeatures = createXpertFeatures()) => {
    const middleware = new SandboxShellMiddleware(commandBus as unknown as CommandBus)
    const agentMiddleware = await Promise.resolve(
      middleware.createMiddleware(
        {},
        {
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
        }
      )
    )
    const tool = agentMiddleware.tools.find((candidate) => candidate.name === toolName)
    if (!tool) {
      throw new Error(`Tool ${toolName} was not registered`)
    }
    return tool
  }

  const createBackend = (response: ExecuteResponse) => ({
    execute: jest.fn().mockResolvedValue(response),
    streamExecute: jest.fn().mockResolvedValue(response)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    commandBus = {
      execute: jest.fn()
    }
  })

  it('requires the sandbox xpert feature before creating middleware', async () => {
    const middleware = new SandboxShellMiddleware(commandBus as unknown as CommandBus)

    expect(() =>
      middleware.createMiddleware(
        {},
        {
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
        }
      )
    ).toThrow('SandboxShell requires the xpert sandbox feature to be enabled.')
  })

  it('passes the 600 second default timeout to the backend', async () => {
    const tool = await createTool('sandbox_shell')
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
    expect(dispatchCustomEvent).toHaveBeenCalled()
  })

  it('passes timeout_sec overrides through to the backend', async () => {
    const tool = await createTool('sandbox_shell')
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
    const tool = await createTool('sandbox_shell')
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
    const tool = await createTool('sandbox_shell')
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

  it('returns stable error codes for unsupported managed service providers', async () => {
    commandBus.execute.mockRejectedValue({
      code: 'unsupported_provider',
      message: 'Sandbox provider "legacy" does not support managed services.'
    })
    const tool = await createTool('sandbox_service_start')

    const result = await tool.invoke(
      {
        command: 'npm run dev',
        name: 'web',
        port: 4173
      },
      {
        configurable: {
          agentKey: 'agent-1',
          executionId: 'execution-1',
          sandbox: {
            backend: {}
          },
          thread_id: 'thread-1'
        }
      }
    )

    expect(result).toBe(
      JSON.stringify(
        {
          code: 'unsupported_provider',
          message: 'Sandbox provider "legacy" does not support managed services.'
        },
        null,
        2
      )
    )
  })

  it('stringifies managed service command results', async () => {
    commandBus.execute.mockResolvedValue({
      serviceId: 'service-1',
      status: 'running'
    })
    const tool = await createTool('sandbox_service_list')

    const result = await tool.invoke(
      {},
      {
        configurable: {
          thread_id: 'thread-1'
        }
      }
    )

    expect(result).toBe(
      JSON.stringify(
        {
          serviceId: 'service-1',
          status: 'running'
        },
        null,
        2
      )
    )
    expect(commandBus.execute.mock.calls[0]?.[0]?.params).toEqual({
      threadId: 'thread-1'
    })
  })
})
