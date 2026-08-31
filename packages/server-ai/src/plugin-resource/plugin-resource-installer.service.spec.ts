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

jest.mock('../skill-package/skill-package.entity', () => ({
    SkillPackage: class SkillPackage {}
}))

jest.mock('../skill-package/skill-package.service', () => ({
    SkillPackageService: class SkillPackageService {}
}))

jest.mock('../xpert/xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../xpert/dto', () => ({
    XpertDraftDslDTO: class XpertDraftDslDTO {}
}))

jest.mock('../xpert-workspace', () => ({
    XpertWorkspaceAccessService: class XpertWorkspaceAccessService {}
}))

jest.mock('../xpert-template/xpert-template.service', () => ({
    XpertTemplateService: class XpertTemplateService {}
}))

jest.mock('../xpert-tool/xpert-tool.entity', () => ({
    XpertTool: class XpertTool {}
}))

jest.mock('../xpert-toolset/xpert-toolset.entity', () => ({
    XpertToolset: class XpertToolset {}
}))

jest.mock('../xpert-toolset/xpert-toolset.service', () => ({
    XpertToolsetService: class XpertToolsetService {}
}))

jest.mock('../mcp-publication/mcp-capability-catalog.service', () => ({
    McpCapabilityCatalogService: class McpCapabilityCatalogService {}
}))

jest.mock('./plugin-resource-installation.entity', () => ({
    PluginResourceInstallation: class PluginResourceInstallation {}
}))

import {
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_RESOURCE_ERROR_CODE,
    PLUGIN_RESOURCE_INSTALLATION_STATUS
} from '@xpert-ai/contracts'
import { NotFoundException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { collectPluginBundleComponents, readPluginBundleManifest } from '@xpert-ai/server-core'
import { resolvePluginAppResourceInstallationStatus } from './plugin-resource-app-status'
import {
    expandPluginRuntimeComponents,
    PluginResourceInstallerService,
    selectPluginResourceComponents
} from './plugin-resource-installer.service'
import { parsePluginMcpCapabilityDeclarations, parsePluginMcpServerConfig } from './plugin-mcp-server-contract'

describe('PluginResourceInstallerService helpers', () => {
    it('accepts a static capability descriptor file reference without starting the MCP server', () => {
        expect(
            parsePluginMcpServerConfig(
                {
                    type: 'stdio',
                    command: 'node',
                    capabilities: './dist/mcp-capabilities.json'
                },
                'demo'
            )
        ).toMatchObject({ capabilities: [], capabilitySource: './dist/mcp-capabilities.json' })
    })

    it('parses explicit capability descriptors and rejects incomplete behavior metadata', () => {
        const declaration = {
            descriptorVersion: 1,
            capabilityType: 'tool',
            capabilityKey: 'demo_validate_project',
            requiredContext: [],
            visibility: ['model'],
            inputSchema: { type: 'object' },
            behavior: { risk: 'read', sideEffect: 'none', idempotency: 'idempotent' },
            annotations: { readOnlyHint: true }
        }
        expect(parsePluginMcpCapabilityDeclarations([declaration], 'demo')).toEqual([declaration])
        expect(() =>
            parsePluginMcpCapabilityDeclarations(
                [{ ...declaration, behavior: { risk: 'read', sideEffect: 'none' } }],
                'demo'
            )
        ).toThrow("MCP component 'demo' capability at index 0 is invalid")
    })

    it('returns a stable error code when selected components do not match', () => {
        try {
            selectPluginResourceComponents(
                [
                    {
                        componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                        componentKey: 'officecli',
                        definitionHash: 'hash'
                    }
                ],
                [{ componentType: PLUGIN_COMPONENT_TYPE.SKILL, componentKey: 'missing' }],
                '@xpert-ai/plugin-office-cli'
            )
            throw new Error('Expected component selection to fail')
        } catch (error) {
            expect(error).toBeInstanceOf(NotFoundException)
            if (!(error instanceof NotFoundException)) {
                return
            }
            expect(error.getResponse()).toEqual(
                expect.objectContaining({
                    statusCode: 404,
                    errorCode: PLUGIN_RESOURCE_ERROR_CODE.NO_MATCHING_COMPONENTS
                })
            )
        }
    })

    it('expands one plugin skill to every selected target Agent', async () => {
        const resolved = expandPluginRuntimeComponents(
            [
                {
                    componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                    componentKey: 'example-engineering',
                    definitionHash: 'hash'
                }
            ],
            [
                {
                    componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                    componentKey: 'example-engineering',
                    targetAgentKey: 'Agent_Interpretation'
                },
                {
                    componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                    componentKey: 'example-engineering',
                    targetAgentKey: 'Agent_Outline'
                },
                {
                    componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                    componentKey: 'example-engineering',
                    targetAgentKey: 'Agent_Authoring'
                }
            ],
            '@acme/plugin-example-app',
            '/tmp/plugin',
            '1.2.3'
        )

        expect(resolved.map((item) => item.targetAgentKey)).toEqual([
            'Agent_Interpretation',
            'Agent_Outline',
            'Agent_Authoring'
        ])
        expect(resolved.every((item) => item.pluginVersion === '1.2.3')).toBe(true)
    })

    it('blocks app resources with placeholder connector ids', () => {
        expect(
            resolvePluginAppResourceInstallationStatus({
                id: 'REPLACE_WITH_SLACK_APP_OR_CONNECTOR_ID'
            })
        ).toBe(PLUGIN_RESOURCE_INSTALLATION_STATUS.BLOCKED)
    })

    it('marks on-install app resources as pending auth', () => {
        expect(
            resolvePluginAppResourceInstallationStatus({
                id: 'connector_246af0940da3457da0e751171dc1ce60',
                auth: {
                    policy: 'ON_INSTALL'
                }
            })
        ).toBe(PLUGIN_RESOURCE_INSTALLATION_STATUS.PENDING_AUTH)
    })

    it('marks regular app resources as ready', () => {
        expect(
            resolvePluginAppResourceInstallationStatus({
                id: 'connector_246af0940da3457da0e751171dc1ce60'
            })
        ).toBe(PLUGIN_RESOURCE_INSTALLATION_STATUS.READY)
    })

    it('installs a native plugin toolset once at organization scope', async () => {
        jest.mocked(collectPluginBundleComponents).mockReturnValue([
            {
                componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
                componentKey: 'cut',
                definitionHash: 'cut-native-hash',
                config: {
                    provider: 'cut',
                    name: 'Cut MCP Capabilities'
                }
            }
        ])
        jest.mocked(readPluginBundleManifest).mockReturnValue({ manifest: { name: '@xpert-ai/plugin-cut' } } as never)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const queryBuilder = {
            where: jest.fn(),
            andWhere: jest.fn(),
            getOne: jest.fn().mockResolvedValue(null)
        }
        queryBuilder.where.mockReturnValue(queryBuilder)
        queryBuilder.andWhere.mockReturnValue(queryBuilder)
        const installationRepo = {
            createQueryBuilder: jest.fn(() => queryBuilder),
            create: jest.fn((value) => value),
            save: jest.fn(async (value) => value)
        }
        const toolsetRepo = { find: jest.fn().mockResolvedValue([]) }
        const toolsetService = {
            createBuiltinToolset: jest.fn().mockResolvedValue({
                id: 'toolset-cut',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                type: 'cut'
            })
        }
        const capabilityCatalog = { discoverAndReplaceMcpToolset: jest.fn().mockResolvedValue([]) }
        const service = new PluginResourceInstallerService(
            installationRepo as never,
            {} as never,
            toolsetRepo as never,
            {} as never,
            {} as never,
            {} as never,
            toolsetService as never,
            capabilityCatalog as never,
            {} as never,
            [{ name: '@xpert-ai/plugin-cut', scopeKey: 'org-1', baseDir: '/tmp/plugin' }] as never
        )

        const result = await service.installToOrganization('@xpert-ai/plugin-cut')

        expect(toolsetService.createBuiltinToolset).toHaveBeenCalledWith(
            'cut',
            expect.objectContaining({
                name: 'Cut MCP Capabilities',
                options: expect.objectContaining({
                    pluginManaged: true,
                    pluginName: '@xpert-ai/plugin-cut',
                    componentKey: 'cut'
                })
            })
        )
        expect(capabilityCatalog.discoverAndReplaceMcpToolset).toHaveBeenCalledWith('toolset-cut')
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('installation.tenantId = :installationTenantId', {
            installationTenantId: 'tenant-1'
        })
        expect(queryBuilder.andWhere).toHaveBeenCalledWith(
            'installation.organizationId = :installationOrganizationId',
            {
                installationOrganizationId: 'org-1'
            }
        )
        expect(installationRepo.create).toHaveBeenCalledWith(
            expect.not.objectContaining({ workspaceId: expect.anything() })
        )
        expect(result.installations).toHaveLength(1)
    })
})
