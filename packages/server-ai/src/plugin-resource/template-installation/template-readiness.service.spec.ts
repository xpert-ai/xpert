jest.mock('../plugin-resource-installer.service', () => ({ PluginResourceInstallerService: class {} }))
jest.mock('../../xpert/xpert.service', () => ({ XpertService: class {} }))
jest.mock('../../xpert-workspace/workspace-access.service', () => ({ XpertWorkspaceAccessService: class {} }))
jest.mock('../../xpert-toolset/xpert-toolset.entity', () => ({ XpertToolset: class {} }))
import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { LOADED_PLUGINS, LoadedPluginRecord } from '@xpert-ai/server-core'
import {
    AgentMiddlewareRegistry,
    SandboxProviderRegistry,
    ToolsetRegistry,
    RequestContext,
    SYSTEM_GLOBAL_SCOPE
} from '@xpert-ai/plugin-sdk'
import { TXpertTemplate, XpertTypeEnum } from '@xpert-ai/contracts'
import { PluginResourceInstallerService } from '../plugin-resource-installer.service'
import { XpertService } from '../../xpert/xpert.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { TemplateReadinessService } from './template-readiness.service'
import { InstallationSourceChangedError } from './template-installation-source'

describe('scoped template dependency preparation', () => {
    const base: TXpertTemplate = {
        id: 'test',
        name: 'test',
        title: 'Test',
        category: '',
        copyright: '',
        description: '',
        avatar: {},
        type: XpertTypeEnum.Agent,
        export_data: 'team: {type: agent}\nnodes: []\nconnections: []'
    }
    const plugin = (scopeKey: string, version: string): LoadedPluginRecord => ({
        organizationId: scopeKey,
        scopeKey,
        name: '@test/dep',
        instance: { meta: { version } },
        ctx: {}
    })
    async function harness() {
        const loaded = [plugin(SYSTEM_GLOBAL_SCOPE, '1.0.0'), plugin('org', '2.0.0')]
        const installer = {
            resolveRuntimeComponents: jest.fn(async (_name, selectors) =>
                selectors
                    .filter((selector) => selector.componentKey !== 'missing')
                    .map((selector) => ({
                        pluginName: '@test/dep',
                        pluginVersion: '2.0.0',
                        rootDir: '/private/plugin/root',
                        component: {
                            componentType: selector.componentType,
                            componentKey: selector.componentKey,
                            definitionHash: 'hash-a'
                        }
                    }))
            )
        }
        const access = { assertCanAuthor: jest.fn(async () => undefined) }
        const module = await Test.createTestingModule({
            providers: [
                TemplateReadinessService,
                { provide: CommandBus, useValue: { execute: jest.fn() } },
                ...[AgentMiddlewareRegistry, SandboxProviderRegistry, ToolsetRegistry].map((provide) => ({
                    provide,
                    useValue: { get: (key: string) => ({ key }), getSource: () => ({ kind: 'builtin' }) }
                })),
                { provide: LOADED_PLUGINS, useValue: loaded },
                { provide: PluginResourceInstallerService, useValue: installer },
                { provide: XpertWorkspaceAccessService, useValue: access },
                { provide: XpertService, useValue: { getSandboxProviders: async () => [] } },
                { provide: getRepositoryToken(XpertToolset), useValue: { find: jest.fn(async () => []) } }
            ]
        }).compile()
        return { service: module.get(TemplateReadinessService), module, loaded, installer, access }
    }
    beforeEach(() => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getScope').mockReturnValue(undefined)
    })
    afterEach(() => jest.restoreAllMocks())

    it('prefers organization scope and pins a runtime-only prerequisite without selecting its resources', async () => {
        const h = await harness()
        const result = await h.service.prepare({ ...base, dependencies: { plugins: ['@test/dep'] } }, 'workspace')
        expect(result.readiness.dependencies).toEqual([{ pluginName: '@test/dep', version: '2.0.0', components: [] }])
        expect(h.installer.resolveRuntimeComponents).not.toHaveBeenCalled()
        expect(h.access.assertCanAuthor).toHaveBeenCalledWith('workspace')
        await h.module.close()
    })
    it('does not allow missing or incompatible prerequisites to create an Assistant', async () => {
        const h = await harness()
        for (const dependencies of [
            { plugins: ['@test/missing'] },
            { versions: [{ pluginName: '@test/dep', version: '1.0.0' }] }
        ])
            await expect(h.service.prepare({ ...base, dependencies }, 'workspace')).rejects.toThrow()
        await h.module.close()
    })
    it('resolves explicitly owned cross-plugin components even without a template owner, and rejects partial matches', async () => {
        const h = await harness()
        const dependencies = { skills: [{ pluginName: '@test/dep', componentKey: 'selected' }] }
        const result = await h.service.prepare({ ...base, dependencies }, 'workspace')
        expect(result.components).toHaveLength(1)
        expect(result.readiness.dependencies[0].components).toEqual([
            { type: 'skill', key: 'selected', hash: 'hash-a' }
        ])
        expect(JSON.stringify(result.readiness)).not.toContain('/private/plugin/root')
        await expect(
            h.service.prepare(
                {
                    ...base,
                    dependencies: {
                        skills: [...dependencies.skills, { pluginName: '@test/dep', componentKey: 'missing' }]
                    }
                },
                'workspace'
            )
        ).rejects.toThrow()
        await h.module.close()
    })
    it('blocks recovery and runtime execution after version drift', async () => {
        const h = await harness(),
            template = { ...base, dependencies: { plugins: ['@test/dep'] } }
        const result = await h.service.prepare(template, 'workspace')
        await expect(h.service.assertDependencies(result.readiness.dependencies)).resolves.toBeUndefined()
        h.loaded[1] = plugin('org', '3.0.0')
        await expect(h.service.prepare(template, 'workspace', result.readiness.dependencies)).rejects.toBeInstanceOf(
            InstallationSourceChangedError
        )
        await expect(h.service.assertDependencies(result.readiness.dependencies)).rejects.toThrow()
        await h.module.close()
    })
    it('fails closed when an otherwise loaded prerequisite belongs to another organization', async () => {
        const h = await harness()
        h.loaded.splice(0, h.loaded.length, plugin('other-org', '2.0.0'))
        await expect(
            h.service.prepare({ ...base, dependencies: { plugins: ['@test/dep'] } }, 'workspace')
        ).rejects.toThrow()
        await h.module.close()
    })
    it('does not pin a pure v2 template distributor, but preserves v1 owner locks', async () => {
        const h = await harness()
        const template = { ...base, pluginName: '@test/dep', manifest: { schemaVersion: 2 as const, version: '1' } }
        const result = await h.service.prepare(template, 'workspace')
        expect(result.readiness.dependencies).toEqual([])
        h.loaded[1] = plugin('org', '3.0.0')
        await expect(h.service.assertDependencies(result.readiness.dependencies)).resolves.toBeUndefined()
        const legacy = await h.service.prepare(
            { ...template, manifest: { schemaVersion: 1, version: '1' } },
            'workspace'
        )
        expect(legacy.readiness.dependencies[0].version).toBe('3.0.0')
        await h.module.close()
    })
    it('pins the registry owner for an actually connected middleware', async () => {
        const h = await harness()
        jest.spyOn(h.module.get(AgentMiddlewareRegistry), 'getSource').mockReturnValue({
            kind: 'plugin',
            pluginName: '@test/dep',
            scopeKey: 'org'
        })
        const result = await h.service.prepare(
            {
                ...base,
                manifest: { schemaVersion: 2, version: '1' },
                export_data: `team: {type: agent}
nodes:
  - {key: a, type: agent, entity: {key: a}}
  - {key: m, type: workflow, entity: {key: m, type: middleware, provider: Example}}
connections: [{key: a/m, from: a, to: m, type: workflow}]
`
            },
            'workspace'
        )
        expect(result.readiness.dependencies).toMatchObject([
            { pluginName: '@test/dep', version: '2.0.0', providers: [{ kind: 'middleware', key: 'Example' }] }
        ])
        await expect(h.service.assertDependencies(result.readiness.dependencies)).resolves.toBeUndefined()
        jest.spyOn(h.module.get(AgentMiddlewareRegistry), 'getSource').mockReturnValue({
            kind: 'builtin',
            scopeKey: SYSTEM_GLOBAL_SCOPE
        })
        await expect(h.service.assertDependencies(result.readiness.dependencies)).rejects.toThrow()
        await h.module.close()
    })
})
