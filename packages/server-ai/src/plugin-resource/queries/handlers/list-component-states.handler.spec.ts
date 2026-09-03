jest.mock('@nestjs/typeorm', () => ({
    InjectRepository: () => () => undefined
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
    GLOBAL_ORGANIZATION_SCOPE: 'global',
    SYSTEM_GLOBAL_SCOPE: 'system:global',
    RequestContext: {
        getOrganizationId: jest.fn(() => 'org-1'),
        getScope: jest.fn(() => ({ tenantId: 'tenant-1' })),
        currentTenantId: jest.fn(() => 'tenant-1')
    },
    resolveTenantGlobalScopeKey: jest.fn((tenantId?: string | null) => `global:${tenantId ?? 'default'}`),
    describeXpertToolProvider: jest.fn((strategy: object) => Reflect.get(strategy, 'descriptor'))
}))

jest.mock('@xpert-ai/server-core', () => ({
    collectPluginBundleComponents: jest.fn(() => []),
    LOADED_PLUGINS: Symbol('LOADED_PLUGINS'),
    normalizePluginName: (value: string) => value?.trim(),
    readPluginBundleManifest: jest.fn(() => ({ manifest: {} })),
    resolveLoadedPluginBundleRoot: jest.fn(() => '/tmp/plugin-documents')
}))

jest.mock('../../../skill-package/skill-package.entity', () => ({
    SkillPackage: class SkillPackage {}
}))

jest.mock('../../../xpert/xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../../xpert-workspace', () => ({
    XpertWorkspaceAccessService: class XpertWorkspaceAccessService {}
}))

jest.mock('../../../mcp-publication/entities/mcp-publication.entity', () => ({
    McpPublication: class McpPublication {}
}))

jest.mock('../../../mcp-publication/entities/mcp-publication-access.entity', () => ({
    McpPublicationAccess: class McpPublicationAccess {}
}))

jest.mock('../../plugin-resource-installation.entity', () => ({
    PluginResourceInstallation: class PluginResourceInstallation {}
}))

import {
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_RESOURCE_INSTALLATION_STATUS,
    PLUGIN_RESOURCE_RUNTIME_TYPE
} from '@xpert-ai/contracts'
import { collectPluginBundleComponents } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ListPluginResourceComponentStatesHandler } from './list-component-states.handler'
import { ListPluginResourceComponentStatesQuery } from '../list-component-states.query'

describe('ListPluginResourceComponentStatesHandler', () => {
    beforeEach(() => {
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue('org-1')
        jest.mocked(RequestContext.currentTenantId).mockReturnValue('tenant-1')
        jest.mocked(collectPluginBundleComponents).mockReturnValue([
            {
                componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                componentKey: 'documents',
                sourcePath: './skills/documents/SKILL.md',
                definitionHash: 'skill-hash'
            }
        ] as never)
    })

    it('requires authoring access to inspect workspace install states', async () => {
        const { handler, workspaceAccess } = createHandler()

        await handler.execute(
            new ListPluginResourceComponentStatesQuery('@xpert-ai/plugin-documents', {
                target: 'workspace',
                workspaceId: 'workspace-1'
            })
        )

        expect(workspaceAccess.assertCanAuthor).toHaveBeenCalledWith('workspace-1')
    })

    it('loads organization toolset state without selecting a workspace', async () => {
        jest.mocked(collectPluginBundleComponents).mockReturnValue([
            {
                componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
                componentKey: 'cut',
                definitionHash: 'cut-native-hash'
            }
        ] as never)
        const { handler, installationRepo, workspaceAccess } = createHandler({
            installations: [
                {
                    workspaceId: null,
                    pluginName: '@xpert-ai/plugin-cut',
                    componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
                    componentKey: 'cut',
                    runtimeType: PLUGIN_RESOURCE_RUNTIME_TYPE.TOOLSET,
                    runtimeId: 'toolset-cut',
                    definitionHash: 'cut-native-hash',
                    status: PLUGIN_RESOURCE_INSTALLATION_STATUS.READY
                }
            ]
        })

        const states = await handler.execute(
            new ListPluginResourceComponentStatesQuery('@xpert-ai/plugin-cut', {
                target: 'organization'
            })
        )

        expect(workspaceAccess.assertCanAuthor).not.toHaveBeenCalled()
        const builder = installationRepo.createQueryBuilder.mock.results[0]?.value
        expect(builder.andWhere).toHaveBeenCalledWith('installation.tenantId = :installationTenantId', {
            installationTenantId: 'tenant-1'
        })
        expect(builder.andWhere).toHaveBeenCalledWith('installation.organizationId = :installationOrganizationId', {
            installationOrganizationId: 'org-1'
        })
        expect(builder.andWhere).toHaveBeenCalledWith('installation.workspaceId IS NULL')
        expect(states).toEqual([
            expect.objectContaining({
                componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
                componentKey: 'cut',
                installed: true,
                runtimeId: 'toolset-cut'
            })
        ])
    })

    it('does not mark a plugin skill as installed when its runtime skill package was deleted', async () => {
        const { handler, skillPackageRepo } = createHandler({
            installations: [
                {
                    workspaceId: 'workspace-1',
                    pluginName: '@xpert-ai/plugin-documents',
                    componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                    componentKey: 'documents',
                    runtimeType: PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE,
                    runtimeId: 'deleted-skill-package',
                    definitionHash: 'skill-hash',
                    status: PLUGIN_RESOURCE_INSTALLATION_STATUS.READY
                }
            ],
            skillPackages: []
        })

        const states = await handler.execute(
            new ListPluginResourceComponentStatesQuery('@xpert-ai/plugin-documents', {
                target: 'workspace',
                workspaceId: 'workspace-1'
            })
        )

        expect(skillPackageRepo.find).toHaveBeenCalledTimes(2)
        expect(states).toEqual([
            expect.objectContaining({
                componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                componentKey: 'documents',
                installed: false,
                staleDefinition: false,
                runtimeType: null,
                runtimeId: null,
                status: null,
                installation: null
            })
        ])
    })

    it('keeps tenant-global organization installations separate from named organizations', async () => {
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue(null)
        jest.mocked(collectPluginBundleComponents).mockReturnValue([
            {
                componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
                componentKey: 'cut',
                definitionHash: 'cut-native-hash'
            }
        ] as never)
        const { handler, installationRepo } = createHandler()

        await handler.execute(
            new ListPluginResourceComponentStatesQuery('@xpert-ai/plugin-cut', {
                target: 'organization'
            })
        )

        const builder = installationRepo.createQueryBuilder.mock.results[0]?.value
        expect(builder.andWhere).toHaveBeenCalledWith('installation.tenantId = :installationTenantId', {
            installationTenantId: 'tenant-1'
        })
        expect(builder.andWhere).toHaveBeenCalledWith('installation.organizationId IS NULL')
    })

    it('marks a plugin skill as installed from its current shared skill package', async () => {
        const { handler } = createHandler({
            installations: [],
            skillPackages: [
                {
                    id: 'skill-package-documents',
                    workspaceId: 'workspace-1',
                    sharedSkillId: 'plugin:@xpert-ai/plugin-documents:skill:documents'
                }
            ]
        })

        const states = await handler.execute(
            new ListPluginResourceComponentStatesQuery('@xpert-ai/plugin-documents', {
                target: 'workspace',
                workspaceId: 'workspace-1'
            })
        )

        expect(states).toEqual([
            expect.objectContaining({
                componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                componentKey: 'documents',
                installed: true,
                staleDefinition: false,
                runtimeType: PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE,
                runtimeId: 'skill-package-documents',
                status: PLUGIN_RESOURCE_INSTALLATION_STATUS.READY,
                installation: null
            })
        ])
    })

    it('shows a tenant Provider as disabled until the current organization has an access grant', async () => {
        jest.mocked(collectPluginBundleComponents).mockReturnValue([
            {
                componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
                componentKey: 'factory-operations',
                definitionHash: 'manifest-hash'
            }
        ] as never)
        const tenantInstallation = {
            workspaceId: null,
            pluginName: '@xpert-ai/plugin-factory',
            componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
            componentKey: 'factory-operations',
            runtimeType: PLUGIN_RESOURCE_RUNTIME_TYPE.TOOLSET,
            runtimeId: 'toolset-factory',
            definitionHash: 'runtime-hash',
            status: PLUGIN_RESOURCE_INSTALLATION_STATUS.READY,
            config: {
                publicationId: 'publication-tenant',
                publicationScope: 'tenant',
                syncError: 'descriptor validation failed',
                syncFailedAt: '2026-09-03T01:00:00.000Z'
            }
        }
        const runtimeProvider = {
            descriptor: {
                options: {
                    provider: 'factory_ops',
                    componentKey: 'factory-operations',
                    name: 'Factory Operations'
                },
                tools: []
            }
        }
        const { handler, installationRepo } = createHandler({
            installations: [],
            tenantInstallations: [tenantInstallation],
            publications: [
                {
                    id: 'publication-tenant',
                    slug: 'factory-ops-t-scopehash',
                    status: 'active'
                }
            ],
            accesses: [],
            runtimeRegistrations: [
                {
                    strategy: runtimeProvider,
                    source: {
                        kind: 'plugin',
                        pluginName: '@xpert-ai/plugin-factory',
                        scopeKey: 'global:tenant-1'
                    }
                }
            ],
            loadedPlugins: [
                {
                    tenantId: 'tenant-1',
                    organizationId: 'global',
                    scopeKey: 'global:tenant-1',
                    name: '@xpert-ai/plugin-factory',
                    level: 'tenant',
                    instance: { meta: { level: 'tenant' } }
                }
            ]
        })

        const states = await handler.execute(
            new ListPluginResourceComponentStatesQuery('@xpert-ai/plugin-factory', {
                target: 'organization'
            })
        )

        expect(installationRepo.createQueryBuilder).toHaveBeenCalledTimes(2)
        expect(states).toEqual([
            expect.objectContaining({
                installed: true,
                mcpServer: expect.objectContaining({
                    publicationId: 'publication-tenant',
                    publicationScope: 'tenant',
                    accessEnabled: false,
                    status: 'disabled',
                    syncError: 'descriptor validation failed',
                    syncFailedAt: '2026-09-03T01:00:00.000Z'
                })
            })
        ])
    })
})

function createHandler(options?: {
    installations?: object[]
    tenantInstallations?: object[]
    skillPackages?: object[]
    publications?: object[]
    accesses?: object[]
    runtimeRegistrations?: object[]
    loadedPlugins?: object[]
}) {
    let installationQueryCount = 0
    const installationRepo = {
        createQueryBuilder: jest.fn(() => {
            const items =
                installationQueryCount++ === 0
                    ? (options?.installations ?? [])
                    : (options?.tenantInstallations ?? options?.installations ?? [])
            return createInstallationQueryBuilder(items)
        })
    }
    const skillPackageRepo = {
        find: jest.fn((query?: object) => {
            const skillPackages = options?.skillPackages ?? []
            const where = query ? Reflect.get(query, 'where') : undefined
            const idFilter = where ? Reflect.get(where, 'id') : undefined
            const ids = idFilter
                ? (Reflect.get(idFilter, '_value') ?? Reflect.get(idFilter, '_multipleParameters'))
                : null
            if (Array.isArray(ids)) {
                return Promise.resolve(skillPackages.filter((item) => ids.includes(Reflect.get(item, 'id'))))
            }
            const sharedSkillIdFilter = where ? Reflect.get(where, 'sharedSkillId') : undefined
            const sharedSkillIds = sharedSkillIdFilter
                ? (Reflect.get(sharedSkillIdFilter, '_value') ??
                  Reflect.get(sharedSkillIdFilter, '_multipleParameters'))
                : null
            if (Array.isArray(sharedSkillIds)) {
                return Promise.resolve(
                    skillPackages.filter((item) => sharedSkillIds.includes(Reflect.get(item, 'sharedSkillId')))
                )
            }
            return Promise.resolve(skillPackages)
        })
    }
    const workspaceAccess = {
        assertCanAuthor: jest.fn(() => Promise.resolve(null))
    }
    const handler = new ListPluginResourceComponentStatesHandler(
        installationRepo as never,
        skillPackageRepo as never,
        { find: jest.fn(() => Promise.resolve(options?.publications ?? [])) } as never,
        { find: jest.fn(() => Promise.resolve(options?.accesses ?? [])) } as never,
        workspaceAccess as never,
        {
            getTeam: jest.fn(() => Promise.resolve(null))
        } as never,
        { listRegistrations: jest.fn(() => options?.runtimeRegistrations ?? []) } as never,
        { get: jest.fn() } as never,
        (options?.loadedPlugins ?? [
            { name: '@xpert-ai/plugin-documents', scopeKey: 'org-1' },
            { name: '@xpert-ai/plugin-cut', scopeKey: 'org-1' },
            { name: '@xpert-ai/plugin-cut', scopeKey: 'global:tenant-1' }
        ]) as never
    )

    return {
        handler,
        installationRepo,
        skillPackageRepo,
        workspaceAccess
    }
}

function createInstallationQueryBuilder(items: object[]) {
    const builder = {
        where: jest.fn(() => builder),
        andWhere: jest.fn(() => builder),
        orderBy: jest.fn(() => builder),
        getMany: jest.fn(() => Promise.resolve(items))
    }
    return builder
}
