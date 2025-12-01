import { ConfigService } from '@metad/server-config'
import { HttpException, HttpStatus, Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { AgentMiddlewareRegistry, ToolsetRegistry } from '@xpert-ai/plugin-sdk'
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

	@Inject(AgentMiddlewareRegistry)
	private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry

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
					const base64Data = icon.png.replace(/^data:image\/[a-z]+;base64,|^image\/[a-z]+;base64,/, '')
					const byteData = Buffer.from(base64Data, 'base64')
					return [byteData, 'image/png']
				}

				return [null, 'image/svg+xml']
			}
		} catch (err) {
			const providers = await this.queryBus.execute<ListBuiltinToolProvidersQuery, TToolsetProviderSchema[]>(
				new ListBuiltinToolProvidersQuery([provider])
			)
			if (providers[0]) {
				const filePath = path.join(this.getProviderServerPath(provider), '_assets', providers[0].identity.icon)

				if (!existsSync(filePath)) {
					return [null, null]
				}

				const mimeType = mime.lookup(filePath) || 'application/octet-stream'
				const byteData = readFileSync(filePath)
				return [byteData, mimeType]
			} else {
				try {
					const middleware = this.agentMiddlewareRegistry.get(provider)
					// IconDefinition 类型的 icon 转成文件流返回
					if (middleware?.meta?.icon) {
						const icon = middleware.meta.icon
						let buffer: Buffer
						let mimetype = 'image/svg+xml'
						if (icon.type === 'svg') {
							// 假设是 SVG 字符串
							buffer = Buffer.from(icon.value, 'utf-8')
						} else if (icon.type === 'image') {
							buffer = Buffer.from(icon.value, 'base64')
							mimetype = 'image/png' // 假设是 PNG 图片
						} else {
							throw new HttpException(
								'Icon format not supported:' + icon.type,
								HttpStatus.UNSUPPORTED_MEDIA_TYPE
							)
						}
						return [buffer, mimetype]
					}
				} catch (err) {
					//
				}
				throw new ToolProviderNotFoundError(`Not found tool provider '${provider}'`)
			}
		}
	}

	getProviderServerPath(name: string) {
		return path.join(this.configService.assetOptions.serverRoot, getBuiltinToolsetBaseUrl(name), name)
	}
}
