jest.mock('@xpert-ai/plugin-sdk', () => ({
	GLOBAL_ORGANIZATION_SCOPE: '__global__'
}))

import { GLOBAL_ORGANIZATION_SCOPE } from '@xpert-ai/plugin-sdk'
import { buildOrganizationPluginConfigs } from './plugin-instance.loader'

describe('plugin instance loader', () => {
	it('restores code plugins by package name instead of a versioned npm spec', () => {
		const configs = buildOrganizationPluginConfigs([
			{
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-code-demo',
				packageName: '@xpert-ai/plugin-code-demo',
				version: '1.2.3',
				source: 'code',
				sourceConfig: {
					workspacePath: '/tmp/workspaces/plugin-code-demo'
				},
				level: 'organization',
				config: {}
			},
			{
				organizationId: 'org-1',
				pluginName: '@xpert-ai/plugin-market-demo',
				packageName: '@xpert-ai/plugin-market-demo',
				version: '2.0.0',
				source: 'marketplace',
				sourceConfig: null,
				level: 'organization',
				config: {}
			}
		])

		expect(configs).toEqual([
			{
				organizationId: 'org-1',
				plugins: [
					{
						name: '@xpert-ai/plugin-code-demo',
						version: '1.2.3',
						source: 'code',
						sourceConfig: {
							workspacePath: '/tmp/workspaces/plugin-code-demo'
						},
						level: 'organization'
					},
					{
						name: '@xpert-ai/plugin-market-demo@2.0.0',
						version: '2.0.0',
						source: 'marketplace',
						sourceConfig: null,
						level: 'organization'
					}
				],
				configs: {
					'@xpert-ai/plugin-code-demo': {},
					'@xpert-ai/plugin-market-demo': {}
				}
			}
		])
	})

	it('falls back to the global organization scope for persisted global plugins', () => {
		const configs = buildOrganizationPluginConfigs([
			{
				organizationId: null,
				pluginName: '@xpert-ai/plugin-global-demo',
				packageName: '@xpert-ai/plugin-global-demo',
				version: '1.0.0',
				source: 'marketplace',
				sourceConfig: null,
				level: 'organization',
				config: {}
			}
		])

		expect(configs).toEqual([
			{
				organizationId: GLOBAL_ORGANIZATION_SCOPE,
				plugins: [
					{
						name: '@xpert-ai/plugin-global-demo@1.0.0',
						version: '1.0.0',
						source: 'marketplace',
						sourceConfig: null,
						level: 'organization'
					}
				],
				configs: {
					'@xpert-ai/plugin-global-demo': {}
				}
			}
		])
	})
})
