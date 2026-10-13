import { ResolvePluginArtifactNamespaceQuery } from '../resolve-plugin-artifact-namespace.query'
import { NotFoundException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolvePluginArtifactNamespaceHandler } from './resolve-plugin-artifact-namespace.handler'

jest.mock('../../plugin-management.service', () => ({ PluginManagementService: class {} }))

describe('registered application namespaces', () => {
	afterEach(() => jest.restoreAllMocks())
	it('uses the current installation scope and registered namespace, including underscores', async () => {
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
		const findLoadedPlugin = jest
			.fn()
			.mockReturnValue({ instance: { meta: { artifactNamespace: 'meeting_notes' } } })
		const handler = new ResolvePluginArtifactNamespaceHandler({ findLoadedPlugin })
		expect(await handler.execute(new ResolvePluginArtifactNamespaceQuery('@vendor/meetings'))).toBe('meeting_notes')
		expect(findLoadedPlugin).toHaveBeenCalledWith('@vendor/meetings', 'organization', true, 'tenant')
	})
	it.each([undefined, '', '../escape', 'Wrong', 'has-dash', 'another/plugin'])(
		'rejects unavailable or invalid namespaces: %s',
		async (namespace) => {
			const handler = new ResolvePluginArtifactNamespaceHandler({
				findLoadedPlugin: jest.fn().mockReturnValue({ instance: { meta: { artifactNamespace: namespace } } })
			})
			await expect(handler.execute(new ResolvePluginArtifactNamespaceQuery('plugin'))).rejects.toThrow(
				NotFoundException
			)
		}
	)
})
