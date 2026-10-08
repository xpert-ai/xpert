import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import {
    ActorTokenRuntimeFactoryCapability,
    ConnectorRuntimeFactoryCapability,
    DefaultRuntimeCapabilityRegistry,
    KnowledgeDocumentVisualAssetsRuntimeFactoryCapability,
    ToolImagesRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareRuntimeService } from './middleware-runtime.service'

function fixture() {
    const platform = new DefaultRuntimeCapabilityRegistry()
    platform.register(ActorTokenRuntimeFactoryCapability, { createScopedApi: () => ({ getToken: jest.fn() }) })
    platform.register(ConnectorRuntimeFactoryCapability, {
        createScopedApi: () => ({ getConnector: jest.fn() }),
        resolveSelectedRuntimeBindings: jest.fn()
    })
    platform.register(KnowledgeDocumentVisualAssetsRuntimeFactoryCapability, {
        createScopedApi: () => ({
            issueCandidates: jest.fn(),
            prepareImages: jest.fn(),
            consumeImageBatch: jest.fn(),
            discardImageBatch: jest.fn()
        })
    })
    const files = { createScopedApi: jest.fn(() => ({ readRuntimeBuffer: jest.fn(), writeRuntimeBuffer: jest.fn() })) }
    const artifacts = { createScopedApi: jest.fn(() => ({})) }
    const runtime = Reflect.construct(AgentMiddlewareRuntimeService, [
        {},
        { createScopedApi: () => ({}) },
        files,
        artifacts,
        { createScopedApi: () => ({}) },
        platform
    ]) as AgentMiddlewareRuntimeService
    return { runtime, files, artifacts }
}

describe('middleware tool image capability composition', () => {
    afterEach(() => jest.restoreAllMocks())
    it('does not expose storage capability without a host-bound workspace owner', () => {
        const f = fixture()
        expect(f.runtime.createScopedApi().capabilities?.has(ToolImagesRuntimeCapability)).toBe(false)
    })
    it('resolves child conversation identity lazily and rebuilds workspace/artifact scopes for every invocation', async () => {
        const f = fixture()
        const config = jest.spyOn(AsyncLocalStorageProviderSingleton, 'getRunnableConfig')
        config.mockReturnValue(undefined)
        const scope = {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            projectId: 'project',
            xpertId: 'assistant',
            conversationId: 'parent'
        }
        const api = f.runtime.createScopedApi(scope).capabilities!.require(ToolImagesRuntimeCapability)
        config.mockReturnValue({
            configurable: { conversationId: 'child', executionId: 'child-execution', xpertId: 'child-assistant' }
        })
        expect(await api.prepareModelInput([], ['view_image'])).toEqual({ messages: [] })
        expect(f.files.createScopedApi).toHaveBeenLastCalledWith(
            expect.objectContaining({
                ...scope,
                conversationId: 'child',
                executionId: 'child-execution',
                xpertId: 'child-assistant'
            })
        )
        expect(f.artifacts.createScopedApi).toHaveBeenLastCalledWith(
            expect.objectContaining({ conversationId: 'child', projectId: 'project' })
        )
        config.mockReturnValue({ configurable: { conversation_id: 'second-child', executionId: 'second-execution' } })
        await api.prepareModelInput([], ['view_image'])
        expect(f.files.createScopedApi).toHaveBeenLastCalledWith(
            expect.objectContaining({ conversationId: 'second-child', executionId: 'second-execution' })
        )
    })
    it('does not silently succeed when no execution conversation can be resolved', async () => {
        const f = fixture()
        jest.spyOn(AsyncLocalStorageProviderSingleton, 'getRunnableConfig').mockReturnValue(undefined)
        const api = f.runtime
            .createScopedApi({ projectId: 'project', tenantId: 'tenant', organizationId: 'org', userId: 'user' })
            .capabilities!.require(ToolImagesRuntimeCapability)
        await expect(api.prepareModelInput([], ['view_image'])).rejects.toThrow()
    })
})
