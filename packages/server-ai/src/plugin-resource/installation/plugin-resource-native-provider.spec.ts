jest.mock('@nestjs/typeorm', () => ({
    InjectRepository: () => () => undefined,
    TypeOrmModule: {
        forFeature: () => ({}),
        forFeatureAsync: () => ({}),
        forRoot: () => ({}),
        forRootAsync: () => ({})
    }
}))

jest.mock('@xpert-ai/server-core', () => ({
    collectPluginBundleComponents: jest.fn(() => []),
    LOADED_PLUGINS: Symbol('LOADED_PLUGINS'),
    normalizePluginName: (value: string) => value?.trim(),
    readPluginBundleManifest: jest.fn(() => null),
    resolveLoadedPluginBundleRoot: jest.fn(() => '/tmp/plugin')
}))

jest.mock('../../skill-package/skill-package.entity', () => ({
    SkillPackage: class SkillPackage {}
}))

jest.mock('../../skill-package/skill-package.service', () => ({
    SkillPackageService: class SkillPackageService {}
}))

jest.mock('../../xpert/xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../xpert/dto', () => ({
    XpertDraftDslDTO: class XpertDraftDslDTO {}
}))

jest.mock('../../xpert-workspace', () => ({
    XpertWorkspaceAccessService: class XpertWorkspaceAccessService {}
}))

jest.mock('../../xpert-template/xpert-template.service', () => ({
    XpertTemplateService: class XpertTemplateService {}
}))

jest.mock('../../xpert-tool/xpert-tool.entity', () => ({
    XpertTool: class XpertTool {}
}))

jest.mock('../../xpert-toolset/xpert-toolset.entity', () => ({
    XpertToolset: class XpertToolset {}
}))

jest.mock('../../xpert-toolset/xpert-toolset.service', () => ({
    XpertToolsetService: class XpertToolsetService {}
}))

jest.mock('../../mcp-publication/mcp-capability-catalog.service', () => ({
    McpCapabilityCatalogService: class McpCapabilityCatalogService {}
}))

jest.mock('../plugin-resource-installation.entity', () => ({
    PluginResourceInstallation: class PluginResourceInstallation {}
}))

import { z } from 'zod/v3'
import { NotFoundException } from '@nestjs/common'
import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import { PLUGIN_COMPONENT_TYPE, RequestScopeLevel } from '@xpert-ai/contracts'
import { RequestContext, XpertTool, XpertToolProvider, XpertToolProviderRegistry, runtimeToolProviderComponent } from '@xpert-ai/plugin-sdk'
import {
    collectPluginBundleComponents,
    readPluginBundleManifest,
    resolveLoadedPluginBundleRoot
} from '@xpert-ai/server-core'
import { PluginResourceInstallerService } from './plugin-resource-installer.service'
import { requirePluginResourceRoot } from '../catalog/plugin-resource-components'

@XpertToolProvider({ provider: 'native', componentKey: 'tools', name: 'Native tools' })
class NativeProvider {
    validateConfig(config: unknown) {
        z.object({}).strict().parse(config)
    }

    @XpertTool({
        name: 'probe',
        description: 'Fixture capability',
        inputSchema: z.object({}).strict(),
        outputSchema: z.object({ ok: z.boolean() }).strict(),
        mcp: { behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' }, requiredContext: ['principal'] }
    })
    probe() {
        return { ok: true }
    }
}

const pluginName = '@test/native'
const registration = {
    strategy: new NativeProvider(),
    source: { kind: 'plugin' as const, pluginName, pluginVersion: '2.0.0', scopeKey: 'org-1' }
}

function fixture(loaded = true) {
    const query = { where: jest.fn(), andWhere: jest.fn(), getOne: jest.fn().mockResolvedValue(null) }
    query.where.mockReturnValue(query)
    query.andWhere.mockReturnValue(query)
    const repository = { createQueryBuilder: () => query, create: jest.fn((value) => value), save: jest.fn(async (value) => value) }
    const toolsets = { find: jest.fn().mockResolvedValue([]), create: jest.fn((value) => value) }
    const toolsetService = { createBuiltinToolset: jest.fn().mockResolvedValue({ id: 'native-toolset' }) }
    const capabilityCatalog = { discoverAndReplaceMcpToolset: jest.fn().mockResolvedValue([]) }
    const registry = new XpertToolProviderRegistry(new DiscoveryService(new ModulesContainer()), new Reflector())
    registry.register('native', registration.strategy, registration.source)
    const service = new PluginResourceInstallerService(
        repository as never,
        {} as never,
        toolsets as never,
        {} as never,
        {} as never,
        {} as never,
        toolsetService as never,
        capabilityCatalog as never,
        {} as never,
        registry,
        loaded ? ([{ name: pluginName, scopeKey: 'org-1' }] as never) : []
    )
    return { service, repository, registry, toolsetService, capabilityCatalog }
}

describe('Manifestless native plugin resources', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'getScope').mockReturnValue({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            level: RequestScopeLevel.ORGANIZATION
        })
        jest.mocked(resolveLoadedPluginBundleRoot).mockReturnValue(null)
        jest.mocked(readPluginBundleManifest).mockReturnValue(null)
        jest.mocked(collectPluginBundleComponents).mockReturnValue([])
    })
    afterEach(() => jest.restoreAllMocks())

    it('discovers native providers without reading a portable manifest, preserving registry version and selector cardinality', async () => {
        const { service } = fixture()
        jest.mocked(readPluginBundleManifest).mockClear()
        const components = await service.resolveRuntimeComponents(pluginName, undefined, 'organization')
        expect(components).toEqual([
            expect.objectContaining({
                rootDir: null,
                pluginVersion: '2.0.0',
                component: expect.objectContaining({
                    componentKey: 'tools',
                    componentType: PLUGIN_COMPONENT_TYPE.TOOLSET
                })
            })
        ])
        expect(readPluginBundleManifest).not.toHaveBeenCalled()
        const selected = await service.resolveRuntimeComponents(
            pluginName,
            [
                { componentKey: 'tools', targetAgentKey: 'first' },
                { componentKey: 'tools', targetAgentKey: 'second' }
            ],
            'organization'
        )
        expect(selected.map(({ targetAgentKey, pluginVersion }) => [targetAgentKey, pluginVersion])).toEqual([
            ['first', '2.0.0'],
            ['second', '2.0.0']
        ])
    })

    it('installs a registered native provider without a portable filesystem root', async () => {
        const { service } = fixture()
        const install = jest.spyOn(service, 'installRuntimeComponent').mockResolvedValue({ id: 'installed' } as never)
        await expect(
            service.installRegisteredRuntimeToolProviderToOrganization({
                pluginName,
                componentKey: 'tools',
                provider: 'native',
                sourceScopeKey: 'org-1'
            })
        ).resolves.toMatchObject({ installation: { id: 'installed' } })
        expect(install).toHaveBeenCalledWith(
            expect.objectContaining({ rootDir: null, pluginVersion: '2.0.0' }),
            null,
            null,
            null,
            false
        )
    })

    it('creates a scoped Toolset and installation through the normal organization install path', async () => {
        const { service, repository, toolsetService, capabilityCatalog } = fixture()
        const result = await service.installToOrganization(pluginName)
        expect(result.installations).toEqual([
            expect.objectContaining({
                tenantId: 'tenant-1', organizationId: 'org-1', pluginName,
                componentKey: 'tools', runtimeId: 'native-toolset', enabled: true
            })
        ])
        expect(toolsetService.createBuiltinToolset).toHaveBeenCalledWith('native', expect.objectContaining({
            options: expect.objectContaining({ pluginManaged: true, pluginName, componentKey: 'tools' })
        }))
        expect(capabilityCatalog.discoverAndReplaceMcpToolset).toHaveBeenCalledWith('native-toolset')
        expect(repository.save).toHaveBeenCalledTimes(1)
    })

    it('does not discover another organization provider through the real registry', async () => {
        const { service, registry, repository } = fixture()
        registry.unregister('native', registration.source, registration.strategy)
        registry.register('native', registration.strategy, { ...registration.source, scopeKey: 'another-org' })
        await expect(service.installToOrganization(pluginName)).rejects.toBeInstanceOf(NotFoundException)
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('rejects file-based skills without a resource root before saving an installation', async () => {
        const { service, repository } = fixture()
        await expect(service.installRuntimeComponent({
            pluginName, rootDir: null,
            component: {
                componentKey: 'skill', componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                sourcePath: 'SKILL.md', definitionHash: 'skill-definition'
            }
        }, 'workspace-1', null)).rejects.toBeInstanceOf(NotFoundException)
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('prefers native descriptors and registry version to a duplicate portable declaration', async () => {
        jest.mocked(resolveLoadedPluginBundleRoot).mockReturnValue('/tmp/plugin')
        jest.mocked(readPluginBundleManifest).mockReturnValue({
            manifest: { name: pluginName, version: '1.0.0' }
        } as never)
        jest.mocked(collectPluginBundleComponents).mockReturnValue([
            { componentType: PLUGIN_COMPONENT_TYPE.TOOLSET, componentKey: 'tools', definitionHash: 'stale' }
        ])
        const { service } = fixture()
        const components = await service.resolveRuntimeComponents(pluginName, undefined, 'organization')
        expect(components).toHaveLength(1)
        expect(components[0].component).toEqual(runtimeToolProviderComponent(registration.strategy))
        expect(components[0].pluginVersion).toBe('2.0.0')
    })

    it('rejects an unloaded provider even if a registry entry remains', async () => {
        const { service } = fixture(false)
        await expect(service.resolveRuntimeComponents(pluginName)).rejects.toBeInstanceOf(NotFoundException)
        await expect(
            service.installRegisteredRuntimeToolProviderToOrganization({
                pluginName,
                componentKey: 'tools',
                provider: 'native',
                sourceScopeKey: 'org-1'
            })
        ).rejects.toBeInstanceOf(NotFoundException)
    })

    it.each([
        { sourceScopeKey: 'another-org' },
        { provider: 'another-provider' },
        { pluginName: '@test/another' },
        { componentKey: 'another-component' }
    ])('rejects a mismatched runtime identity %j before any writes', async (override) => {
        const { service, repository } = fixture()
        const install = jest.spyOn(service, 'installRuntimeComponent')
        await expect(
            service.installRegisteredRuntimeToolProviderToOrganization({
                pluginName,
                componentKey: 'tools',
                provider: 'native',
                sourceScopeKey: 'org-1',
                ...override
            })
        ).rejects.toThrow()
        expect(install).not.toHaveBeenCalled()
        expect(repository.save).not.toHaveBeenCalled()
    })

    it('does not substitute cwd for a missing filesystem root', () => {
        expect(() => requirePluginResourceRoot(null)).toThrow(NotFoundException)
        expect(() => requirePluginResourceRoot(undefined)).toThrow(NotFoundException)
        expect(requirePluginResourceRoot('/tmp/plugin')).toBe('/tmp/plugin')
    })
})
