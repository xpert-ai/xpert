jest.mock('i18next', () => ({ t: (key: string) => key }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: {
        currentTenantId: () => 'tenant',
        getOrganizationId: () => 'org',
        currentUserId: () => 'user'
    }
}))
jest.mock('../assistant-binding.entity', () => ({ AssistantBinding: class {} }))
jest.mock('../../chat-conversation/conversation.entity', () => ({ ChatConversation: class {} }))
jest.mock('../../xpert/xpert.entity', () => ({ Xpert: class {} }))
jest.mock('../../connector/connector.service', () => ({ ConnectorService: class {} }))
jest.mock('../../agent-plugin/runtime-resource.service', () => ({ RuntimeResourceService: class {} }))
import { BosiConversationInitializer } from './bosi-conversation.initializer'
import { AssistantBinding } from '../assistant-binding.entity'
import { ConnectorService } from '../../connector/connector.service'
import type { ChatConversation } from '../../chat-conversation/conversation.entity'
const workspaceId = '00000000-0000-4000-8000-000000000001'
const resource = { bindingId: '00000000-0000-4000-8000-000000000002', version: 'a'.repeat(64) }
const connectorId = '00000000-0000-4000-8000-000000000003'
function fixture() {
    const conversation = {
        id: 'conversation',
        tenantId: 'tenant',
        organizationId: 'org',
        createdById: 'user',
        xpertId: 'assistant',
        options: {}
    } as ChatConversation
    const binding = {
        desktopOnboarding: {
            version: 1,
            revision: 2,
            workspaceId,
            packages: [{ packageId: resource.bindingId, resource }],
            connectorIds: [connectorId]
        }
    }
    const find = jest.fn(async () => binding)
    const resolve = jest.fn()
    const runtimeOptions = jest.fn(async () => ({
        items: [
            {
                bindingId: connectorId,
                authorizationMode: 'shared',
                status: 'active',
                granted: true,
                runtimeUsage: 'middleware'
            }
        ]
    }))
    const save = jest.fn()
    const database = {
        getRepository: (entity) => ({
            findOneBy: entity === AssistantBinding ? find : jest.fn(async () => ({ workspaceId }))
        }),
        transaction: (callback) => callback({ findOneOrFail: jest.fn(async () => conversation), save })
    }
    const service = new BosiConversationInitializer(
        database as never,
        { get: (token) => (token === ConnectorService ? { runtimeOptions } : { resolve }) } as never
    )
    return { service, conversation, binding, find, resolve, runtimeOptions, save }
}
describe('personal Bosi conversation defaults', () => {
    it('applies pinned resources and authorized connectors once, preserving normal Assistant capabilities', async () => {
        const f = fixture()
        await f.service.initialize(f.conversation)
        expect(f.resolve).toHaveBeenCalledWith('assistant', { revision: 0, resources: [resource] })
        expect(f.conversation.options).toMatchObject({
            bosiDefaultsApplied: true,
            runtimeResources: { revision: 0, resources: [resource] },
            runtimeCapabilities: {
                mode: 'allowlist',
                inheritUnselected: true,
                connectors: { bindingIds: [connectorId] }
            }
        })
        await f.service.initialize(f.conversation)
        expect(f.save).toHaveBeenCalledTimes(1)
    })
    it('does not overwrite explicitly empty selections or other conversation options', async () => {
        const f = fixture()
        f.conversation.options = {
            runtimeResources: { revision: 4, resources: [] },
            runtimeCapabilities: {
                mode: 'allowlist',
                skills: { ids: [] },
                plugins: { nodeKeys: [] },
                connectors: { bindingIds: [] }
            },
            sandboxEnvironmentId: 'environment'
        }
        await f.service.initialize(f.conversation)
        expect(f.conversation.options.runtimeResources).toEqual({ revision: 4, resources: [] })
        expect(f.conversation.options.runtimeCapabilities.connectors.bindingIds).toEqual([])
        expect(f.conversation.options.sandboxEnvironmentId).toBe('environment')
        expect(f.resolve).not.toHaveBeenCalled()
        expect(f.runtimeOptions).not.toHaveBeenCalled()
    })
    it('honors the existing persisted marker after reload and keeps later user choices', async () => {
        const f = fixture()
        await f.service.initialize(f.conversation)
        const restored = structuredClone(f.conversation)
        restored.options.runtimeResources = { revision: 1, resources: [] }
        delete restored.options.runtimeCapabilities
        await f.service.initialize(restored)
        expect(restored.options.bosiDefaultsApplied).toBe(true)
        expect(restored.options.runtimeResources.resources).toEqual([])
        expect(restored.options.runtimeCapabilities).toBeUndefined()
        expect(f.save).toHaveBeenCalledTimes(1)
        expect(f.resolve).toHaveBeenCalledTimes(1)
    })
    it('does not grant access to expired or credential-only connectors', async () => {
        for (const item of [
            { status: 'expired', runtimeUsage: 'middleware' },
            { status: 'active', runtimeUsage: 'credential' }
        ]) {
            const f = fixture()
            f.runtimeOptions.mockResolvedValue({
                items: [{ bindingId: connectorId, authorizationMode: 'shared', granted: true, ...item }]
            })
            await f.service.initialize(f.conversation)
            expect(f.conversation.options.runtimeCapabilities).toBeUndefined()
        }
    })
    it('never applies another user or organization defaults, or changes legacy Assistants', async () => {
        for (const patch of [
            { createdById: 'other' },
            { organizationId: 'other' },
            { tenantId: 'other' },
            { projectId: 'project' }
        ]) {
            const f = fixture()
            Object.assign(f.conversation, patch)
            await f.service.initialize(f.conversation)
            expect(f.find).not.toHaveBeenCalled()
        }
        const f = fixture()
        f.find.mockResolvedValue({ desktopOnboarding: null })
        await f.service.initialize(f.conversation)
        expect(f.save).not.toHaveBeenCalled()
    })
})
