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
