import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DeepPartial, EntityManager } from 'typeorm'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { PluginApplicationToolsetsService } from '../application-toolsets/plugin-application-toolsets.service'
import { PluginApplicationSetupService, ResolvedApplication } from './plugin-application-setup.service'

const resolved: ResolvedApplication = {
    pluginVersion: '1',
    templateId: '@acme/app:assistant',
    templateVersion: '1',
    application: {
        id: '@acme/app:example',
        pluginName: '@acme/app',
        appName: 'example',
        displayName: 'Example',
        scope: 'organization',
        assistantTemplateKey: 'assistant',
        config: {
            scope: 'organization',
            assistantTemplateKey: 'assistant',
            workspace: { mode: 'dedicated', sharing: 'private', name: 'Example Workspace' }
        }
    }
}

describe('application configuration lifecycle', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('owner')
    })
    afterEach(() => jest.restoreAllMocks())

    async function setup() {
        let row: PluginApplicationInstallation | null = null
        let workspace: XpertWorkspace | null = null
        const insert = {
            insert: jest.fn().mockReturnThis(),
            values: jest.fn().mockReturnThis(),
            orIgnore: jest.fn().mockReturnThis(),
            execute: jest.fn(async () => {
                row ??= Object.assign(new PluginApplicationInstallation(), {
                    id: 'installation',
                    tenantId: 'tenant',
                    organizationId: 'org',
                    scopeKey: 'org',
                    pluginName: '@acme/app',
                    appName: 'example',
                    status: 'configuring',
                    declaredScope: 'organization'
                })
            })
        }
        const installations = {
            createQueryBuilder: () => insert,
            findOne: jest.fn(async () => row),
            save: jest.fn(async (value: PluginApplicationInstallation) => {
                row = value
                return value
            }),
            delete: jest.fn(async () => {
                row = null
            })
        }
        const workspaces = {
            findOneBy: jest.fn(async () => workspace),
            findOne: jest.fn(async () => workspace),
            create: (value: DeepPartial<XpertWorkspace>) => Object.assign(new XpertWorkspace(), value),
            save: jest.fn(async (value: XpertWorkspace) => {
                workspace = Object.assign(value, { id: 'workspace' })
                return workspace
            }),
            delete: jest.fn(async () => {
                workspace = null
            })
        }
        const toolsetRepository = { delete: jest.fn() }
        const otherResource = {
            createQueryBuilder: jest.fn().mockReturnThis(),
            withDeleted: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getExists: jest.fn().mockResolvedValue(false)
        }
        // Use the actual EntityManager dispatch so the unit fixture does not cast repositories.
        const manager = new EntityManager(undefined)
        jest.spyOn(manager, 'getRepository').mockImplementation((target) => {
            // Nest provider injection is the mock boundary; callers use their concrete repository contracts.
            return repositories.get(target)
        })
        const repositories = new Map<
            Parameters<EntityManager['getRepository']>[0],
            ReturnType<EntityManager['getRepository']>
        >()
        const module = await Test.createTestingModule({
            providers: [
                PluginApplicationSetupService,
                { provide: getRepositoryToken(PluginApplicationInstallation), useValue: installations },
                { provide: getRepositoryToken(XpertWorkspace), useValue: workspaces },
                { provide: getRepositoryToken(XpertToolset), useValue: toolsetRepository },
                { provide: 'other-resource', useValue: otherResource },
                {
                    provide: XpertWorkspaceAccessService,
                    useValue: { assertCanAuthor: jest.fn(), assertCanManage: jest.fn() }
                },
                { provide: PluginApplicationToolsetsService, useValue: { bind: jest.fn() } }
            ]
        }).compile()
        repositories.set(PluginApplicationInstallation, module.get(getRepositoryToken(PluginApplicationInstallation)))
        repositories.set(XpertWorkspace, module.get(getRepositoryToken(XpertWorkspace)))
        repositories.set(XpertToolset, module.get(getRepositoryToken(XpertToolset)))
        repositories.set('other-resource', module.get('other-resource'))
        Object.defineProperty(manager, 'connection', {
            value: { entityMetadatas: [{ target: 'other-resource', columns: [{ propertyName: 'workspaceId' }] }] }
        })
        Object.assign(installations, {
            manager: { transaction: jest.fn(async (run: (tx: EntityManager) => Promise<unknown>) => run(manager)) }
        })
        return {
            service: module.get(PluginApplicationSetupService),
            installations,
            workspaces,
            toolsetRepository,
            insert,
            otherResource,
            manager,
            access: module.get(XpertWorkspaceAccessService),
            toolsets: module.get(PluginApplicationToolsetsService)
        }
    }

    it('prepares only one private Workspace and restores it on a later visit', async () => {
        const { service, workspaces, installations, insert } = await setup()
        const first = await service.prepare(resolved)
        const second = await service.prepare(resolved)
        expect(first.workspaceId).toBe('workspace')
        expect(second).toMatchObject({
            workspaceId: first.workspaceId,
            status: 'configuring',
            resourceRefs: { workspace: 'workspace' }
        })
        expect(workspaces.save).toHaveBeenCalledTimes(1)
        expect(workspaces.save.mock.calls[0][0]).toMatchObject({
            ownerId: 'owner',
            tenantId: 'tenant',
            organizationId: 'org',
            settings: { access: { visibility: 'private' } }
        })
        expect(insert.orIgnore).toHaveBeenCalled()
        expect(installations.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant',
                organizationId: 'org',
                scopeKey: 'org',
                pluginName: '@acme/app',
                appName: 'example'
            },
            lock: { mode: 'pessimistic_write' }
        })
        expect(first.xpertId).toBeUndefined()
        expect(first.knowledgebaseIds).toBeUndefined()
    })

    it('retains configuration after a failed activation and binds inside the installation lock', async () => {
        const { service, toolsets, manager, workspaces } = await setup()
        const row = await service.prepare(resolved)
        row.status = 'failed'
        row.resourceRefs['toolset:images'] = 'saved-toolset'
        const result = await service.prepare(resolved)
        expect(result.resourceRefs['toolset:images']).toBe('saved-toolset')
        const selection = { key: 'images', toolsetId: 'saved-toolset' }
        await service.bind(resolved.application, selection)
        expect(toolsets.bind).toHaveBeenCalledWith(resolved.application, selection, row, manager)
        expect(workspaces.save).toHaveBeenCalledTimes(1)
    })

    it.each(['initializing', 'ready', 'degraded'] as const)('refuses discard or binding while %s', async (status) => {
        const { service, workspaces, toolsetRepository } = await setup()
        const row = await service.prepare(resolved)
        row.status = status
        await expect(service.discard(resolved.application)).rejects.toThrow()
        await expect(service.bind(resolved.application, { key: 'images', toolsetId: 'toolset' })).rejects.toThrow()
        expect(workspaces.delete).not.toHaveBeenCalled()
        expect(toolsetRepository.delete).not.toHaveBeenCalled()
    })

    it('never prepares over an in-progress initialization', async () => {
        const { service, workspaces } = await setup()
        const row = await service.prepare(resolved)
        row.status = 'initializing'
        await expect(service.prepare(resolved)).rejects.toThrow()
        expect(workspaces.save).toHaveBeenCalledTimes(1)
    })

    it('discards only the scoped draft Workspace and its configurations', async () => {
        const { service, installations, workspaces, toolsetRepository } = await setup()
        await service.prepare(resolved)
        await service.discard(resolved.application)
        expect(workspaces.delete).toHaveBeenCalledWith({ id: 'workspace', tenantId: 'tenant', organizationId: 'org' })
        expect(toolsetRepository.delete).toHaveBeenCalledWith({
            workspaceId: 'workspace',
            tenantId: 'tenant',
            organizationId: 'org'
        })
        expect(installations.delete).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'installation', tenantId: 'tenant', organizationId: 'org' })
        )
    })

    it('does not delete a draft Workspace that has acquired other resources', async () => {
        const { service, otherResource, toolsetRepository, workspaces } = await setup()
        await service.prepare(resolved)
        otherResource.getExists.mockResolvedValue(true)
        await expect(service.discard(resolved.application)).rejects.toThrow()
        expect(workspaces.delete).not.toHaveBeenCalled()
        expect(toolsetRepository.delete).not.toHaveBeenCalled()
    })

    it('requires organization context and rechecks authoring rights when reusing a Workspace', async () => {
        const { service, access, workspaces } = await setup()
        await service.prepare(resolved)
        jest.spyOn(access, 'assertCanAuthor').mockRejectedValue(new Error('denied'))
        await expect(service.prepare(resolved)).rejects.toThrow('denied')
        expect(workspaces.save).toHaveBeenCalledTimes(1)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        await expect(service.prepare(resolved)).rejects.toThrow()
    })
})
