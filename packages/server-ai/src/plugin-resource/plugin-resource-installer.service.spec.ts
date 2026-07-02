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

jest.mock('./plugin-resource-installation.entity', () => ({
    PluginResourceInstallation: class PluginResourceInstallation {}
}))

import { PLUGIN_RESOURCE_INSTALLATION_STATUS } from '@xpert-ai/contracts'
import { resolvePluginAppResourceInstallationStatus } from './plugin-resource-app-status'

describe('PluginResourceInstallerService helpers', () => {
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
})
