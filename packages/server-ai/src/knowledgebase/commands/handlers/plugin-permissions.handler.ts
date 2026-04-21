import { IIntegration } from '@xpert-ai/contracts'
import { IntegrationService, RequestContext } from '@xpert-ai/server-core'
import { BadRequestException, Inject } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { FileSystemPermission, XpFileSystem } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { VOLUME_CLIENT, VolumeClient } from '../../../shared'
import { PluginPermissionsCommand } from '../plugin-permissions.command'

@CommandHandler(PluginPermissionsCommand)
export class PluginPermissionsHandler implements ICommandHandler<PluginPermissionsCommand> {
	constructor(
		private readonly integrationService: IntegrationService,
		@Inject(VOLUME_CLIENT)
		private readonly volumeClient: VolumeClient
	) {}

	public async execute(
		command: PluginPermissionsCommand
	): Promise<{ fileSystem?: XpFileSystem; integration?: IIntegration }> {
		const permissions = {}
		if (!command.permissions?.length) {
			return permissions
		}

		const fsPermission = command.permissions.find(
			(permission) => permission.type === 'filesystem'
		) as FileSystemPermission
		if (fsPermission) {
			const volumeClient = await this.volumeClient
				.resolve({
					tenantId: RequestContext.currentTenantId(),
					catalog: 'knowledges',
					userId: RequestContext.currentUserId(),
					knowledgeId: command.context.knowledgebaseId
				})
				.ensureRoot()
			
			permissions['fileSystem'] = new XpFileSystem(
				fsPermission,
				volumeClient.path(command.context.folder ?? ''),
				volumeClient.publicUrl(command.context.folder ?? '')
			)
		}

		// Integration
		const integrationPermission = command.permissions.find((permission) => permission.type === 'integration')
		if (integrationPermission && command.context.integrationId) {
			let integration: IIntegration = null
			try {
				integration = await this.integrationService.findOne(command.context.integrationId)
			} catch (error) {
				throw new BadRequestException(
					t('server-ai:Error.IntegrationNotFound', { id: command.context.integrationId })
				)
			}
			permissions['integration'] = integration
		}

		return permissions
	}
}
