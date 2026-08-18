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

import {
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_RESOURCE_ERROR_CODE,
    PLUGIN_RESOURCE_INSTALLATION_STATUS
} from '@xpert-ai/contracts'
import { NotFoundException } from '@nestjs/common'
import { resolvePluginAppResourceInstallationStatus } from './plugin-resource-app-status'
import { selectPluginResourceComponents } from './plugin-resource-installer.service'

describe('PluginResourceInstallerService helpers', () => {
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
