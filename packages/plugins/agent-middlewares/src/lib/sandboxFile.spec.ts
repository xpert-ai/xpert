import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { SandboxFileMiddleware } from './sandboxFile'

const mockWithToolMessage = jest.fn(
  async (_toolCallId: string, _toolName: string, _title: string, _input: unknown, fn: () => Promise<unknown>) => fn()
)

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

jest.mock('./toolMessageUtils', () => ({
  __esModule: true,
  getToolCallId: () => 'tool-call-1',
  withToolMessage: (...args: Parameters<typeof mockWithToolMessage>) => mockWithToolMessage(...args)
}))

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

  const createMiddleware = async () =>
    Promise.resolve(
      new SandboxFileMiddleware().createMiddleware({}, {
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

  const createTool = async (name: string) => {
    const middleware = await createMiddleware()
    const tool = middleware.tools.find((item) => item.name === name)
    if (!tool) {
      throw new Error(`Tool ${name} not found`)
    }
    return tool
  }

  const createBackend = (workingDirectory = '/workspace/user') => ({
    workingDirectory,
    read: jest.fn().mockResolvedValue('file contents'),
    glob: jest.fn().mockResolvedValue('glob results'),
    grep: jest.fn().mockResolvedValue('grep results'),
    write: jest.fn().mockImplementation(async (filePath: string) => ({ path: filePath, filesUpdate: null })),
    append: jest.fn().mockImplementation(async (filePath: string) => ({ path: filePath, filesUpdate: null })),
    edit: jest.fn().mockImplementation(async (filePath: string) => ({ path: filePath, filesUpdate: null })),
    multiEdit: jest.fn().mockImplementation(async (filePath: string) => ({ path: filePath, filesUpdate: null })),
    listDir: jest.fn().mockResolvedValue('list results')
  })

  beforeEach(() => {
    mockWithToolMessage.mockClear()
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
    const agentMiddleware = await createMiddleware()

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

  it('resolves root absolute write paths into the current workspace root and reports relative paths', async () => {
    const tool = await createTool('sandbox_write_file')
    const backend = createBackend('/workspace/user')

    const result = await tool.invoke(
      {
        file_path: '/root/report.txt',
        content: 'hello'
      },
      {
        configurable: {
          sandbox: {
            backend,
            provider: 'local-shell-sandbox'
          }
        }
      }
    )

    expect(backend.write).toHaveBeenCalledWith('/workspace/user/report.txt', 'hello')
    expect(JSON.parse(result)).toEqual({
      path: 'report.txt',
      filesUpdate: null
    })
    expect(mockWithToolMessage).toHaveBeenCalledWith(
      'tool-call-1',
      'sandbox_write_file',
      'report.txt',
      { file_path: 'report.txt' },
      expect.any(Function)
    )
  })

  it('keeps absolute paths that are already inside the current workspace and reports them relative to that root', async () => {
    const tool = await createTool('sandbox_write_file')
    const backend = createBackend('/mnt/sandbox/session/user')

    const result = await tool.invoke(
      {
        file_path: '/mnt/sandbox/session/user/docs/report.txt',
        content: 'hello'
      },
      {
        configurable: {
          sandbox: {
            backend,
            provider: 'local-shell-sandbox'
          }
        }
      }
    )

    expect(backend.write).toHaveBeenCalledWith('/mnt/sandbox/session/user/docs/report.txt', 'hello')
    expect(JSON.parse(result)).toEqual({
      path: 'docs/report.txt',
      filesUpdate: null
    })
  })

  it('preserves absolute paths for non-local sandbox providers', async () => {
    const tool = await createTool('sandbox_write_file')
    const backend = createBackend('/mnt/sandbox/session/user')

    const result = await tool.invoke(
      {
        file_path: '/root/report.txt',
        content: 'hello'
      },
      {
        configurable: {
          sandbox: {
            backend,
            provider: 'docker-sandbox'
          }
        }
      }
    )

    expect(backend.write).toHaveBeenCalledWith('/root/report.txt', 'hello')
    expect(JSON.parse(result)).toEqual({
      path: '/root/report.txt',
      filesUpdate: null
    })
    expect(mockWithToolMessage).toHaveBeenCalledWith(
      'tool-call-1',
      'sandbox_write_file',
      '/root/report.txt',
      { file_path: '/root/report.txt' },
      expect.any(Function)
    )
  })
})
