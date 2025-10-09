import { ConfigService } from '@metad/server-config'
import { Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { existsSync, readFileSync } from 'fs'
import * as mime from 'mime-types'
import * as path from 'path'
import { ToolProviderNotFoundError } from '../../errors'
import { getBuiltinToolsetBaseUrl } from '../../provider/builtin'
import { TToolsetProviderSchema } from '../../types'
import { ToolProviderIconQuery } from '../get-provider-icon.query'
import { ListBuiltinToolProvidersQuery } from '../list-builtin-providers.query'

@QueryHandler(ToolProviderIconQuery)
export class ToolProviderIconHandler implements IQueryHandler<ToolProviderIconQuery> {
	protected logger = new Logger(ToolProviderIconHandler.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	@Inject(ToolsetRegistry)
	protected readonly toolsetRegistry: ToolsetRegistry

	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: ToolProviderIconQuery): Promise<[Buffer, string]> {
		const { provider } = command

		try {
			const pluginProvider = this.toolsetRegistry.get(provider)
			if (pluginProvider) {
				const icon = pluginProvider.meta.icon
				if (icon.svg) {
					return [Buffer.from(icon.svg), 'image/svg+xml']
				} else if (icon.png) {
					// Remove prefix (data:image/png;base64, image/png;base64,)
  					const base64Data = icon.png.replace(/^data:image\/[a-z]+;base64,|^image\/[a-z]+;base64,/, "");
					const byteData = Buffer.from(base64Data, 'base64')
					return [byteData, 'image/png']
				}

				return [null, 'image/svg+xml']
			}
		} catch (err) {
			const providers = await this.queryBus.execute<ListBuiltinToolProvidersQuery, TToolsetProviderSchema[]>(
				new ListBuiltinToolProvidersQuery([provider])
			)

			if (!providers[0]) {
				throw new ToolProviderNotFoundError(`Not found tool provider '${provider}'`)
			}

			const filePath = path.join(this.getProviderServerPath(provider), '_assets', providers[0].identity.icon)

			if (!existsSync(filePath)) {
				return [null, null]
			}

			const mimeType = mime.lookup(filePath) || 'application/octet-stream'
			const byteData = readFileSync(filePath)

			return [byteData, mimeType]
		}
	}

	getProviderServerPath(name: string) {
		return path.join(this.configService.assetOptions.serverRoot, getBuiltinToolsetBaseUrl(name), name)
	}
}
