import { SemanticModelStatusEnum } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { REDIS_CLIENT } from '@metad/server-core'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus, EventsHandler, IEventHandler, QueryBus } from '@nestjs/cqrs'
import { RedisClientType } from 'redis'
import { SemanticModelCacheService } from '../../cache/cache.service'
import { updateXmlaCatalogContent } from '../../helper'
import { SemanticModelService } from '../../model.service'
import { NgmDSCoreService, registerSemanticModel } from '../../ocap'
import { SemanticModelUpdatedEvent } from '../updated.event'
import { UpdateXmlaCatalogContentCommand } from '../../commands'

@EventsHandler(SemanticModelUpdatedEvent)
export class SemanticModelUpdatedHandler implements IEventHandler<SemanticModelUpdatedEvent> {
	readonly #logger = new Logger(SemanticModelUpdatedHandler.name)

	constructor(
		private readonly modelService: SemanticModelService,
		private readonly cacheService: SemanticModelCacheService,
		/**
		 * Core service of ocap framework
		 */
		private readonly dsCoreService: NgmDSCoreService,
		@Inject(REDIS_CLIENT)
		private readonly redisClient: RedisClientType,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	async handle(event: SemanticModelUpdatedEvent) {
		const { id } = event
		const model = await this.modelService.findOne({
			where: {
				id,
				status: SemanticModelStatusEnum.Progressing
			},
			relations: ['dataSource', 'dataSource.type', 'roles']
		})

		await this.commandBus.execute(new UpdateXmlaCatalogContentCommand(model))

		try {
			// Update Xmla Schema into Redis for model
			await updateXmlaCatalogContent(this.queryBus, this.redisClient, model)

			/**
			 * @deprecated use in dependent query
			 */
			registerSemanticModel(model, false, this.dsCoreService)
		} catch (error) {
			this.#logger.error(`When update model '${model.id}' xmla schema: ${getErrorMessage(error)}`)
		}
	}
}
