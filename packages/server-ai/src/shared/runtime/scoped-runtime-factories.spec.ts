import 'reflect-metadata'
import { ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import {
    ActorTokenRuntimeCapability,
    ActorTokenRuntimeFactoryCapability,
    ConnectorRuntimeCapability,
    ConnectorRuntimeFactoryCapability,
    DefaultRuntimeCapabilityRegistry,
    KnowledgeDocumentVisualAssetsRuntimeCapability,
    KnowledgeDocumentVisualAssetsRuntimeFactoryCapability,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { ConnectorService } from '../../connector/connector.service'
import { KnowledgeDocumentVisualAssetsRuntimeService } from '../../knowledge-document/visual-assets-runtime.service'
import { ActorTokenRuntimeService } from '../../actor-token/actor-token-runtime.service'
import { RuntimeCapabilityProviderExplorer } from './runtime-capability-provider-explorer.service'

function fixture() {
    const mint = jest.fn(() => ({
        token: 'test-token',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        audience: 'test'
    }))
    const actor = new ActorTokenRuntimeService({ mint } as never)
    const connector = new ConnectorService({} as never, {} as never, {} as never, {} as never)
    const visuals = new KnowledgeDocumentVisualAssetsRuntimeService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never
    )
    const registry = new DefaultRuntimeCapabilityRegistry()
    new RuntimeCapabilityProviderExplorer(
        { getProviders: () => [actor, connector, visuals].map((instance) => ({ instance })) } as never,
        new Reflector(),
        registry
    ).onModuleInit()
    return { registry, actor, connector, visuals, mint }
}

describe('platform scoped runtime factories without an Agent facade', () => {
    afterEach(() => jest.restoreAllMocks())

    it('discovers the real domain factories and does not globally share bound operation APIs', () => {
        const f = fixture()
        expect(f.registry.require(ActorTokenRuntimeFactoryCapability)).toBe(f.actor)
        expect(f.registry.require(ConnectorRuntimeFactoryCapability)).toBe(f.connector)
        expect(f.registry.require(KnowledgeDocumentVisualAssetsRuntimeFactoryCapability)).toBe(f.visuals)
        expect(f.registry.has(ActorTokenRuntimeCapability)).toBe(false)
        expect(f.registry.has(ConnectorRuntimeCapability)).toBe(false)
        expect(f.registry.has(KnowledgeDocumentVisualAssetsRuntimeCapability)).toBe(false)
    })

    it('does not grant a connector appended to a previously bound allow-list', async () => {
        const f = fixture()
        const scope = { connectorBindingIds: ['binding-1'] }
        const api = f.registry.require(ConnectorRuntimeFactoryCapability).createScopedApi(scope)
        scope.connectorBindingIds.push('binding-2')
        await expect(api.getConnectorCredential?.({ bindingId: 'binding-2' })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        const empty = f.connector.createScopedApi({})
        await expect(empty.getConnectorCredential?.({ bindingId: 'binding-1' })).rejects.toBeInstanceOf(
            ForbiddenException
        )
    })

    it('snapshots execution identity for each connector API', async () => {
        const f = fixture()
        const resolve = jest.spyOn(f.connector, 'getRuntimeConnectorCredentialForScope').mockResolvedValue({} as never)
        const scope = { executionId: 'execution-1', connectorBindingIds: ['binding-1'] }
        const first = f.connector.createScopedApi(scope)
        scope.executionId = 'execution-2'
        const second = f.connector.createScopedApi(scope)
        await Promise.all([
            first.getConnectorCredential?.({ bindingId: 'binding-1' }),
            second.getConnectorCredential?.({ bindingId: 'binding-1' })
        ])
        expect(resolve).toHaveBeenNthCalledWith(
            1,
            { bindingId: 'binding-1' },
            expect.objectContaining({ executionId: 'execution-1' })
        )
        expect(resolve).toHaveBeenNthCalledWith(
            2,
            { bindingId: 'binding-1' },
            expect.objectContaining({ executionId: 'execution-2' })
        )
    })

    it('creates fresh visual APIs for a platform caller and rejects missing execution identity', async () => {
        const f = fixture()
        const factory = f.registry.require(KnowledgeDocumentVisualAssetsRuntimeFactoryCapability)
        const first = factory.createScopedApi({}, { workspaceFiles: {} as never })
        const second = factory.createScopedApi({}, { workspaceFiles: {} as never })
        expect(first).not.toBe(second)
        await expect(first.prepareImages({ filePaths: ['unissued-image'] })).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('creates a platform token API with a distinct cache for each caller operation', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const f = fixture()
        const factory = f.registry.require(ActorTokenRuntimeFactoryCapability)
        const first = factory.createScopedApi({ executionId: 'operation-1', act: { sub: 'background-task' } })
        const second = factory.createScopedApi({ executionId: 'operation-2', act: { sub: 'background-task' } })
        await Promise.all([first.getToken(), first.getToken(), second.getToken()])
        expect(f.mint).toHaveBeenCalledTimes(2)
        expect(f.mint).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                act: expect.objectContaining({ sub: 'background-task', execution_id: 'operation-1' })
            })
        )
        expect(f.mint).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ act: expect.objectContaining({ execution_id: 'operation-2' }) })
        )
    })
})
