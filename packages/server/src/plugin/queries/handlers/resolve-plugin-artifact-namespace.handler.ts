import { ResolvePluginArtifactNamespaceQuery } from '../resolve-plugin-artifact-namespace.query'
import { Inject, NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { isPluginArtifactNamespace, RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { PluginManagementService } from '../../plugin-management.service'

@QueryHandler(ResolvePluginArtifactNamespaceQuery)
export class ResolvePluginArtifactNamespaceHandler implements IQueryHandler<ResolvePluginArtifactNamespaceQuery> {
	constructor(
		@Inject(PluginManagementService) private readonly plugins: Pick<PluginManagementService, 'findLoadedPlugin'>
	) {}

	async execute(query: ResolvePluginArtifactNamespaceQuery): Promise<string> {
		const plugin = this.plugins.findLoadedPlugin(
			query.pluginName,
			RequestContext.getOrganizationId(),
			true,
			RequestContext.currentTenantId()
		)
		const namespace: unknown = plugin?.instance?.meta?.artifactNamespace
		if (!isPluginArtifactNamespace(namespace)) {
			throw new NotFoundException(
				t('server:Error.PluginAppDataNamespaceUnavailable', {
					defaultValue: 'A loaded plugin with a registered application namespace is required.'
				})
			)
		}
		return namespace
	}
}
