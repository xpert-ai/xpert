import { NotFoundException } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { existsSync, readFileSync } from 'fs'
import * as mime from 'mime-types'
import * as path from 'path'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AIProvidersService } from '../../ai-model.service'
import { AIModelGetIconQuery } from '../get-model-icon.query'

@QueryHandler(AIModelGetIconQuery)
export class AIModelGetIconHandler implements IQueryHandler<AIModelGetIconQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly service: AIProvidersService
	) {}

	public async execute(command: AIModelGetIconQuery): Promise<[Buffer, string]> {
		const { provider, iconType, lang, organizationId } = command
		const resolvedOrganizationId = organizationId ?? RequestContext.getOrganizationId()

		const modelProvider = this.service.getProvider(provider, false, resolvedOrganizationId)
		if (!modelProvider) {
			throw new NotFoundException(`Provider ${provider} is not found.`)
		}
		const providerSchema = modelProvider.getProviderSchema()

		let fileName: string
		if (iconType.toLowerCase() === 'icon_small') {
			if (!providerSchema.icon_small) {
				throw new NotFoundException(`Provider ${provider} does not have small icon.`)
			}
			fileName =
				lang.toLowerCase() === 'zh_hans' && providerSchema.icon_small.zh_Hans || providerSchema.icon_small.en_US
					
		} else {
			if (!providerSchema.icon_large) {
				throw new NotFoundException(`Provider ${provider} does not have large icon.`)
			}
			fileName =
				lang.toLowerCase() === 'zh_hans' && providerSchema.icon_large.zh_Hans || providerSchema.icon_large.en_US
		}

		const rootPath = modelProvider.getProviderServerPath()
		const filePath = path.join(rootPath, '_assets', fileName)

		if (!existsSync(filePath)) {
			return [null, null]
		}

		const mimeType = mime.lookup(filePath) || 'application/octet-stream'
		const byteData = readFileSync(filePath)

		return [byteData, mimeType]
	}
}
