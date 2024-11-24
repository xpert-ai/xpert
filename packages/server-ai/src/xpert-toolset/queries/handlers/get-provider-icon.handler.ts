import { ConfigService } from '@metad/server-config'
import { Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { existsSync, readFileSync } from 'fs'
import * as mime from 'mime-types'
import * as path from 'path'
import { ToolProviderNotFoundError } from '../../errors'
import { TToolsetProviderSchema } from '../../types'
import { ToolProviderIconQuery } from '../get-provider-icon.query'
import { ListBuiltinToolProvidersQuery } from '../list-builtin-providers.query'
import { getBuiltinToolsetBaseUrl } from '../../provider/builtin'


@QueryHandler(ToolProviderIconQuery)
export class ToolProviderIconHandler implements IQueryHandler<ToolProviderIconQuery> {
	protected logger = new Logger(ToolProviderIconHandler.name)

	@Inject(ConfigService)
	protected readonly configService: ConfigService

	constructor(private readonly queryBus: QueryBus) {}

	public async execute(command: ToolProviderIconQuery): Promise<[Buffer, string]> {
		const { provider } = command

		const providers = await this.queryBus.execute<ListBuiltinToolProvidersQuery, TToolsetProviderSchema[]>(new ListBuiltinToolProvidersQuery([provider]))

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

	getProviderServerPath(name: string) {
		return path.join(this.configService.assetOptions.serverRoot, getBuiltinToolsetBaseUrl(name), name)
	}
}
