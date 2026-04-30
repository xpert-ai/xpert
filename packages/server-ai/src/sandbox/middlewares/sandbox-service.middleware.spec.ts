import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { CommandBus } from '@nestjs/cqrs'
import { SandboxServiceMiddleware } from './sandbox-service.middleware'

jest.mock('@xpert-ai/contracts', () => ({
  SandboxManagedServiceErrorCode: {
    ConversationRequired: 'conversation_required',
    ProviderUnavailable: 'provider_unavailable'
  },
  WorkflowNodeTypeEnum: {
    MIDDLEWARE: 'middleware'
  }
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
  __esModule: true,
  AgentMiddlewareStrategy: () => (target: unknown) => target
}))

describe('SandboxServiceMiddleware', () => {
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

  const createMiddleware = (xpertFeatures = createXpertFeatures()) => {
    const middleware = new SandboxServiceMiddleware(commandBus as unknown as CommandBus)
    return Promise.resolve(
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
            provider: 'SandboxService'
          },
          runtime: {} as never,
          tools: new Map()
        }
      )
    )
  }

  const createTool = async (toolName: string, xpertFeatures = createXpertFeatures()) => {
    const agentMiddleware = await createMiddleware(xpertFeatures)
    const tool = agentMiddleware.tools.find((candidate) => candidate.name === toolName)
    if (!tool) {
      throw new Error(`Tool ${toolName} was not registered`)
    }
    return tool
  }

  beforeEach(() => {
    jest.clearAllMocks()
    commandBus = {
      execute: jest.fn()
    }
  })

  it('requires the sandbox xpert feature before creating middleware', async () => {
    const middleware = new SandboxServiceMiddleware(commandBus as unknown as CommandBus)

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
            provider: 'SandboxService'
          },
          runtime: {} as never,
          tools: new Map()
        }
      )
    ).toThrow('SandboxService requires the xpert sandbox feature to be enabled.')
  })

  it('registers managed service tools separately from sandbox shell', async () => {
    const middleware = await createMiddleware()

    expect(middleware.name).toBe('SandboxService')
    expect(middleware.tools.map((tool) => tool.name)).toEqual([
      'sandbox_service_start',
      'sandbox_service_list',
      'sandbox_service_logs',
      'sandbox_service_stop',
      'sandbox_service_restart'
    ])
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
