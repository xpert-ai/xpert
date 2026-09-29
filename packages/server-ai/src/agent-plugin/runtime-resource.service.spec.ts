import { ModuleRef } from '@nestjs/core'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { ForbiddenException } from '@nestjs/common'
import { ApiKeyBindingType, SecretTokenBindingType } from '@xpert-ai/contracts'
import { AgentPluginService } from './agent-plugin.service'
import { RuntimeResourceService } from './runtime-resource.service'
import { ChatConversationService } from '../chat-conversation/conversation.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import type { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { ViewExtensionService } from '@xpert-ai/server-core'

jest.mock('./agent-plugin.service', () => ({
    AgentPluginService: class {},
    resourceScope: () => ({ tenantId: 'tenant', organizationId: 'org' })
}))
jest.mock('../chat-conversation/conversation.service', () => ({ ChatConversationService: class {} }))
jest.mock('../chat-conversation/conversation.entity', () => ({ ChatConversation: class {} }))
jest.mock('../xpert/published-xpert-access.service', () => ({ PublishedXpertAccessService: class {} }))
jest.mock('../xpert-project/services/project-access.service', () => ({ XpertProjectAccessService: class {} }))
jest.mock('../mcp-consumer/auth/mcp-consumer-oauth.service', () => ({ McpConsumerOAuthService: class {} }))
// These tests exercise catalog, selection and execution authorization, not MCP schema conversion.
jest.mock('./agent-plugin-mcp', () => ({ matchesPortableMcpSchema: jest.fn(() => true) }))

const ref = { bindingId: 'aaabbbbb-cccc-4ddd-8eee-ffffffffffff', version: 'a'.repeat(64) }
const selection = { revision: 0, resources: [ref] }

describe('runtime resource authorization and persistence', () => {
    const binding = {
        ...ref,
        id: ref.bindingId,
        enabled: true,
        workspaceIds: ['workspace'],
        definition: { kind: 'middleware', provider: 'audit', options: {} }
    }
    const assistant = { id: 'assistant', workspaceId: 'workspace' }
    let service: RuntimeResourceService
    let find: jest.Mock
    let conversation: {
        id: string
        xpertId: string
        projectId: string
        options: { runtimeResources?: typeof selection; other: boolean }
    }
    let save: jest.Mock
    let projectAccess: jest.Mock
    let publishedExpert: jest.Mock
    let publishedExperts: jest.Mock
    let bindings: jest.Mock
    let middlewareStrategies: Array<{ meta: TAgentMiddlewareMeta }>
    let providerVersion: string
    let viewSummaries: jest.Mock
    beforeEach(() => {
        find = jest.fn().mockResolvedValue(binding)
        save = jest.fn()
        projectAccess = jest.fn()
        publishedExpert = jest.fn().mockResolvedValue({ id: 'expert', publishAt: new Date('2026-09-21T00:00:00.000Z') })
        publishedExperts = jest.fn().mockResolvedValue([])
        bindings = jest.fn().mockResolvedValue([])
        middlewareStrategies = []
        providerVersion = '1'
        viewSummaries = jest.fn().mockResolvedValue([])
        conversation = { id: 'conversation', xpertId: 'assistant', projectId: 'project', options: { other: true } }
        const manager = { findOneOrFail: jest.fn(async () => conversation), save }
        const conversations = {
            assertAccess: jest.fn(async () => conversation),
            repository: { manager: { transaction: async (fn: (manager: object) => Promise<unknown>) => fn(manager) } }
        }
        const dependencies = new Map<unknown, unknown>([
            [ViewExtensionService, { listFeatureViewSummaries: viewSummaries }],
            [ChatConversationService, conversations],
            [
                PublishedXpertAccessService,
                {
                    getAccessiblePublishedXpert: jest.fn(async () => assistant),
                    getAccessiblePublishedResource: publishedExpert,
                    findAccessiblePublishedResources: publishedExperts
                }
            ],
            [XpertProjectAccessService, { assertCanUseXpert: projectAccess }],
            [
                AgentMiddlewareRegistry,
                {
                    get: jest.fn(() => ({})),
                    list: jest.fn(() => middlewareStrategies),
                    getSource: () => ({ kind: 'plugin', pluginName: 'test', pluginVersion: providerVersion })
                }
            ]
        ])
        service = new RuntimeResourceService(
            {
                validateMiddleware: jest.fn(),
                bindings: { findOneBy: find, find: bindings }
            } as unknown as AgentPluginService,
            { get: (type: unknown) => dependencies.get(type) } as ModuleRef
        )
    })
    afterEach(() => jest.restoreAllMocks())

    it.each(['api_key', 'client_secret'] as const)(
        'rejects another Assistant for %s resource requests',
        async (principalType) => {
            jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
                principalType,
                clientSecretBindingType: SecretTokenBindingType.API_KEY,
                apiKey: { token: 'test-only', type: ApiKeyBindingType.ASSISTANT, entityId: 'other-assistant' }
            })
            await expect(service.catalog('assistant', {})).rejects.toBeInstanceOf(ForbiddenException)
            await expect(service.resolve('assistant', selection)).rejects.toBeInstanceOf(ForbiddenException)
            await expect(service.authorize('assistant', { ...ref, serverName: 'notion' })).rejects.toBeInstanceOf(
                ForbiddenException
            )
            await expect(service.read('conversation')).rejects.toBeInstanceOf(ForbiddenException)
            await expect(service.update('conversation', selection)).rejects.toBeInstanceOf(ForbiddenException)
            await expect(service.prepare('conversation', undefined, false)).rejects.toBeInstanceOf(ForbiddenException)
            expect(bindings).not.toHaveBeenCalled()
            expect(find).not.toHaveBeenCalled()
            expect(save).not.toHaveBeenCalled()
        }
    )

    it('allows the bound Assistant and its separately authorized expert resources', async () => {
        jest.spyOn(RequestContext, 'currentApiKey').mockReturnValue({
            token: 'test-only',
            type: ApiKeyBindingType.ASSISTANT,
            entityId: 'assistant'
        })
        find.mockResolvedValue({
            ...binding,
            definition: { kind: 'external_xpert', xpertId: 'expert' },
            expertVersions: { expert: '2026-09-21T00:00:00.000Z' }
        })
        expect((await service.resolve('assistant', selection)).experts).toHaveLength(1)
        expect(publishedExpert).toHaveBeenCalledWith('expert', 'assistant')
        await expect(service.read('conversation')).resolves.toEqual({ revision: 0, resources: [] })
    })
    it('looks up bindings within the actor organization and exact immutable version', async () => {
        await service.resolve('assistant', selection, 'project')
        expect(find).toHaveBeenCalledWith({
            tenantId: 'tenant',
            organizationId: 'org',
            id: ref.bindingId,
            version: ref.version,
            enabled: true
        })
        expect(projectAccess).toHaveBeenCalledWith('project', 'assistant')
    })
    it('blocks legacy user OAuth resources until a workspace Connector is configured', async () => {
        find.mockResolvedValue({
            ...binding,
            definition: { kind: 'agent_plugin', packageId: 'legacy', oauthServers: ['notion'] }
        })
        await expect(service.resolve('assistant', selection)).rejects.toThrow()
        await expect(service.authorize('assistant', { ...ref, serverName: 'notion' })).rejects.toThrow()
    })
    it('denies forged, revoked and unassigned resource references', async () => {
        find.mockResolvedValueOnce(null)
        await expect(service.resolve('assistant', selection)).rejects.toThrow()
        find.mockResolvedValueOnce({ ...binding, workspaceIds: ['elsewhere'] })
        await expect(service.resolve('assistant', selection)).rejects.toThrow()
        await service.resolve('assistant', selection)
        find.mockResolvedValueOnce(null)
        await expect(service.resolve('assistant', selection)).rejects.toThrow()
    })
    it('updates the whole selection with a revision and preserves unrelated preferences', async () => {
        const updated = await service.update('conversation', selection)
        expect(updated).toEqual({ ...selection, revision: 1 })
        expect(conversation.options.other).toBe(true)
        expect(save).toHaveBeenCalledTimes(1)
        await expect(service.update('conversation', selection)).rejects.toThrow()
        expect(save).toHaveBeenCalledTimes(1)
    })
    it('uses the saved execution snapshot on resume without overwriting a newer conversation selection', async () => {
        conversation.options.runtimeResources = { revision: 3, resources: [] }
        const resolved = await service.prepare('conversation', selection, true)
        expect(resolved.selection).toEqual(selection)
        expect(conversation.options.runtimeResources).toEqual({ revision: 3, resources: [] })
        expect(save).not.toHaveBeenCalled()
    })
    it('rejects stale sends and duplicate or malformed binding references', async () => {
        conversation.options.runtimeResources = { revision: 3, resources: [] }
        await expect(service.prepare('conversation', selection, false)).rejects.toThrow()
        await expect(service.resolve('assistant', { ...selection, resources: [ref, ref] })).rejects.toThrow()
        await expect(
            service.resolve('assistant', { ...selection, resources: [{ ...ref, version: 'latest' }] })
        ).rejects.toThrow()
    })
    it('accepts a committed selection after JSON storage reorders object keys', async () => {
        conversation.options.runtimeResources = {
            resources: [{ version: ref.version, bindingId: ref.bindingId }],
            revision: 1
        }
        const committed = { revision: 1, resources: [ref] }
        const resolved = await service.prepare('conversation', committed, false)
        expect(resolved.selection).toEqual(committed)
        expect(save).not.toHaveBeenCalled()
    })
    it('still rejects a changed binding or version when the revision is unchanged', async () => {
        conversation.options.runtimeResources = { ...selection, revision: 1 }
        for (const changed of [
            { ...ref, version: 'b'.repeat(64) },
            { ...ref, bindingId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' }
        ]) {
            await expect(
                service.prepare('conversation', { revision: 1, resources: [changed] }, false)
            ).rejects.toThrow()
        }
        expect(save).not.toHaveBeenCalled()
    })
    it('pins the publication revision even when an expert is republished under the same ID', async () => {
        find.mockResolvedValue({
            ...binding,
            definition: { kind: 'external_xpert', xpertId: 'expert' },
            expertVersions: { expert: '2026-09-21T00:00:00.000Z' }
        })
        const resolved = await service.resolve('assistant', selection)
        expect(resolved.experts).toHaveLength(1)
        expect(publishedExpert).toHaveBeenCalledWith('expert', 'assistant')
        publishedExpert.mockResolvedValue({ id: 'expert', publishAt: new Date('2026-09-21T01:00:00.000Z') })
        await expect(service.resolve('assistant', selection)).rejects.toThrow()
    })
    it('allows removing a revoked resource and retains the removal revision on the next send', async () => {
        conversation.options.runtimeResources = { revision: 4, resources: [ref] }
        find.mockResolvedValue(null)
        const removed = await service.update('conversation', { revision: 4, resources: [] })
        const next = await service.prepare('conversation', removed, false)
        expect(next.selection).toEqual({ revision: 5, resources: [] })
    })

    it('lists and executes unregistered experts, then rejects revoked access and stale publication snapshots', async () => {
        const expert = {
            id: 'expert',
            name: 'Discovered expert',
            agent: { key: 'entry' },
            publishAt: new Date('2026-09-21T00:00:00.000Z')
        }
        publishedExperts.mockResolvedValue([expert])
        publishedExpert.mockResolvedValue(expert)
        find.mockResolvedValue(null)
        const catalog = await service.catalog('assistant', { kind: 'external_xpert', projectId: 'project' })
        expect(catalog.items).toHaveLength(1)
        expect(catalog.items[0].title).toBe(expert.name)
        expect(publishedExperts).toHaveBeenCalledWith('assistant', { where: { type: 'agent' }, relations: ['agent'] })
        const { bindingId, version } = catalog.items[0]
        const selected = { revision: 0, resources: [{ bindingId, version }] }
        expect((await service.resolve('assistant', selected, 'project')).experts).toEqual([expert])
        publishedExpert.mockRejectedValueOnce(new Error('access revoked'))
        await expect(service.resolve('assistant', selected)).rejects.toThrow('access revoked')
        publishedExperts.mockResolvedValue([{ ...expert, publishAt: new Date('2026-09-22T00:00:00.000Z') }])
        await expect(service.resolve('assistant', selected)).rejects.toThrow()
        publishedExperts.mockResolvedValue([])
        await expect(service.resolve('assistant', selected)).rejects.toThrow()
    })

    it('paginates and searches the combined managed and discovered catalog', async () => {
        bindings.mockResolvedValue([{ ...binding, title: 'A preset' }])
        publishedExperts.mockResolvedValue([
            { id: 'one', name: 'B expert', agent: {}, publishAt: new Date() },
            { id: 'two', name: 'C expert', agent: {}, publishAt: new Date() }
        ])
        const page = await service.catalog('assistant', { offset: 1, limit: 1 })
        expect(page.total).toBe(3)
        expect(page.items.map((item) => item.title)).toEqual(['B expert'])
        const search = await service.catalog('assistant', { kind: 'external_xpert', search: 'C expert' })
        expect(search.total).toBe(1)
        expect(search.items[0].title).toBe('C expert')
    })

    it('includes managed resource avatars and only the views bound to middleware features', async () => {
        const avatar = { emoji: { id: 'rocket', unified: '1f680' } }
        const icon = { type: 'svg' as const, value: '<svg></svg>' }
        const expertBinding = {
            ...binding,
            id: 'baabbbbb-cccc-4ddd-8eee-ffffffffffff',
            title: 'Expert',
            definition: { kind: 'external_xpert', xpertId: 'expert' },
            expertVersions: { expert: '2026-09-21T00:00:00.000Z' }
        }
        bindings.mockResolvedValue([{ ...binding, title: 'Audit' }, expertBinding])
        find.mockImplementation(async ({ id }: { id: string }) => (id === expertBinding.id ? expertBinding : binding))
        publishedExpert.mockResolvedValue({ id: 'expert', publishAt: new Date('2026-09-21T00:00:00.000Z'), avatar })
        middlewareStrategies = [{ meta: { name: 'audit', label: { en_US: 'Audit' }, icon, features: ['audit'] } }]
        const view = { key: 'audit__runs', title: 'Audit runs', requiredFeatures: ['audit'] }
        viewSummaries.mockResolvedValue([view, { key: 'other', title: 'Other', requiredFeatures: ['other'] }])
        const catalog = await service.catalog('assistant', { projectId: 'project' })
        expect(catalog.items.find((item) => item.kind === 'external_xpert')?.avatar).toEqual(avatar)
        expect(catalog.items.find((item) => item.kind === 'middleware')).toMatchObject({
            iconDefinition: icon,
            views: [view]
        })
        expect(viewSummaries).toHaveBeenCalledWith('agent', 'assistant', ['audit'], {
            runtimeScope: { projectId: 'project' }
        })
    })

    it('assembles default middleware without registration and rejects a removed or upgraded provider', async () => {
        middlewareStrategies = [
            {
                meta: {
                    name: 'retry',
                    label: { en_US: 'Retry' },
                    configSchema: {
                        type: 'object',
                        properties: { retries: { type: 'number', default: 3 } },
                        required: ['retries']
                    }
                }
            }
        ]
        find.mockResolvedValue(null)
        const catalog = await service.catalog('assistant', { kind: 'middleware' })
        expect(catalog.items).toHaveLength(1)
        expect(publishedExperts).not.toHaveBeenCalled()
        const { bindingId, version } = catalog.items[0]
        const selected = { revision: 0, resources: [{ bindingId, version }] }
        const resolved = await service.resolve('assistant', selected)
        expect(resolved.middlewares[0].entity).toMatchObject({ provider: 'retry', options: { retries: 3 } })
        expect(resolved.selection).toEqual(selected)
        providerVersion = '2'
        await expect(service.resolve('assistant', selected)).rejects.toThrow()
        middlewareStrategies = []
        await expect(service.resolve('assistant', selected)).rejects.toThrow()
    })
})
