import { ForbiddenException, ConflictException } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { Repository } from 'typeorm'
import { RequestContext, AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { AgentPluginService } from './agent-plugin.service'
import { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { PluginResourceInstallerService } from '../plugin-resource/installation/plugin-resource-installer.service'
import { RolesEnum } from '@xpert-ai/contracts'
import { importedPluginBinding } from './installed-plugin-catalog'

jest.mock('./agent-plugin.entity', () => ({ AgentPluginPackage: class {}, AgentResourceBinding: class {} }))
jest.mock('../xpert-workspace/workspace-access.service', () => ({ XpertWorkspaceAccessService: class {} }))
jest.mock('../xpert/published-xpert-access.service', () => ({ PublishedXpertAccessService: class {} }))
jest.mock('../plugin-resource/installation/plugin-resource-installer.service', () => ({
    PluginResourceInstallerService: class {}
}))
jest.mock('./agent-plugin-connector.service', () => ({ AgentPluginConnectorService: class {} }))

describe('Agent Plugin installation configuration', () => {
    const pkg = Object.assign(new AgentPluginPackage(), {
        id: 'package',
        tenantId: 'tenant',
        organizationId: 'org',
        digest: 'digest',
        rootPath: '/private/source',
        source: { kind: 'git' as const, url: 'https://private.example' },
        descriptor: {
            name: 'documents',
            version: '1',
            description: 'Documents',
            skills: [],
            servers: [],
            diagnostics: []
        }
    })
    let records: AgentResourceBinding[]
    let service: AgentPluginService
    const assertCanWrite = jest.fn()
    const getAccess = jest.fn()
    const findAccessibleWorkspaces = jest.fn()
    const saved = jest.fn()
    const query = jest.fn()
    const expert = jest.fn()
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        records = []
        delete pkg.descriptor.extension
        assertCanWrite.mockReset().mockResolvedValue({ workspace: { organizationId: 'org' } })
        getAccess.mockReset().mockResolvedValue({ capabilities: { canWrite: true } })
        findAccessibleWorkspaces
            .mockReset()
            .mockResolvedValue([{ id: 'workspace', name: 'Editable', organizationId: 'org' }])
        expert.mockReset().mockResolvedValue({ id: 'expert', publishAt: new Date('2026-09-27') })
        query.mockReset()
        const manager = {
            query,
            findOneBy: jest.fn(async (_entity, where) =>
                where.id === pkg.id ? pkg : records.find((record) => record.id === where.id)
            ),
            findOne: jest
                .fn()
                .mockImplementation(async (_entity, { where }) => records.find(({ id }) => id === where.id)),
            save: saved,
            transaction: async (work: (manager: object) => Promise<unknown>) => work(manager)
        }
        saved.mockReset().mockImplementation(async (entity: unknown, value?: AgentResourceBinding) => {
            const binding = value || (entity as AgentResourceBinding)
            binding.id ??= 'binding'
            if (!records.includes(binding)) records.push(binding)
            return binding
        })
        service = new AgentPluginService(
            {
                manager,
                find: jest.fn().mockResolvedValue([pkg]),
                findOneBy: jest.fn().mockImplementation(async ({ id }) => (id === 'package' ? pkg : null))
            } as unknown as Repository<AgentPluginPackage>,
            {
                find: jest.fn().mockImplementation(async () => records),
                findOneBy: jest.fn().mockImplementation(async ({ id }) => records.find((binding) => binding.id === id)),
                create: (value: object) => value,
                manager
            } as unknown as Repository<AgentResourceBinding>,
            {
                get: (token: unknown) => {
                    if (token === XpertWorkspaceAccessService)
                        return { assertCanWrite, getAccess, findAccessibleWorkspaces }
                    if (token === PublishedXpertAccessService)
                        return {
                            findAccessiblePublishedXperts: async () => [{ id: 'expert', name: 'Writer' }],
                            getAccessiblePublishedXpert: expert
                        }
                    if (token === AgentMiddlewareRegistry) return { get: () => ({ meta: {} }) }
                    if (token === PluginResourceInstallerService) return { installRuntimeComponent: jest.fn() }
                    throw new Error('Unexpected dependency')
                }
            } as unknown as ModuleRef
        )
    })
    afterEach(() => jest.restoreAllMocks())
    it('keeps the admin-only import and organization publication boundary', async () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(null)
        await expect(service.list()).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            service.createBinding({
                title: 'x',
                workspaceIds: ['workspace'],
                definition: { kind: 'agent_plugin', packageId: 'package', experts: {} }
            })
        ).rejects.toBeInstanceOf(ForbiddenException)
    })
    it.each(['org', null])(
        'configures an installation in %s scope without workspace authoring rights',
        async (organizationId) => {
            jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
            jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } } as ReturnType<
                typeof RequestContext.currentUser
            >)
            assertCanWrite.mockRejectedValue(new ForbiddenException())
            const configured = await service.createBinding({
                title: 'Documents',
                workspaceIds: [],
                definition: { kind: 'agent_plugin', packageId: 'package', experts: {} }
            })
            expect(configured).toMatchObject({
                tenantId: 'tenant',
                organizationId,
                workspaceIds: [],
                definition: { availability: 'scope' }
            })
            expect(assertCanWrite).not.toHaveBeenCalled()
        }
    )
    it('preserves the imported reference when configuring it, and rejects replacing that revision twice', async () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } } as ReturnType<
            typeof RequestContext.currentUser
        >)
        const imported = importedPluginBinding(pkg)
        const input = {
            title: 'Configured Documents',
            workspaceIds: [],
            replacesBindingId: imported.id,
            definition: { kind: 'agent_plugin' as const, packageId: pkg.id, experts: {} }
        }
        const configured = await service.createBinding(input)
        expect(records.find(({ id }) => id === imported.id)).toMatchObject({
            id: imported.id,
            version: imported.version,
            definition: imported.definition,
            enabled: true,
            supersededById: configured.id
        })
        expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
            `agent-plugin:${imported.id}`
        ])
        await expect(service.createBinding(input)).rejects.toBeInstanceOf(ConflictException)
        expect(records).toHaveLength(2)
    })
})
