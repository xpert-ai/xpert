jest.mock('i18next', () => ({ t: (key: string) => key }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: { getLanguageCode: () => 'en-US' },
    getConnectorAuthorizationModes: (definition) => definition.authorizationModes ?? ['shared']
}))
jest.mock('../assistant-binding.entity', () => ({ AssistantBinding: class {} }))
jest.mock('../../xpert-workspace/workspace.service', () => ({ XpertWorkspaceService: class {} }))
jest.mock('../../agent-plugin/agent-plugin.service', () => ({ AgentPluginService: class {} }))
jest.mock('../../connector/connector.service', () => ({ ConnectorService: class {} }))
import { ConflictException, ForbiddenException } from '@nestjs/common'
import { BosiOnboardingService } from './bosi-onboarding.service'
import { EnsurePersonalDefaultWorkspaceCommand } from '../../xpert-workspace/commands/ensure-personal-default-workspace.command'
import type { AssistantBinding } from '../assistant-binding.entity'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const packageId = '00000000-0000-4000-8000-000000000002'
const resourceId = '00000000-0000-4000-8000-000000000003'
const connectorId = '00000000-0000-4000-8000-000000000004'
function fixture() {
    const binding = { id: 'binding', tenantId: 'tenant', organizationId: 'org', userId: 'user' } as AssistantBinding
    const workspace = {
        id: workspaceId,
        name: 'Bosi',
        tenantId: 'tenant',
        organizationId: 'org',
        ownerId: 'user',
        members: [],
        settings: { access: { visibility: 'private' } }
    }
    const workspaces = {
        findOne: jest.fn(async () => workspace)
    }
    const commands = { execute: jest.fn(async () => workspace) }
    const update = jest.fn()
    const pkg = { id: packageId, descriptor: { diagnostics: [], extension: {} } }
    const resource = {
        id: resourceId,
        enabled: true,
        version: 'a'.repeat(64),
        workspaceIds: [workspaceId],
        definition: { kind: 'agent_plugin', packageId },
        installations: {}
    }
    const plugins = {
        workspaceCatalog: jest.fn(async () => ({
            items: [{ id: packageId, name: 'Documents', status: 'not_published', expertReferences: [] }]
        })),
        packages: { find: jest.fn(async () => [pkg]), findOneByOrFail: jest.fn(async () => pkg) },
        bindings: { find: jest.fn(async () => []), findOneByOrFail: jest.fn(async () => resource) },
        addToWorkspace: jest.fn(async () => {
            plugins.bindings.find.mockResolvedValue([resource])
            return { bindingId: resourceId }
        })
    }
    const connections = []
    const connectors = {
        definitionsForScope: jest.fn(async () => [{ provider: 'mail', label: 'Mail', runtimeUsage: 'middleware' }]),
        listBindings: jest.fn(async () => connections),
        createBinding: jest.fn(async ({ provider, scope }) => {
            const result = { id: connectorId, provider, scope, authorizationMode: 'shared', status: 'disconnected' }
            connections.push(result)
            return result
        })
    }
    const service = new BosiOnboardingService(
        { getRepository: () => ({ update }) } as never,
        workspaces as never,
        plugins as never,
        connectors as never,
        commands as never
    )
    return { service, binding, workspace, workspaces, commands, plugins, connectors, update, resource, connections }
}
describe('Bosi capability onboarding', () => {
    it('shows organization packages before installation and reserves the same private workspace', async () => {
        const f = fixture()
        expect((await f.service.catalog(f.binding)).items[0]).toMatchObject({
            id: packageId,
            status: 'available',
            canSelect: true,
            selected: false
        })
        expect(f.binding.desktopOnboarding.workspaceId).toBe(workspaceId)
        await f.service.catalog(f.binding)
        expect(f.commands.execute).toHaveBeenCalledTimes(1)
        expect(f.commands.execute).toHaveBeenCalledWith(new EnsurePersonalDefaultWorkspaceCommand('Bosi'))
        expect(f.workspaces.findOne).toHaveBeenCalledWith(workspaceId, { relations: ['members'] })
    })
    it('persists exact installed references and rejects stale choices without repeating installation', async () => {
        const f = fixture()
        const choice = { revision: 0, kind: 'plugin' as const, id: packageId, selected: true }
        const result = await f.service.choose(f.binding, choice)
        expect(result.revision).toBe(1)
        expect(result.items[0]).toMatchObject({ selected: true, status: 'ready' })
        expect(f.binding.desktopOnboarding.packages[0].resource).toEqual({
            bindingId: resourceId,
            version: 'a'.repeat(64)
        })
        await expect(f.service.choose(f.binding, choice)).rejects.toBeInstanceOf(ConflictException)
        expect(f.plugins.addToWorkspace).toHaveBeenCalledTimes(1)
        await f.service.choose(f.binding, { ...choice, revision: 1, selected: false })
        expect(f.binding.desktopOnboarding.packages).toEqual([])
    })
    it('distinguishes disabled and configuration-required resources from empty catalogs', async () => {
        const f = fixture()
        f.plugins.workspaceCatalog.mockResolvedValue({
            items: [{ id: packageId, name: 'Documents', status: 'disabled', expertReferences: [] }]
        })
        expect((await f.service.catalog(f.binding)).items[0]).toMatchObject({ status: 'unavailable', canSelect: false })
        await expect(
            f.service.choose(f.binding, { revision: 0, id: packageId, kind: 'plugin', selected: true })
        ).rejects.toBeInstanceOf(ForbiddenException)
        f.plugins.workspaceCatalog.mockRejectedValue(new Error('network unavailable'))
        await expect(f.service.catalog(f.binding)).rejects.toThrow('network unavailable')
    })
    it('connects only a registered service in the reserved workspace and restores connected state', async () => {
        const f = fixture()
        const target = await f.service.connection(f.binding, 'mail')
        expect(target).toEqual({ workspaceId, bindingId: connectorId, organizationId: 'org' })
        expect(f.connectors.createBinding).toHaveBeenCalledWith({
            provider: 'mail',
            authorizationMode: 'shared',
            scope: { type: 'workspace', workspaceId }
        })
        expect(f.binding.desktopOnboarding.connectorIds).toEqual([connectorId])
        await f.service.connection(f.binding, 'mail')
        expect(f.connectors.createBinding).toHaveBeenCalledTimes(1)
        await expect(
            f.service.resolveConnection(f.binding, { workspaceId: 'other', bindingId: connectorId })
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(f.service.connection(f.binding, 'unknown')).rejects.toBeInstanceOf(ForbiddenException)
        f.connections[0].status = 'active'
        expect((await f.service.resolveConnection(f.binding, { workspaceId, bindingId: connectorId })).connected).toBe(
            true
        )
    })
    it('does not move an existing Assistant or accept a shared/unowned workspace', async () => {
        const f = fixture()
        f.binding.assistantId = 'existing'
        await expect(f.service.catalog(f.binding)).rejects.toBeInstanceOf(ConflictException)
        expect(f.commands.execute).not.toHaveBeenCalled()
        f.binding.assistantId = null
        f.workspace.ownerId = 'other'
        await expect(f.service.catalog(f.binding)).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.update).not.toHaveBeenCalled()
    })
    it.each([
        { tenantId: 'other' },
        { organizationId: 'other' },
        { members: [{ id: 'other' }] },
        { settings: { access: { visibility: 'organization' } } },
        { status: 'archived' }
    ])('rejects a reserved workspace outside its private scope: %j', async (patch) => {
        const f = fixture()
        Object.assign(f.workspace, patch)
        await expect(f.service.catalog(f.binding)).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.update).not.toHaveBeenCalled()
        expect(f.plugins.workspaceCatalog).not.toHaveBeenCalled()
    })
})
