import { PluginTemplateApplicationSummary, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { RequestContext, ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { EntityManager } from 'typeorm'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertToolsetService } from '../../xpert-toolset/xpert-toolset.service'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { ApplicationToolsetChanges, PluginApplicationToolsetsService } from './plugin-application-toolsets.service'
import { applicationToolsetDependencies, applicationToolsetRef } from './toolset-requirements'

const application: PluginTemplateApplicationSummary = {
    id: '@acme/app:example',
    pluginName: '@acme/app',
    appName: 'example',
    displayName: 'Example',
    scope: 'organization',
    assistantTemplateKey: 'main',
    config: {
        scope: 'organization',
        assistantTemplateKey: 'main',
        workspace: { mode: 'dedicated', name: 'Example', sharing: 'private' }
    }
}
const dependency = {
    pluginName: '@acme/tools',
    provider: 'image-generator',
    instanceName: 'app-images',
    templateNodeKey: 'placeholder'
}
const template = { pluginName: application.pluginName, dependencies: { toolsets: [dependency] } }
const [requirement] = applicationToolsetDependencies(application, [template])
const ref = applicationToolsetRef(requirement.key)

describe('application toolset requirements', () => {
    it('deduplicates shared dependencies independently of Agent and graph identities', () => {
        const result = applicationToolsetDependencies(application, [
            template,
            {
                ...template,
                dependencies: { toolsets: [{ ...dependency, templateNodeKey: 'another', targetAgentKey: 'role' }] }
            }
        ])
        expect(result).toEqual([requirement])
    })
    it('keeps separate named instances of the same provider', () => {
        expect(
            applicationToolsetDependencies(application, [
                template,
                {
                    ...template,
                    dependencies: { toolsets: [{ ...dependency, instanceName: 'another-account' }] }
                }
            ])
        ).toHaveLength(2)
    })
    it.each([
        { ...template, pluginName: '@other/app' },
        { ...template, dependencies: { toolsets: [{ ...dependency, instanceName: undefined }] } },
        { ...template, dependencies: { toolsets: [{ ...dependency, pluginName: '@other/tools' }] } }
    ])('rejects conflicting or foreign template declarations', (other) => {
        expect(() => applicationToolsetDependencies(application, [template, other])).toThrow()
    })
})

describe('PluginApplicationToolsetsService', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('installer')
    })
    afterEach(() => jest.restoreAllMocks())

    async function setup() {
        const source = Object.assign(new XpertToolset(), {
            id: 'source',
            name: 'My image account',
            type: dependency.provider,
            category: XpertToolsetCategoryEnum.BUILTIN,
            tenantId: 'tenant',
            organizationId: 'organization',
            workspaceId: 'source-workspace',
            credentials: { api_key: 'test-secret' },
            tools: [{ id: 'old-tool', name: 'generate', disabled: false, toolsetId: 'source' }]
        })
        const workspace = { id: 'target-workspace', name: 'App', tenantId: 'tenant', organizationId: 'organization' }
        const templates = { getTemplateDetail: jest.fn().mockResolvedValue(template) }
        const access = {
            findAccessibleWorkspaces: jest.fn().mockResolvedValue([{ ...workspace, id: 'source-workspace' }]),
            getCapabilities: jest.fn().mockResolvedValue({ canWrite: true }),
            assertCanAuthor: jest.fn().mockResolvedValue({ workspace })
        }
        const registry = {
            listRegistrations: jest.fn().mockReturnValue([
                {
                    type: dependency.provider,
                    strategy: { meta: { label: { en_US: 'Image generator' } } },
                    source: { kind: 'plugin', pluginName: dependency.pluginName }
                }
            ])
        }
        const repository = {
            find: jest.fn().mockResolvedValue([source]),
            findOne: jest.fn().mockResolvedValue(null),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            restore: jest.fn().mockResolvedValue({ affected: 1 }),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            count: jest.fn().mockResolvedValue(1)
        }
        const toolsets = { create: jest.fn(async (input: Partial<XpertToolset>) => input) }
        const installations = { save: jest.fn(async (input: PluginApplicationInstallation) => input) }
        const installation = Object.assign(new PluginApplicationInstallation(), {
            id: 'installation',
            tenantId: 'tenant',
            organizationId: 'organization',
            workspaceId: workspace.id,
            resourceRefs: {}
        })
        const module = await Test.createTestingModule({
            providers: [
                PluginApplicationToolsetsService,
                { provide: XpertTemplateService, useValue: templates },
                { provide: XpertWorkspaceAccessService, useValue: access },
                { provide: ToolsetRegistry, useValue: registry },
                { provide: XpertToolsetService, useValue: toolsets },
                { provide: getRepositoryToken(XpertToolset), useValue: repository },
                { provide: getRepositoryToken(PluginApplicationInstallation), useValue: installations }
            ]
        }).compile()
        const service = module.get(PluginApplicationToolsetsService)
        const manager = new EntityManager(undefined)
        jest.spyOn(manager, 'getRepository').mockImplementation((target) => {
            if (target === XpertToolset) return module.get(getRepositoryToken(XpertToolset))
            if (target === PluginApplicationInstallation)
                return module.get(getRepositoryToken(PluginApplicationInstallation))
            throw new Error('Unexpected repository')
        })
        return {
            service,
            source,
            templates,
            access,
            registry,
            repository,
            toolsets,
            installations,
            installation,
            manager
        }
    }

    it('discovers coordinator, role and standalone Assistant requirements automatically', async () => {
        const { service, templates } = await setup()
        await service.requirements({
            ...application,
            config: {
                ...application.config,
                assistantSuite: {
                    version: '1',
                    coordinatorAgentKey: 'main',
                    roles: [{ key: 'role', templateKey: 'writer', primaryAgentKey: 'writer' }],
                    standaloneAssistants: [{ key: 'studio', templateKey: 'studio', primaryAgentKey: 'studio' }]
                }
            }
        })
        expect(templates.getTemplateDetail.mock.calls.map(([id]) => id)).toEqual([
            '@acme/app:main',
            '@acme/app:writer',
            '@acme/app:studio'
        ])
    })

    it('returns only public option metadata and filters same-organization authoring access', async () => {
        const { service, repository, access } = await setup()
        const result = await service.preflight(application)
        expect(result[0].options).toEqual([{ id: 'source', name: 'My image account' }])
        expect(JSON.stringify(result)).not.toContain('test-secret')
        expect(JSON.stringify(result)).not.toContain('credentials')
        expect(access.findAccessibleWorkspaces).toHaveBeenCalledWith(undefined, { purpose: 'authoring' })
        expect(repository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: [
                    expect.objectContaining({
                        tenantId: 'tenant',
                        organizationId: 'organization',
                        createdById: 'installer'
                    }),
                    expect.objectContaining({ tenantId: 'tenant', organizationId: 'organization' })
                ]
            })
        )
    })

    it('excludes foreign or read-only workspaces, retaining only user-owned loose configurations', async () => {
        const { service, repository, access } = await setup()
        access.findAccessibleWorkspaces.mockResolvedValue([
            { id: 'foreign', name: 'Foreign', tenantId: 'other', organizationId: 'organization' },
            { id: 'readonly', name: 'Readonly', tenantId: 'tenant', organizationId: 'organization' }
        ])
        access.getCapabilities.mockResolvedValue({ canWrite: false })
        await service.preflight(application)
        expect(repository.find.mock.calls[0][0].where).toHaveLength(1)
        expect(repository.find.mock.calls[0][0].where[0]).toMatchObject({ createdById: 'installer' })
    })

    it.each(['missing', 'mismatched'])('reports %s providers before provisioning', async (mode) => {
        const { service, registry } = await setup()
        registry.listRegistrations.mockReturnValue(
            mode === 'missing'
                ? []
                : [
                      {
                          type: dependency.provider,
                          strategy: { meta: { label: { en_US: 'Other' } } },
                          source: { kind: 'plugin', pluginName: '@wrong/provider' }
                      }
                  ]
        )
        expect((await service.preflight(application))[0]).toMatchObject({ providerAvailable: false, options: [] })
        await expect(service.prepare(application, [{ key: requirement.key, toolsetId: 'source' }])).rejects.toThrow()
    })

    it.each(
        [
            [],
            [{ key: requirement.key, toolsetId: 'foreign' }],
            [{ key: 'unknown', toolsetId: 'source' }],
            [
                { key: requirement.key, toolsetId: 'source' },
                { key: requirement.key, toolsetId: 'source' }
            ]
        ].map((selections) => ({ selections }))
    )('rejects missing, unauthorized, unknown and duplicate choices', async ({ selections }) => {
        const { service, toolsets } = await setup()
        await expect(service.prepare(application, selections)).rejects.toThrow()
        expect(toolsets.create).not.toHaveBeenCalled()
    })

    it('copies a differently named source, retaining credentials server-side and allocating new tool IDs', async () => {
        const { service, installation, source, toolsets, installations } = await setup()
        const prepared = await service.prepare(application, [{ key: requirement.key, toolsetId: source.id }])
        const changes: ApplicationToolsetChanges = { created: [], restored: [] }
        await service.ensure(prepared, installation, changes)
        const targetId = installation.resourceRefs[ref]
        expect(changes.created).toEqual([targetId])
        expect(installations.save.mock.invocationCallOrder[0]).toBeLessThan(toolsets.create.mock.invocationCallOrder[0])
        expect(toolsets.create.mock.calls[0][0]).toMatchObject({
            id: targetId,
            name: 'app-images',
            workspaceId: 'target-workspace',
            credentials: { api_key: 'test-secret' },
            tools: [{ name: 'generate', disabled: false }]
        })
        expect(toolsets.create.mock.calls[0][0].tools[0].id).toBeUndefined()
        expect(toolsets.create.mock.calls[0][0].tools[0].toolsetId).toBeUndefined()
        expect(source.name).toBe('My image account')
    })

    it('binds a saved configuration in place and preserves its ID for activation', async () => {
        const { service, source, repository, installation, installations, manager, toolsets } = await setup()
        source.workspaceId = installation.workspaceId
        repository.findOne.mockResolvedValue(source)
        await service.bind(application, { key: requirement.key, toolsetId: source.id }, installation, manager)
        expect(repository.findOne).toHaveBeenCalledWith({
            where: {
                id: source.id,
                workspaceId: 'target-workspace',
                tenantId: 'tenant',
                organizationId: 'organization',
                type: dependency.provider,
                category: XpertToolsetCategoryEnum.BUILTIN
            },
            relations: ['tools']
        })
        expect(repository.update).toHaveBeenCalledWith(
            { id: source.id, workspaceId: 'target-workspace' },
            { name: dependency.instanceName }
        )
        expect(installation.resourceRefs[ref]).toBe(source.id)
        expect(installations.save).toHaveBeenCalledWith(installation)
        expect(toolsets.create).not.toHaveBeenCalled()
    })

    it('adopts a selected configuration already in the prepared Workspace without cloning it', async () => {
        const { service, source, installation, toolsets } = await setup()
        source.workspaceId = installation.workspaceId
        const changes: ApplicationToolsetChanges = { created: [], restored: [] }
        await service.ensure([{ dependency: requirement, sourceId: source.id }], installation, changes)
        expect(installation.resourceRefs[ref]).toBe(source.id)
        expect(changes.created).toEqual([])
        expect(toolsets.create).not.toHaveBeenCalled()
    })

    it('copies a shared local source for a second named dependency without renaming the first binding', async () => {
        const { service, source, installation, toolsets, repository } = await setup()
        source.workspaceId = installation.workspaceId
        const requirements = applicationToolsetDependencies(application, [
            template,
            { ...template, dependencies: { toolsets: [{ ...dependency, instanceName: 'review-images' }] } }
        ])
        const changes: ApplicationToolsetChanges = { created: [], restored: [] }
        await service.ensure(
            requirements.map((dependency) => ({ dependency, sourceId: source.id })),
            installation,
            changes
        )
        expect(repository.update).toHaveBeenCalledTimes(1)
        expect(repository.update).toHaveBeenCalledWith(expect.objectContaining({ id: source.id }), {
            name: 'app-images'
        })
        expect(installation.resourceRefs[ref]).toBe(source.id)
        const secondId = installation.resourceRefs[applicationToolsetRef(requirements[1].key)]
        expect(secondId).not.toBe(source.id)
        expect(toolsets.create).toHaveBeenCalledTimes(1)
        expect(toolsets.create).toHaveBeenCalledWith(
            expect.objectContaining({ id: secondId, name: 'review-images', workspaceId: installation.workspaceId })
        )
        expect(changes.created).toEqual([secondId])
    })

    it('rejects binding an unavailable instance, a wrong dependency, or a configuration with no enabled tools', async () => {
        const { service, source, installation, repository, manager } = await setup()
        await expect(
            service.bind(application, { key: requirement.key, toolsetId: 'foreign' }, installation, manager)
        ).rejects.toThrow()
        await expect(
            service.bind(application, { key: 'unknown', toolsetId: source.id }, installation, manager)
        ).rejects.toThrow()
        source.tools[0].disabled = true
        repository.findOne.mockResolvedValue(source)
        await expect(
            service.bind(application, { key: requirement.key, toolsetId: source.id }, installation, manager)
        ).rejects.toThrow()
        expect((await service.preflight(application))[0].options).toEqual([])
        expect(repository.update).not.toHaveBeenCalled()
    })

    it('rechecks access after preflight and rejects revoked sources without creating resources', async () => {
        const { service, installation, repository, toolsets } = await setup()
        const prepared = await service.prepare(application, [{ key: requirement.key, toolsetId: 'source' }])
        repository.find.mockResolvedValue([])
        await expect(service.ensure(prepared, installation, { created: [], restored: [] })).rejects.toThrow()
        expect(toolsets.create).not.toHaveBeenCalled()
    })

    it('reuses existing managed instances and preserves their ID when repairing a deleted instance', async () => {
        const { service, installation, repository, toolsets, source } = await setup()
        installation.resourceRefs[ref] = 'managed-id'
        const prepared = [{ dependency: requirement, sourceId: source.id }]
        repository.findOne.mockResolvedValue({
            ...source,
            id: 'managed-id',
            workspaceId: installation.workspaceId,
            name: 'app-images'
        })
        await service.ensure(prepared, installation, { created: [], restored: [] })
        expect(toolsets.create).not.toHaveBeenCalled()
        repository.findOne.mockResolvedValue(null)
        await service.ensure(prepared, installation, { created: [], restored: [] })
        expect(toolsets.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'managed-id' }))
    })

    it('restores a soft-deleted managed instance and rolls it back without deleting its original data', async () => {
        const { service, installation, repository, source, toolsets } = await setup()
        const deletedAt = new Date('2026-01-01T00:00:00Z')
        installation.resourceRefs[ref] = 'managed'
        repository.findOne.mockResolvedValue({
            ...source,
            id: 'managed',
            workspaceId: installation.workspaceId,
            name: 'app-images',
            deletedAt
        })
        const changes: ApplicationToolsetChanges = { created: [], restored: [] }
        await service.ensure([{ dependency: requirement, sourceId: source.id }], installation, changes)
        expect(toolsets.create).not.toHaveBeenCalled()
        expect(changes).toEqual({ created: [], restored: [{ id: 'managed', deletedAt }] })
        await service.rollback(changes, installation)
        expect(repository.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'managed', workspaceId: installation.workspaceId }),
            { deletedAt }
        )
        expect(repository.delete).not.toHaveBeenCalled()
    })

    it('rejects a managed resource reference that points outside the installation scope', async () => {
        const { service, installation, repository, toolsets, source } = await setup()
        installation.resourceRefs[ref] = 'foreign'
        repository.findOne.mockResolvedValue({ ...source, id: 'foreign', organizationId: 'other' })
        await expect(
            service.ensure([{ dependency: requirement, sourceId: source.id }], installation, {
                created: [],
                restored: []
            })
        ).rejects.toThrow()
        expect(toolsets.create).not.toHaveBeenCalled()
    })

    it('rolls back only the current attempt and includes managed toolsets in health checks', async () => {
        const { service, repository, installation } = await setup()
        installation.resourceRefs[ref] = 'managed'
        repository.count.mockResolvedValue(0)
        expect(await service.healthy(installation)).toBe(false)
        await service.rollback({ created: ['created'], restored: [] }, installation)
        expect(repository.delete).toHaveBeenCalledTimes(1)
        expect(repository.delete).toHaveBeenCalledWith({
            id: 'created',
            workspaceId: 'target-workspace',
            tenantId: 'tenant',
            organizationId: 'organization'
        })
    })
})
