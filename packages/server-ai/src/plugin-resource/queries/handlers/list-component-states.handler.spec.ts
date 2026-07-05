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
    resolveTenantGlobalScopeKey: jest.fn((tenantId?: string | null) => `global:${tenantId ?? 'default'}`)
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

jest.mock('../../plugin-resource-installation.entity', () => ({
    PluginResourceInstallation: class PluginResourceInstallation {}
}))

import {
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_RESOURCE_INSTALLATION_STATUS,
    PLUGIN_RESOURCE_RUNTIME_TYPE
} from '@xpert-ai/contracts'
import { collectPluginBundleComponents } from '@xpert-ai/server-core'
import { ListPluginResourceComponentStatesHandler } from './list-component-states.handler'
import { ListPluginResourceComponentStatesQuery } from '../list-component-states.query'

describe('ListPluginResourceComponentStatesHandler', () => {
    beforeEach(() => {
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
})

function createHandler(options?: { installations?: any[]; skillPackages?: any[] }) {
    const installationRepo = {
        createQueryBuilder: jest.fn(() => createInstallationQueryBuilder(options?.installations ?? []))
    }
    const skillPackageRepo = {
        find: jest.fn((query?: any) => {
            const skillPackages = options?.skillPackages ?? []
            const ids = query?.where?.id?._value ?? query?.where?.id?._multipleParameters
            if (Array.isArray(ids)) {
                return Promise.resolve(skillPackages.filter((item) => ids.includes(item.id)))
            }
            const sharedSkillIds =
                query?.where?.sharedSkillId?._value ?? query?.where?.sharedSkillId?._multipleParameters
            if (Array.isArray(sharedSkillIds)) {
                return Promise.resolve(skillPackages.filter((item) => sharedSkillIds.includes(item.sharedSkillId)))
            }
            return Promise.resolve(skillPackages)
        })
    }
    const workspaceAccess = {
        assertCanAuthor: jest.fn(() => Promise.resolve(null))
    }
    const handler = new ListPluginResourceComponentStatesHandler(
        installationRepo as any,
        skillPackageRepo as any,
        workspaceAccess as any,
        {
            getTeam: jest.fn(() => Promise.resolve(null))
        } as any,
        [{ name: '@xpert-ai/plugin-documents', scopeKey: 'org-1' }] as any
    )

    return {
        handler,
        installationRepo,
        skillPackageRepo,
        workspaceAccess
    }
}

function createInstallationQueryBuilder(items: any[]) {
    const builder = {
        where: jest.fn(() => builder),
        andWhere: jest.fn(() => builder),
        orderBy: jest.fn(() => builder),
        getMany: jest.fn(() => Promise.resolve(items))
    }
    return builder
}
