jest.mock('../plugin-resource-installer.service', () => ({ PluginResourceInstallerService: class {} }))
jest.mock('../../xpert/xpert.service', () => ({ XpertService: class {} }))
jest.mock('../../xpert-workspace/workspace-access.service', () => ({ XpertWorkspaceAccessService: class {} }))
jest.mock('../../xpert-toolset/xpert-toolset.entity', () => ({ XpertToolset: class {} }))
import { Test } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
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
import {
    IXpert,
    XpertToolsetCategoryEnum,
    TXpertTemplate,
    XpertTypeEnum,
    type TXpertSandboxFeature,
    type TemplateDependencyLock
} from '@xpert-ai/contracts'
import { PluginResourceInstallerService } from '../plugin-resource-installer.service'
import { XpertService } from '../../xpert/xpert.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { TemplateReadinessService, AssertAssistantTemplateDependenciesHandler } from './template-readiness.service'
import { AssertAssistantTemplateDependenciesCommand } from './template-readiness.command'
import { AssertAgentPluginTemplateDependencyCommand } from '../../agent-plugin/templates/agent-plugin-template.command'
import { AgentPluginStorageException } from '../../agent-plugin/agent-plugin-storage-error'
import { InstallationSourceChangedError } from './template-installation-source'
import { AssertProjectAssistantAccessCommand } from '../../xpert-project/commands/assert-project-assistant-access.command'
import { ResolveAssistantFileAccessCommand } from '../../xpert/assistant-files/resolve-assistant-file-access.command'

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
    async function harness(providers: string[] = []) {
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
                AssertAssistantTemplateDependenciesHandler,
                { provide: CommandBus, useValue: { execute: jest.fn() } },
                ...[AgentMiddlewareRegistry, SandboxProviderRegistry, ToolsetRegistry].map((provide) => ({
                    provide,
                    useValue: { get: (key: string) => ({ key }), getSource: () => ({ kind: 'builtin' }) }
                })),
                { provide: LOADED_PLUGINS, useValue: loaded },
                { provide: PluginResourceInstallerService, useValue: installer },
                { provide: XpertWorkspaceAccessService, useValue: access },
                {
                    provide: XpertService,
                    useValue: { getSandboxProviders: async () => providers.map((type) => ({ type })) }
                },
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

    it('preserves an installed toolset among same-provider accounts without relaxing new installation checks', async () => {
        const { service, module } = await harness()
        const repository = module.get(getRepositoryToken(XpertToolset))
        repository.find.mockResolvedValue([{ id: 'selected' }, { id: 'other' }])
        const template = {
            ...base,
            dependencies: {
                toolsets: [
                    {
                        pluginName: '@test/dep',
                        provider: 'images',
                        templateNodeKey: 'template-images'
                    }
                ]
            }
        }
        const installed = (ids: string[]): IXpert =>
            ({
                id: 'assistant',
                workspaceId: 'workspace',
                graph: {
                    nodes: ids.map((id) => ({
                        key: id,
                        type: 'toolset',
                        position: { x: 0, y: 0 },
                        entity: {
                            id,
                            name: 'images',
                            type: 'images',
                            category: XpertToolsetCategoryEnum.BUILTIN
                        }
                    })),
                    connections: []
                }
            }) as IXpert
        const check = async (assistant?: IXpert) =>
            (await service.inspect(template, 'workspace', assistant)).readiness.checks.find(
                (item) => item.key === 'toolset:images'
            )?.status
        expect(await check()).toBe('missing')
        expect(await check(installed(['selected']))).toBe('ready')
        expect(await check(installed(['selected', 'other']))).toBe('missing')
        repository.find.mockResolvedValue([{ id: 'other' }])
        expect(await check(installed(['selected']))).toBe('missing')
        expect(repository.find).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    workspaceId: 'workspace',
                    tenantId: 'tenant',
                    organizationId: 'org',
                    type: 'images'
                })
            })
        )
        await expect(service.inspect(template, 'different', installed(['selected']))).rejects.toThrow('workspace')
    })

    const sandboxTemplate = (sandbox: TXpertSandboxFeature): TXpertTemplate => ({
        ...base,
        export_data: JSON.stringify({
            team: { name: 'test', type: 'agent', agent: { key: 'primary' }, features: { sandbox } },
            nodes: [{ key: 'primary', type: 'agent', entity: { key: 'primary' }, position: { x: 0, y: 0 } }],
            connections: [],
            template: { schemaVersion: 2, manifest: { schemaVersion: 2, version: '1' } }
        })
    })

    it('binds the authorized parent provider before checking and pinning runtime dependencies', async () => {
        const h = await harness(['nsjail'])
        jest.spyOn(h.module.get(SandboxProviderRegistry), 'getSource').mockReturnValue({
            kind: 'plugin',
            pluginName: '@test/dep',
            pluginVersion: '2.0.0',
            scopeKey: 'org'
        })
        const template = sandboxTemplate({ enabled: true })
        const result = await h.service.prepareRuntime(
            template,
            'assistant',
            'workspace',
            undefined,
            undefined,
            'nsjail'
        )
        expect(result.normalized.definition.team.features.sandbox).toEqual({ enabled: true, provider: 'nsjail' })
        expect(result.readiness.dependencies).toContainEqual(
            expect.objectContaining({
                pluginName: '@test/dep',
                version: '2.0.0',
                providers: [{ kind: 'sandbox', key: 'nsjail' }]
            })
        )
        expect(template.export_data).not.toContain('nsjail')
        h.loaded[1] = plugin('org', '3.0.0')
        await expect(
            h.service.prepareRuntime(
                template,
                'assistant',
                'workspace',
                result.readiness.dependencies,
                undefined,
                'nsjail'
            )
        ).rejects.toThrow()
        await h.module.close()
    })

    it('preserves a template provider and never enables a disabled template sandbox', async () => {
        const h = await harness(['nsjail', 'other-sandbox'])
        for (const sandbox of [{ enabled: true, provider: 'nsjail' }, { enabled: false }]) {
            const result = await h.service.prepareRuntime(
                sandboxTemplate(sandbox),
                'assistant',
                'workspace',
                undefined,
                undefined,
                'other-sandbox'
            )
            expect(result.normalized.definition.team.features.sandbox).toEqual(sandbox)
        }
        await h.module.close()
    })

    it.each([undefined, 'missing-provider', 'local-shell-sandbox'])(
        'rejects an unconfigured or unavailable runtime provider: %s',
        async (provider) => {
            const h = await harness(['nsjail', 'local-shell-sandbox'])
            await expect(
                h.service.prepareRuntime(
                    sandboxTemplate({ enabled: true }),
                    'assistant',
                    'workspace',
                    undefined,
                    undefined,
                    provider
                )
            ).rejects.toThrow()
            await h.module.close()
        }
    )

    it.each([undefined, 'project'])(
        'reauthorizes runtime preparation in its actual task workspace: %s',
        async (projectId) => {
            const h = await harness()
            const commands = h.module.get(CommandBus)
            await h.service.prepareRuntime(base, 'assistant', 'workspace', undefined, projectId)
            expect(commands.execute).toHaveBeenCalledWith(
                projectId
                    ? new AssertProjectAssistantAccessCommand(projectId, 'assistant')
                    : new ResolveAssistantFileAccessCommand('assistant', 'capabilities', 'runtime')
            )
            expect(h.access.assertCanAuthor).not.toHaveBeenCalled()
            jest.mocked(commands.execute).mockRejectedValueOnce(new Error('revoked'))
            await expect(
                h.service.prepareRuntime(base, 'assistant', 'workspace', undefined, projectId)
            ).rejects.toThrow('revoked')
            await h.module.close()
        }
    )

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
    it('keeps exact installation/recovery checks while allowing ordinary runtime version drift', async () => {
        const h = await harness(),
            template = { ...base, dependencies: { plugins: ['@test/dep'] } }
        const result = await h.service.prepare(template, 'workspace')
        await expect(h.service.assertDependencies(result.readiness.dependencies)).resolves.toBeUndefined()
        h.loaded[1] = plugin('org', '3.0.0')
        await expect(h.service.prepare(template, 'workspace', result.readiness.dependencies)).rejects.toBeInstanceOf(
            InstallationSourceChangedError
        )
        await expect(h.service.assertDependencies(result.readiness.dependencies)).rejects.toThrow()
        await expect(h.service.inspectRuntimeDependencies(result.readiness.dependencies)).resolves.toEqual({
            updates: [
                { pluginName: '@test/dep', installedVersion: '2.0.0', currentVersion: '3.0.0', changedComponents: [] }
            ]
        })
        await h.module.close()
    })

    it('runs the production Bid 0.6.62 publication on 0.6.63 and recommends the changed skill', async () => {
        const h = await harness()
        h.loaded.splice(0, h.loaded.length, { ...plugin('org', '0.6.63'), name: '@xpert-ai/plugin-bid' })
        jest.spyOn(h.module.get(AgentMiddlewareRegistry), 'getSource').mockReturnValue({
            kind: 'plugin',
            pluginName: '@xpert-ai/plugin-bid',
            pluginVersion: '0.6.63',
            scopeKey: 'org'
        })
        h.installer.resolveRuntimeComponents.mockResolvedValueOnce([
            {
                pluginName: '@xpert-ai/plugin-bid',
                pluginVersion: '0.6.63',
                rootDir: '/private/plugin/root',
                component: {
                    componentType: 'skill',
                    componentKey: 'bid-workflow-coordination',
                    definitionHash: 'new-hash'
                }
            }
        ])
        const locks: TemplateDependencyLock[] = [
            {
                pluginName: '@xpert-ai/plugin-bid',
                version: '0.6.62',
                providers: [{ kind: 'middleware', key: 'BidStudio' }],
                components: [{ type: 'skill', key: 'bid-workflow-coordination', hash: 'old-hash' }]
            }
        ]
        const before = structuredClone(locks)
        const result = await h.service.inspectRuntimeDependencies(locks)
        expect(result).toEqual({
            updates: [
                {
                    pluginName: '@xpert-ai/plugin-bid',
                    installedVersion: '0.6.62',
                    currentVersion: '0.6.63',
                    changedComponents: [{ type: 'skill', key: 'bid-workflow-coordination' }]
                }
            ]
        })
        expect(locks).toEqual(before)
        expect(JSON.stringify(result)).not.toContain('/private')
        await h.module.close()
    })

    it('does not recommend updates for unchanged dependencies or inspect unrelated components', async () => {
        const h = await harness()
        const result = await h.service.inspectRuntimeDependencies([
            {
                pluginName: '@test/dep',
                version: '2.0.0',
                components: [{ type: 'skill', key: 'selected', hash: 'hash-a' }]
            }
        ])
        expect(result).toEqual({ updates: [] })
        expect(h.installer.resolveRuntimeComponents).toHaveBeenCalledTimes(1)
        expect(h.installer.resolveRuntimeComponents).toHaveBeenCalledWith('@test/dep', [
            { componentType: 'skill', componentKey: 'selected' }
        ])
        await h.module.close()
    })

    it('treats a changed resource hash as advice even when the package version is unchanged', async () => {
        const h = await harness()
        const locks: TemplateDependencyLock[] = [
            { pluginName: '@test/dep', version: '2.0.0', components: [{ type: 'skill', key: 'selected', hash: 'old' }] }
        ]
        await expect(h.service.assertDependencies(locks)).rejects.toThrow()
        await expect(h.service.inspectRuntimeDependencies(locks)).resolves.toMatchObject({
            updates: [{ changedComponents: [{ type: 'skill', key: 'selected' }] }]
        })
        await h.module.close()
    })

    it.each([
        'AGENT_PLUGIN_STORAGE_MISSING',
        'AGENT_PLUGIN_STORAGE_UNREADABLE',
        'AGENT_PLUGIN_STORAGE_CORRUPT'
    ] as const)('preserves %s through readiness, installation locks and runtime checks', async (code) => {
        const h = await harness()
        const failure = new AgentPluginStorageException(code)
        h.module.get(CommandBus).execute = jest.fn().mockRejectedValue(failure)
        const source = {
            kind: 'agent-plugin' as const,
            name: 'example',
            digest: 'digest',
            bindingId: 'binding',
            bindingVersion: 'binding-version'
        }
        const locks: TemplateDependencyLock[] = [{ pluginName: 'example', version: 'digest', source, components: [] }]
        await expect(
            h.service.inspect({ ...base, dependencies: { skills: [{ componentKey: 'hello', source }] } })
        ).rejects.toBe(failure)
        await expect(h.service.assertDependencies(locks)).rejects.toBe(failure)
        await expect(h.service.inspectRuntimeDependencies(locks)).rejects.toBe(failure)
        await h.module.close()
    })

    it('preserves explicit version requirements rather than silently downgrading them to recommendations', async () => {
        const h = await harness()
        const result = await h.service.prepare(
            { ...base, dependencies: { versions: [{ pluginName: '@test/dep', version: '2.0.0' }] } },
            'workspace'
        )
        expect(result.readiness.dependencies[0].requiredVersion).toBe('2.0.0')
        await expect(h.service.inspectRuntimeDependencies(result.readiness.dependencies)).resolves.toEqual({
            updates: []
        })
        h.loaded[1] = plugin('org', '2.0.1')
        await expect(h.service.inspectRuntimeDependencies(result.readiness.dependencies)).rejects.toMatchObject({
            response: {
                code: 'ASSISTANT_DEPENDENCY_UNAVAILABLE',
                reason: 'version-required',
                dependency: '@test/dep',
                expectedVersion: '2.0.0',
                actualVersion: '2.0.1'
            }
        })
        await h.module.close()
    })

    it.each(['middleware', 'sandbox', 'toolset'] as const)(
        'checks actual %s availability, owner and loaded registration, not the old binding version',
        async (kind) => {
            const h = await harness()
            const registry = h.module.get(
                kind === 'middleware'
                    ? AgentMiddlewareRegistry
                    : kind === 'sandbox'
                      ? SandboxProviderRegistry
                      : ToolsetRegistry
            )
            const locks: TemplateDependencyLock[] = [
                { pluginName: '@test/dep', version: '1.0.0', components: [], providers: [{ kind, key: 'used' }] }
            ]
            const getSource = jest
                .spyOn(registry, 'getSource')
                .mockReturnValue({ kind: 'plugin', pluginName: '@test/dep', pluginVersion: '2.0.0', scopeKey: 'org' })
            await expect(h.service.inspectRuntimeDependencies(locks)).resolves.toMatchObject({
                updates: [{ currentVersion: '2.0.0' }]
            })
            getSource.mockReturnValue({ kind: 'plugin', pluginName: '@other/dep', scopeKey: 'org' })
            await expect(h.service.inspectRuntimeDependencies(locks)).rejects.toMatchObject({
                response: { reason: 'provider-owner-changed' }
            })
            getSource.mockReturnValue({
                kind: 'plugin',
                pluginName: '@test/dep',
                pluginVersion: '1.0.0',
                scopeKey: 'org'
            })
            await expect(h.service.inspectRuntimeDependencies(locks)).rejects.toMatchObject({
                response: { reason: 'provider-not-ready' }
            })
            jest.spyOn(registry, 'get').mockImplementation(() => {
                throw new Error('missing')
            })
            await expect(h.service.inspectRuntimeDependencies(locks)).rejects.toMatchObject({
                response: { reason: 'provider-unavailable', dependency: `@test/dep/${kind}:used` }
            })
            await h.module.close()
        }
    )

    it('still rejects missing dependencies in the authorized scope and partially activated resources', async () => {
        const h = await harness()
        const locks: TemplateDependencyLock[] = [
            { pluginName: '@test/dep', version: '1.0.0', components: [{ type: 'skill', key: 'missing', hash: 'old' }] }
        ]
        await expect(h.service.inspectRuntimeDependencies(locks)).rejects.toMatchObject({
            response: { reason: 'resource-unavailable', dependency: '@test/dep/skill:missing' }
        })
        h.installer.resolveRuntimeComponents.mockRejectedValueOnce(new NotFoundException('not found'))
        await expect(h.service.inspectRuntimeDependencies(locks)).rejects.toMatchObject({
            response: { reason: 'resource-unavailable' }
        })
        const denied = new ForbiddenException('denied')
        h.installer.resolveRuntimeComponents.mockRejectedValueOnce(denied)
        await expect(h.service.inspectRuntimeDependencies(locks)).rejects.toBe(denied)
        const storage = new Error('storage unavailable')
        h.installer.resolveRuntimeComponents.mockRejectedValueOnce(storage)
        await expect(h.service.inspectRuntimeDependencies(locks)).rejects.toBe(storage)
        h.loaded[1] = plugin('org', '3.0.0')
        locks[0].components[0].key = 'selected'
        await expect(h.service.inspectRuntimeDependencies(locks)).rejects.toMatchObject({
            response: { reason: 'resource-not-ready' }
        })
        h.loaded.splice(0, h.loaded.length, plugin('another-org', '1.0.0'))
        await expect(h.service.inspectRuntimeDependencies(locks)).rejects.toMatchObject({
            response: { reason: 'plugin-unavailable' }
        })
        await h.module.close()
    })

    it('keeps immutable agent-plugin digest verification in runtime', async () => {
        const h = await harness()
        const commands = h.module.get(CommandBus)
        const lock: TemplateDependencyLock = {
            pluginName: 'agent-plugin:skills',
            version: 'digest',
            components: [],
            source: {
                kind: 'agent-plugin',
                name: 'skills',
                digest: 'digest',
                bindingId: 'binding',
                bindingVersion: '1'
            }
        }
        await expect(h.service.inspectRuntimeDependencies([lock])).resolves.toEqual({ updates: [] })
        expect(commands.execute).toHaveBeenCalledWith(new AssertAgentPluginTemplateDependencyCommand(lock))
        const corrupt = new BadRequestException('integrity failure')
        jest.mocked(commands.execute).mockRejectedValueOnce(corrupt)
        await expect(h.service.inspectRuntimeDependencies([lock])).rejects.toBe(corrupt)
        await h.module.close()
    })

    it.each(['runtime', 'authoring'] as const)(
        'reauthorizes the exact Assistant before reporting %s recommendations',
        async (entry) => {
            const h = await harness()
            const commands = h.module.get(CommandBus)
            jest.mocked(commands.execute).mockResolvedValueOnce({
                dependencyLocks: [{ pluginName: '@test/dep', version: '1.0.0', components: [] }]
            })
            const handler = h.module.get(AssertAssistantTemplateDependenciesHandler)
            await expect(
                handler.execute(new AssertAssistantTemplateDependenciesCommand('assistant', entry))
            ).resolves.toMatchObject({ updates: [{ currentVersion: '2.0.0' }] })
            expect(commands.execute).toHaveBeenCalledWith(
                new ResolveAssistantFileAccessCommand('assistant', 'capabilities', entry)
            )
            const revoked = new ForbiddenException('revoked')
            jest.mocked(commands.execute).mockRejectedValueOnce(revoked)
            await expect(
                handler.execute(new AssertAssistantTemplateDependenciesCommand('assistant', entry))
            ).rejects.toBe(revoked)
            await h.module.close()
        }
    )
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
