import 'reflect-metadata'
import { Test } from '@nestjs/testing'
import { Global, Module } from '@nestjs/common'
import {
  AGENT_WORKBENCH_SLOT,
  SecretTokenBindingType,
  WorkflowNodeTypeEnum,
  executionObservationQuerySchema,
  type XpertResolvedViewHostContext
} from '@xpert-ai/contracts'
import {
  DefaultRuntimeCapabilityRegistry,
  ExecutionObservabilityRuntimeCapability,
  ViewMiddlewareRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  RequestContext,
  type ExecutionObservabilityApi,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { ExecutionObservationMiddleware } from './middleware'
import { ExecutionObservationViewProvider } from './view.provider'
import { ExecutionObservabilityPlugin } from './index'
import { TOOL_NAMES, PROVIDER, FEATURE, VIEW_KEY } from './constants'
import { administratorTemplate } from './template'
import { createReadQueue } from '../remote-components/timeline/src/read-queue'
import { fromViewQuery, navigationPayload, queryKey } from '../remote-components/timeline/src/navigation'

const range = { from: '2026-10-26T02:00:00Z', to: '2026-10-26T02:45:00Z', timeZone: 'Asia/Shanghai' }
const executionId = '00000000-0000-4000-8000-000000001001'
const api: jest.Mocked<ExecutionObservabilityApi> = {
  workspaces: jest.fn(),
  conversations: jest.fn(),
  overview: jest.fn(),
  query: jest.fn(),
  summary: jest.fn(),
  get: jest.fn(),
  compare: jest.fn(),
  findAnomalies: jest.fn()
}
function middlewareContext(): IAgentMiddlewareContext {
  return {
    tenantId: 'tenant',
    organizationId: 'organization',
    userId: 'administrator',
    node: { id: 'analytics', key: 'analytics', type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: PROVIDER, options: {} },
    tools: new Map(),
    runtime: {
      capabilities: new DefaultRuntimeCapabilityRegistry().register(ExecutionObservabilityRuntimeCapability, api),
      createModelClient: async () => {
        throw Error('This read-only plugin must not create a model')
      },
      wrapWorkflowNodeExecution: async () => {
        throw Error('This read-only plugin must not start a workflow')
      }
    }
  }
}
const host: XpertResolvedViewHostContext = {
  tenantId: 'tenant',
  organizationId: 'organization',
  userId: 'administrator',
  hostType: 'agent',
  hostId: 'admin-assistant',
  slots: []
}

describe('execution observability plugin contract', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })
  it('instantiates plugin providers through explicit Nest dependencies', async () => {
    @Global()
    @Module({
      providers: [{ provide: XPERT_RUNTIME_CAPABILITIES_TOKEN, useValue: new DefaultRuntimeCapabilityRegistry() }],
      exports: [XPERT_RUNTIME_CAPABILITIES_TOKEN]
    })
    class RuntimeModule {}
    const module = await Test.createTestingModule({ imports: [RuntimeModule, ExecutionObservabilityPlugin] }).compile()
    expect(module.get(ExecutionObservationMiddleware)).toBeInstanceOf(ExecutionObservationMiddleware)
    expect(module.get(ExecutionObservationViewProvider)).toBeInstanceOf(ExecutionObservationViewProvider)
    await module.close()
  })
  it('exposes exactly five read-only tools and validates before calling the host-bound API', async () => {
    const middleware = new ExecutionObservationMiddleware().createMiddleware({}, middlewareContext())
    expect(middleware.tools?.map((tool) => tool.name)).toEqual(TOOL_NAMES)
    const query = middleware.tools?.find((tool) => tool.name === 'execution_query')
    if (!query || !('invoke' in query)) throw Error('Missing query tool')
    api.query.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, observedAt: range.to, asOf: range.to })
    const value = await query.invoke(range)
    expect(JSON.parse(String(value)).total).toBe(0)
    expect(api.query).toHaveBeenCalledWith(executionObservationQuerySchema.parse(range))
    await expect(query.invoke({ ...range, tenantId: 'foreign' })).rejects.toThrow()
    expect(api.query).toHaveBeenCalledTimes(1)
  })
  it('uses stable capability IDs across SDK copies', () => {
    const registry = new DefaultRuntimeCapabilityRegistry().register('platform.execution_observability', api)
    expect(registry.require(ExecutionObservabilityRuntimeCapability)).toBe(api)
  })
  it('hides the View from ordinary users and requires the connected feature on every read', async () => {
    jest.spyOn(RequestContext, 'hasRoles').mockReturnValue(false)
    const resolver = { resolve: jest.fn(async () => ({ options: {}, context: middlewareContext() })) }
    const provider = new ExecutionObservationViewProvider(
      new DefaultRuntimeCapabilityRegistry().register(ViewMiddlewareRuntimeCapability, resolver)
    )
    expect(provider.getViewManifests(host, AGENT_WORKBENCH_SLOT)).toEqual([])
    jest.spyOn(RequestContext, 'hasRoles').mockReturnValue(true)
    jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
    expect(provider.getViewManifests(host, AGENT_WORKBENCH_SLOT)[0].activation?.requiredFeatures).toEqual([FEATURE])
    await provider.getViewData(host, VIEW_KEY, { parameters: range })
    expect(resolver.resolve).toHaveBeenCalledWith({ context: host, provider: PROVIDER, requiredFeature: FEATURE })
    await expect(provider.getViewData(host, 'foreign-view', { parameters: range })).rejects.toThrow()
    expect(resolver.resolve).toHaveBeenCalledTimes(1)
  })
  it('keeps initial overview separate from paged details and opt-in period usage', async () => {
    const resolver = { resolve: jest.fn(async () => ({ options: {}, context: middlewareContext() })) }
    const provider = new ExecutionObservationViewProvider(
      new DefaultRuntimeCapabilityRegistry().register(ViewMiddlewareRuntimeCapability, resolver)
    )
    await provider.getViewData(host, VIEW_KEY, { parameters: range })
    expect(api.overview).toHaveBeenCalledTimes(1)
    expect(api.conversations).not.toHaveBeenCalled()
    expect(api.query).not.toHaveBeenCalled()
    expect(api.summary).not.toHaveBeenCalled()
    await provider.getViewData(host, VIEW_KEY, {
      parameters: {
        ...range,
        assistantId: executionId,
        operation: 'conversations',
        timeScale: 8,
        expandedConversations: ['a/b']
      }
    })
    expect(api.conversations).toHaveBeenCalledWith(expect.objectContaining({ assistantId: executionId }))
    expect(api.conversations.mock.calls[0][0]).not.toHaveProperty('timeScale')
    await provider.getViewData(host, VIEW_KEY, {
      page: 2,
      pageSize: 50,
      parameters: { ...range, operation: 'list', assistantId: executionId }
    })
    expect(api.query).toHaveBeenCalledWith(expect.objectContaining({ assistantId: executionId, page: 2, pageSize: 50 }))
    await provider.getViewData(host, VIEW_KEY, { parameters: { ...range, operation: 'summary' } })
    expect(api.summary).toHaveBeenCalledTimes(1)
  })
  it('bounds simultaneous expansion reads and releases a slot after rejection', async () => {
    const queued = createReadQueue(3),
      release: Array<() => void> = []
    let active = 0,
      peak = 0
    const reads = Array.from({ length: 10 }, (_, index) =>
      queued(async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise<void>((resolve) => release.push(resolve))
        active--
        if (index === 2) throw new Error('Expected read failure')
        return index
      })
    )
    const results = Promise.allSettled(reads)
    for (let index = 0; index < 10; index++) {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      release[index]()
    }
    expect(peak).toBe(3)
    expect((await results).filter((result) => result.status === 'fulfilled')).toHaveLength(9)
    expect(active).toBe(0)
  })
  it('connects the template middleware to its primary agent without granting privileges', () => {
    if (typeof administratorTemplate.dslContent !== 'string') throw Error('Template DSL missing')
    const dsl = JSON.parse(administratorTemplate.dslContent)
    expect(dsl.team.agent.key).toBe('execution-admin')
    expect(dsl.connections).toContainEqual(
      expect.objectContaining({ from: 'execution-admin', to: 'execution-analytics', type: 'workflow' })
    )
    expect(dsl.nodes.find((node: { key: string }) => node.key === 'execution-analytics').entity.provider).toBe(PROVIDER)
    expect(dsl.nodes.find((node: { key: string }) => node.key === 'execution-analytics').entity.required).toBe(true)
  })
  it('discovers the View in native ChatKit only for its own delegated Assistant', () => {
    jest.spyOn(RequestContext, 'hasRoles').mockReturnValue(true)
    const principal = {
      id: 'administrator',
      tenantId: 'tenant',
      principalType: 'client_secret' as const,
      clientSecretBindingType: SecretTokenBindingType.USER_XPERT,
      clientSecretId: 'session',
      resourceScope: { kind: 'assistant' as const, xpertId: host.hostId }
    }
    jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(principal)
    const provider = new ExecutionObservationViewProvider(new DefaultRuntimeCapabilityRegistry())
    expect(provider.getViewManifests(host, AGENT_WORKBENCH_SLOT)).toHaveLength(1)
    expect(provider.getViewManifests({ ...host, hostId: 'another-assistant' }, AGENT_WORKBENCH_SLOT)).toEqual([])
    jest
      .spyOn(RequestContext, 'currentApiPrincipal')
      .mockReturnValue({ ...principal, clientSecretBindingType: SecretTokenBindingType.PUBLIC_XPERT })
    expect(provider.getViewManifests(host, AGENT_WORKBENCH_SLOT)).toEqual([])
  })
  it('serves generated iframe assets when the local plugin loader uses TypeScript source', async () => {
    const resolver = { resolve: jest.fn(async () => ({ options: {}, context: middlewareContext() })) }
    const provider = new ExecutionObservationViewProvider(
      new DefaultRuntimeCapabilityRegistry().register(ViewMiddlewareRuntimeCapability, resolver)
    )
    const result = await provider.getRemoteComponentEntry(host, VIEW_KEY)
    expect(result.contentType).toBe('text/html; charset=utf-8')
    expect(result.html).toContain('Execution overview')
    expect(result.html).toContain('<style>')
  })
  it('keeps organization observation separate from cross-Assistant conversation navigation', async () => {
    const resolver = { resolve: jest.fn(async () => ({ options: {}, context: middlewareContext() })) }
    const provider = new ExecutionObservationViewProvider(
      new DefaultRuntimeCapabilityRegistry().register(ViewMiddlewareRuntimeCapability, resolver)
    )
    const detail = {
      item: { id: executionId, assistantId: 'another-assistant', conversationId: executionId },
      children: []
    } as unknown as Awaited<ReturnType<ExecutionObservabilityApi['get']>>
    api.get.mockResolvedValue(detail)
    expect(await provider.getViewData(host, VIEW_KEY, { selectionId: executionId })).toMatchObject({
      canOpenConversation: false
    })
    expect(
      await provider.executeViewAction(host, VIEW_KEY, 'execution-target', { input: { executionId } })
    ).toMatchObject({ success: false })
    api.get.mockResolvedValue({ ...detail, item: { ...detail.item, assistantId: host.hostId } })
    expect(await provider.getViewData(host, VIEW_KEY, { selectionId: executionId })).toMatchObject({
      canOpenConversation: true
    })
    expect(
      await provider.executeViewAction(host, VIEW_KEY, 'execution-target', { input: { executionId } })
    ).toMatchObject({ success: true, data: { target: 'assistant.conversation', xpertId: host.hostId } })
  })
})

describe('complete public View navigation state', () => {
  it('restores filters, selection, expansion, pagination and paused mode', () => {
    const state = fromViewQuery({
      selectionId: executionId,
      parameters: {
        ...range,
        page: 3,
        viewMode: 'list',
        expanded: ['assistant-a'],
        expandedConversations: ['assistant-a/conversation:b'],
        timeScale: 8,
        following: false
      }
    })
    const payload = navigationPayload('canonical-view', state)
    expect(payload).toMatchObject({
      viewKey: 'canonical-view',
      selectionId: executionId,
      parameters: {
        ...range,
        page: 3,
        viewMode: 'list',
        expanded: ['assistant-a'],
        expandedConversations: ['assistant-a/conversation:b'],
        timeScale: 8,
        following: false
      }
    })
    expect(fromViewQuery({ selectionId: payload.selectionId, parameters: payload.parameters })).toEqual(state)
  })
  it('does not include UI-only state in the business-data key, nor undefined filters in navigation', () => {
    const state = fromViewQuery({ parameters: range })
    const next = { ...state, expanded: ['a'], mode: 'list' as const, query: { ...state.query, search: undefined } }
    expect(queryKey(state.query)).toBe(queryKey(next.query))
    expect(navigationPayload('timeline', next).parameters).not.toHaveProperty('search')
  })
  it('recovers malformed navigation with bounded defaults and no foreign scope', () => {
    const state = fromViewQuery(
      {
        selectionId: 'not-a-uuid',
        parameters: { from: 'invalid', to: 'invalid', expanded: 'invalid', tenantId: 'foreign' }
      },
      new Date(range.to)
    )
    expect(state.timeScale).toBe(1)
    expect(state.expandedConversations).toEqual([])
    expect(state.selected).toBeNull()
    expect(state.expanded).toEqual([])
    expect(Date.parse(state.query.to) - Date.parse(state.query.from)).toBe(3600000)
    expect(state.query).not.toHaveProperty('tenantId')
  })
})
