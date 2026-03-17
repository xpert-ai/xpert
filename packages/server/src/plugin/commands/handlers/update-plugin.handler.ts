import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { GLOBAL_ORGANIZATION_SCOPE, RequestContext } from '@xpert-ai/plugin-sdk'
import { PluginInstanceService } from '../../plugin-instance.service'
import { PluginManagementService } from '../../plugin-management.service'
import { canUpdatePlugin, hasNewerVersion, supportsNpmRegistryUpdates } from '../../plugin-update.utils'
import { ResolveLatestPluginVersionQuery } from '../../queries'
import { UpdatePluginCommand } from '../update-plugin.command'
import { PluginUpdateResult, normalizePluginName } from '../../types'

@CommandHandler(UpdatePluginCommand)
export class UpdatePluginHandler implements ICommandHandler<UpdatePluginCommand> {
	constructor(
		private readonly pluginManagementService: PluginManagementService,
		private readonly pluginInstanceService: PluginInstanceService,
		private readonly queryBus: QueryBus
	) {}

	async execute(command: UpdatePluginCommand): Promise<PluginUpdateResult> {
		if (!command?.pluginName) {
			throw new BadRequestException('pluginName is required')
		}

		const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
		const plugin = this.pluginManagementService.findLoadedPlugin(command.pluginName, organizationId, false)
		if (!plugin) {
			throw new BadRequestException(`Plugin "${command.pluginName}" is not updateable in the current scope`)
		}
		if (!canUpdatePlugin(plugin, organizationId)) {
			throw new BadRequestException(`Plugin "${command.pluginName}" cannot be updated from the current scope`)
		}

		const existing = await this.pluginInstanceService.findOneByPluginName(plugin.name, organizationId)
		const currentVersion = plugin.instance?.meta?.version
		const packageName = normalizePluginName(plugin.packageName ?? plugin.name)
		const source = plugin.source ?? existing?.source ?? 'env'
		const config = existing ? this.pluginInstanceService.getConfig(existing) : (plugin.ctx?.config ?? {})

		if (!supportsNpmRegistryUpdates(source)) {
			throw new BadRequestException(`Plugin "${command.pluginName}" does not support npm-based updates`)
		}

		const latestVersion = await this.queryBus.execute<ResolveLatestPluginVersionQuery, string | undefined>(
			new ResolveLatestPluginVersionQuery(packageName)
		)
		if (!latestVersion) {
			throw new BadRequestException(`Unable to resolve the latest version for plugin "${command.pluginName}"`)
		}

		if (!hasNewerVersion(currentVersion, latestVersion)) {
			return {
				success: true,
				name: plugin.name,
				packageName,
				organizationId,
				currentVersion,
				latestVersion,
				updated: false,
				previousVersion: currentVersion
			}
		}

		const result = await this.pluginManagementService.installPlugin({
			pluginName: packageName,
			version: latestVersion,
			source,
			config
		})

		return {
			...result,
			latestVersion,
			updated: currentVersion !== result.currentVersion,
			previousVersion: currentVersion
		}
	}
}
