import type { AgentPluginInstallationsService } from './agent-plugin-installations.service'
jest.mock('./agent-plugin-installations.service', () => ({ AgentPluginInstallationsService: class {} }))
import type { DefaultAgentPluginsService } from './defaults/default-agent-plugins.service'
import { BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { Repository } from 'typeorm'
import { RequestContext, AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { AgentPluginService } from './agent-plugin.service'
import { AgentPluginController } from './agent-plugin.controller'
import { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { PluginResourceInstallerService } from '../plugin-resource/plugin-resource-installer.service'
import { RolesEnum } from '@xpert-ai/contracts'
import { importedPluginBinding } from './installed-plugin-catalog'

jest.mock('./agent-plugin.entity', () => ({ AgentPluginPackage: class {}, AgentResourceBinding: class {} }))
jest.mock('../xpert-workspace/workspace-access.service', () => ({ XpertWorkspaceAccessService: class {} }))
jest.mock('../xpert/published-xpert-access.service', () => ({ PublishedXpertAccessService: class {} }))
jest.mock('../plugin-resource/plugin-resource-installer.service', () => ({ PluginResourceInstallerService: class {} }))
jest.mock('./agent-plugin-connector.service', () => ({ AgentPluginConnectorService: class {} }))

describe('workspace editor Agent Plugins', () => {
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
    it('shows editable current-organization workspaces only, without requiring administrator role', async () => {
        findAccessibleWorkspaces.mockResolvedValue([
            { id: 'workspace', name: 'Editable', organizationId: 'org' },
            { id: 'reader', name: 'Read only', organizationId: 'org' },
            { id: 'other', name: 'Other', organizationId: 'other' }
        ])
        getAccess.mockImplementation(async (id) => ({ capabilities: { canWrite: id === 'workspace' } }))
        expect((await service.workspaceOptions()).workspaces).toEqual([{ id: 'workspace', name: 'Editable' }])
    })
    it('denies read-only and cross-organization catalog and writes', async () => {
        assertCanWrite.mockRejectedValue(new ForbiddenException())
        await expect(service.workspaceCatalog('workspace')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.addToWorkspace('workspace', { packageId: 'package', experts: {} })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        assertCanWrite.mockResolvedValue({ workspace: { organizationId: 'other' } })
        await expect(service.addToWorkspace('workspace', { packageId: 'package', experts: {} })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(saved).not.toHaveBeenCalled()
    })
    it('returns display metadata without source paths, connector settings or credentials', async () => {
        const result = await service.workspaceCatalog('workspace')
        expect(result.items[0]).toMatchObject({ id: 'package', status: 'not_published', expertReferences: [] })
        expect(JSON.stringify(result)).not.toMatch(/private|rootPath|source|config|headers/)
    })
    it('adds one workspace using the shared installer, and repeated additions return the existing binding', async () => {
        const other = Object.assign(new AgentResourceBinding(), {
            id: 'other-binding',
            enabled: true,
            workspaceIds: ['another'],
            definition: { kind: 'agent_plugin' as const, packageId: 'package', experts: {} }
        })
        records.push(other)
        expect(await service.addToWorkspace('workspace', { packageId: 'package', experts: {} })).toEqual({
            status: 'added',
            bindingId: 'binding'
        })
        expect(records[1].workspaceIds).toEqual(['workspace'])
        expect(other.workspaceIds).toEqual(['another'])
        expect(await service.addToWorkspace('workspace', { packageId: 'package', experts: {} })).toEqual({
            status: 'already_added',
            bindingId: 'binding'
        })
        expect(saved).toHaveBeenCalledTimes(1)
        expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
            'tenant:org',
            'workspace:documents'
        ])
    })
    it('does not bypass an existing disabled publication', async () => {
        records.push(
            Object.assign(new AgentResourceBinding(), {
                id: 'disabled',
                enabled: false,
                workspaceIds: ['workspace'],
                definition: { kind: 'agent_plugin' as const, packageId: 'package', experts: {} }
            })
        )
        await expect(service.addToWorkspace('workspace', { packageId: 'package', experts: {} })).rejects.toBeInstanceOf(
            ConflictException
        )
        expect(saved).not.toHaveBeenCalled()
    })
    it('requires declared expert mappings and rechecks published expert access before adding', async () => {
        pkg.descriptor.extension = { version: 1, experts: [{ key: 'writer', reference: 'writer' }] }
        await expect(service.addToWorkspace('workspace', { packageId: 'package', experts: {} })).rejects.toBeInstanceOf(
            BadRequestException
        )
        expert.mockRejectedValue(new ForbiddenException())
        await expect(
            service.addToWorkspace('workspace', { packageId: 'package', experts: { writer: 'inaccessible' } })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(expert).toHaveBeenCalledWith('inaccessible')
        expect(saved).not.toHaveBeenCalled()
    })
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
    it('rejects forged scope or configuration fields at the HTTP boundary', () => {
        const controller = new AgentPluginController(
            service,
            {} as DefaultAgentPluginsService,
            {} as AgentPluginInstallationsService
        )
        const id = '00000000-0000-4000-8000-000000000001'
        expect(() => controller.addToWorkspace(id, { packageId: id, experts: {}, workspaceIds: ['other'] })).toThrow()
        expect(() => controller.addToWorkspace('../other', { packageId: id, experts: {} })).toThrow()
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
