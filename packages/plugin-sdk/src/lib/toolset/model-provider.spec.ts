import type { StructuredToolInterface } from '@langchain/core/tools'
import { DefaultRuntimeCapabilityRegistry } from '../core'
import { WorkspaceFilesRuntimeCapability, type RuntimeCapabilityResolver, type WorkspaceFilesApi } from '../runtime'
import { ModelProviderBuiltinToolset } from './model-provider'
import type { TBuiltinToolsetParams, TToolModelProviderRuntime } from './builtin'

class TestModelProviderToolset extends ModelProviderBuiltinToolset<StructuredToolInterface, object> {
  constructor(runtimeCapabilities?: RuntimeCapabilityResolver, params?: TBuiltinToolsetParams) {
    super(
      {
        toolsetProviderName: 'test_toolset',
        modelProviderName: 'test_provider',
        authorizationScheme: 'Bearer',
        invalidCredentialsMessage: 'Invalid credentials.',
        missingProviderMessage: 'Configure the test provider.',
        missingWorkspaceMessage: 'Workspace files are required.'
      },
      undefined,
      runtimeCapabilities,
      params
    )
  }

  async initTools(): Promise<StructuredToolInterface[]> {
    return []
  }

  providerRuntime() {
    return this.getModelProviderRuntime()
  }

  credential(runtime: TToolModelProviderRuntime) {
    return this.getModelProviderCredential(runtime)
  }

  workspaceFiles() {
    return this.getWorkspaceFiles()
  }

  workspaceScope() {
    return this.createWorkspaceScope()
  }

  async asyncModelClient(purpose: 'invoke' | 'observe' = 'invoke') {
    return this.createAsyncModelClient('test-model', 'video', purpose)
  }
}

describe('ModelProviderBuiltinToolset', () => {
  const providerRuntime: TToolModelProviderRuntime = {
    providerScopeId: 'provider-scope-1',
    copilotId: 'copilot-1',
    provider: 'test_provider',
    authorization: 'Bearer secret',
    baseURL: 'https://example.com',
    reportUsage: jest.fn()
  }

  it('resolves and caches the configured model provider', async () => {
    const getModelProvider = jest.fn().mockResolvedValue(providerRuntime)
    const toolset = new TestModelProviderToolset(undefined, createParams({ getModelProvider }))

    await expect(toolset.providerRuntime()).resolves.toBe(providerRuntime)
    await expect(toolset.providerRuntime()).resolves.toBe(providerRuntime)
    expect(getModelProvider).toHaveBeenCalledTimes(1)
    expect(getModelProvider).toHaveBeenCalledWith('test_provider')
  })

  it('parses the configured authorization scheme', () => {
    const toolset = new TestModelProviderToolset()

    expect(toolset.credential(providerRuntime)).toBe('secret')
    expect(() => toolset.credential({ ...providerRuntime, authorization: 'ApiKey secret' })).toThrow(
      'Invalid credentials.'
    )
  })

  it('resolves workspace files from the shared runtime capability', () => {
    const workspaceFiles = {} as WorkspaceFilesApi
    const capabilities = new DefaultRuntimeCapabilityRegistry().register(
      WorkspaceFilesRuntimeCapability,
      workspaceFiles
    )
    const toolset = new TestModelProviderToolset(capabilities)

    expect(toolset.workspaceFiles()).toBe(workspaceFiles)
  })

  it('builds project and Xpert workspace scopes from runtime params', () => {
    const projectToolset = new TestModelProviderToolset(
      undefined,
      createParams({}, { projectId: ' project-1 ', tenantId: ' tenant-1 ', userId: ' user-1 ' })
    )
    expect(projectToolset.workspaceScope()).toEqual({
      tenantId: 'tenant-1',
      userId: 'user-1',
      catalog: 'projects',
      scopeId: 'project-1',
      projectId: 'project-1'
    })

    const xpertToolset = new TestModelProviderToolset(undefined, createParams({}, { xpertId: 'xpert-1' }))
    expect(xpertToolset.workspaceScope()).toEqual({
      catalog: 'xperts',
      scopeId: 'xpert-1',
      xpertId: 'xpert-1',
      isolateByUser: false
    })
  })

  it('creates invoke and observation clients with the matching runtime purpose', async () => {
    const createModelClient = jest.fn().mockResolvedValue({
      submit: jest.fn(),
      query: jest.fn()
    })
    const toolset = new TestModelProviderToolset(
      undefined,
      createParams({
        createModelClient,
        getModelProvider: jest.fn().mockResolvedValue(providerRuntime)
      })
    )

    await toolset.asyncModelClient()
    await toolset.asyncModelClient('observe')

    expect(createModelClient).toHaveBeenNthCalledWith(
      1,
      { copilotId: 'copilot-1', model: 'test-model', modelType: 'video' },
      { purpose: 'invoke' }
    )
    expect(createModelClient).toHaveBeenNthCalledWith(
      2,
      { copilotId: 'copilot-1', model: 'test-model', modelType: 'video' },
      { purpose: 'observe' }
    )
  })
})

function createParams(
  modelRuntime: Partial<NonNullable<TBuiltinToolsetParams['modelRuntime']>> = {},
  overrides: Partial<TBuiltinToolsetParams> = {}
): TBuiltinToolsetParams {
  return {
    commandBus: {} as TBuiltinToolsetParams['commandBus'],
    queryBus: {} as TBuiltinToolsetParams['queryBus'],
    modelRuntime: {
      createModelClient: jest.fn(),
      ...modelRuntime
    },
    ...overrides
  }
}
