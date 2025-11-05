import { getErrorMessage } from '@metad/server-common'
import { REDIS_CLIENT } from '@metad/server-core'
import { Inject, Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { RedisClientType } from 'redis'
import { SemanticModelCacheService } from '../../cache/cache.service'
import { updateXmlaCatalogContent } from '../../helper'
import { UpdateXmlaCatalogContentCommand } from '../update-xmla-catalog-content.command'


@CommandHandler(UpdateXmlaCatalogContentCommand)
export class UpdateXmlaCatalogContentHandler implements ICommandHandler<UpdateXmlaCatalogContentCommand> {
	readonly #logger = new Logger(UpdateXmlaCatalogContentHandler.name)

	constructor(
		private readonly cacheService: SemanticModelCacheService,
		private readonly queryBus: QueryBus,
		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientType
	) {}

	public async execute(command: UpdateXmlaCatalogContentCommand) {
		const model = command.model
		try {
			// Update Xmla Schema into Redis for model
			// await updateXmlaCatalogContent(this.redisClient, model)

			// Update draft
			await updateXmlaCatalogContent(this.queryBus, this.redisClient, {
				...model,
				...(model.draft ?? {}),
				options: {
					schema: model.draft?.schema ?? model.options?.schema,
					settings: model.draft?.settings ?? model.options?.settings
				},
				id: `${model.id}/draft`
			})

			// Clear cache for model
			try {
				await this.cacheService.delete({ modelId: model.id })
			} catch (err) {
				//
			}
		} catch (error) {
			this.#logger.error(`When update model '${model.id}' xmla schema: ${getErrorMessage(error)}`)
		}
	}
}
