import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { SandboxFileMiddleware } from './sandboxFile'

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
    AgentMiddlewareStrategy: () => (target: unknown) => target
  }
})

describe('SandboxFileMiddleware', () => {
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

  it('requires the sandbox xpert feature before creating middleware', async () => {
    const middleware = new SandboxFileMiddleware()

    expect(() =>
        middleware.createMiddleware({}, {
          tenantId: 'tenant-1',
          userId: 'user-1',
          xpertFeatures: null,
          node: {
            id: 'middleware-1',
            key: 'middleware-1',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider: 'sandbox-file'
          },
          tools: new Map()
        })
    ).toThrow('SandboxFile requires the xpert sandbox feature to be enabled.')
  })

  it('creates middleware tools when the sandbox xpert feature is enabled', async () => {
    const middleware = new SandboxFileMiddleware()

    const agentMiddleware = await Promise.resolve(
      middleware.createMiddleware({}, {
        tenantId: 'tenant-1',
        userId: 'user-1',
        xpertFeatures: createXpertFeatures(),
        node: {
          id: 'middleware-1',
          key: 'middleware-1',
          type: WorkflowNodeTypeEnum.MIDDLEWARE,
          provider: 'sandbox-file'
        },
        tools: new Map()
      })
    )

    expect(agentMiddleware.tools.map((tool) => tool.name)).toEqual([
      'sandbox_read_file',
      'sandbox_glob',
      'sandbox_grep',
      'sandbox_write_file',
      'sandbox_append_file',
      'sandbox_edit_file',
      'sandbox_multi_edit_file',
      'sandbox_list_dir'
    ])
  })
})
