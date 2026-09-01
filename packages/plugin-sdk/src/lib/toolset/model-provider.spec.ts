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

  it('does not use an installation-level capability as execution workspace files', () => {
    const workspaceFiles = {} as WorkspaceFilesApi
    const capabilities = new DefaultRuntimeCapabilityRegistry().register(
      WorkspaceFilesRuntimeCapability,
      workspaceFiles
    )
    const toolset = new TestModelProviderToolset(capabilities)

    expect(() => toolset.workspaceFiles()).toThrow('Workspace files are required.')
  })

  it('prefers the execution-scoped workspace capability over the installation registry', () => {
    const installationFiles = {} as WorkspaceFilesApi
    const executionFiles = {} as WorkspaceFilesApi
    const installationCapabilities = new DefaultRuntimeCapabilityRegistry().register(
      WorkspaceFilesRuntimeCapability,
      installationFiles
    )
    const executionCapabilities = new DefaultRuntimeCapabilityRegistry().register(
      WorkspaceFilesRuntimeCapability,
      executionFiles
    )
    const toolset = new TestModelProviderToolset(
      installationCapabilities,
      createParams({}, { runtimeCapabilities: executionCapabilities } as never)
    )

    expect(toolset.workspaceFiles()).toBe(executionFiles)
  })

  it('fails closed when an execution resolver does not provide host-bound workspace files', () => {
    const installationFiles = {} as WorkspaceFilesApi
    const installationCapabilities = new DefaultRuntimeCapabilityRegistry().register(
      WorkspaceFilesRuntimeCapability,
      installationFiles
    )
    const executionCapabilities = new DefaultRuntimeCapabilityRegistry()
    const toolset = new TestModelProviderToolset(
      installationCapabilities,
      createParams({}, { runtimeCapabilities: executionCapabilities } as never)
    )

    expect(() => toolset.workspaceFiles()).toThrow('Workspace files are required.')
  })

  it('fails closed when execution params omit a workspace capability resolver', () => {
    const installationFiles = {} as WorkspaceFilesApi
    const installationCapabilities = new DefaultRuntimeCapabilityRegistry().register(
      WorkspaceFilesRuntimeCapability,
      installationFiles
    )
    const toolset = new TestModelProviderToolset(installationCapabilities, createParams())

    expect(() => toolset.workspaceFiles()).toThrow('Workspace files are required.')
  })

  it('preserves the host-bound Project scope instead of rebuilding it from legacy params', () => {
    const projectToolset = new TestModelProviderToolset(
      undefined,
      createParams({}, {
        projectId: 'project-from-legacy-param',
        tenantId: 'tenant-1',
        userId: 'user-1',
        runtimeScope: {
          tenantId: ' tenant-1 ',
          organizationId: ' organization-1 ',
          userId: ' user-1 ',
          catalog: 'projects',
          scopeId: ' project-1 ',
          projectId: ' project-1 ',
          xpertId: ' xpert-1 ',
          isolateByUser: false
        }
      } as never)
    )
    expect(projectToolset.workspaceScope()).toEqual({
      tenantId: 'tenant-1',
      organizationId: 'organization-1',
      userId: 'user-1',
      catalog: 'projects',
      scopeId: 'project-1',
      projectId: 'project-1',
      xpertId: 'xpert-1',
      isolateByUser: false
    })
  })

  it.each([
    ['Project', { projectId: 'project-1' }],
    ['Xpert', { xpertId: 'xpert-1' }]
  ] as const)('fails closed when a %s execution has no host-bound runtime scope', (_label, identity) => {
    const toolset = new TestModelProviderToolset(undefined, createParams({}, identity))

    expect(() => toolset.workspaceScope()).toThrow('Workspace files are required.')
  })

  it('keeps two users on one user-scoped Xpert in distinct host-bound scopes', () => {
    const createUserToolset = (userId: string) =>
      new TestModelProviderToolset(
        undefined,
        createParams({}, {
          tenantId: 'tenant-1',
          userId,
          xpertId: 'xpert-1',
          runtimeScope: {
            tenantId: 'tenant-1',
            userId,
            catalog: 'user-xperts',
            scopeId: 'xpert-1',
            xpertId: 'xpert-1',
            isolateByUser: true
          }
        } as never)
      )

    expect(createUserToolset('user-a').workspaceScope()).toEqual({
      tenantId: 'tenant-1',
      userId: 'user-a',
      catalog: 'user-xperts',
      scopeId: 'xpert-1',
      xpertId: 'xpert-1',
      isolateByUser: true
    })
    expect(createUserToolset('user-b').workspaceScope()).toEqual({
      tenantId: 'tenant-1',
      userId: 'user-b',
      catalog: 'user-xperts',
      scopeId: 'xpert-1',
      xpertId: 'xpert-1',
      isolateByUser: true
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
