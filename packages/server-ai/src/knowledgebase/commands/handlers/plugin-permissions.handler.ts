import { IIntegration } from '@metad/contracts'
import { FileStorage, IntegrationService, RequestContext } from '@metad/server-core'
import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { FileSystemPermission, XpFileSystem } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { sandboxVolumeUrl, VolumeClient } from '../../../shared'
import { PluginPermissionsCommand } from '../plugin-permissions.command'

@CommandHandler(PluginPermissionsCommand)
export class PluginPermissionsHandler implements ICommandHandler<PluginPermissionsCommand> {
	constructor(private readonly integrationService: IntegrationService) {}

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
			// Use storage file provider's rootPath as basePath instead of knowledge base volume path
			// This ensures file paths relative to storage rootPath work correctly
			const fileStorage = new FileStorage()
			const storageProvider = fileStorage.getProvider()
			const basePath = storageProvider.config.rootPath
			
			permissions['fileSystem'] = new XpFileSystem(
				fsPermission,
				basePath,
				sandboxVolumeUrl(`/knowledges/${command.context.knowledgebaseId}/${command.context.folder ?? ''}`)
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
