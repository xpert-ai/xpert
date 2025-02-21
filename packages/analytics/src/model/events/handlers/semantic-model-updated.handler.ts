import { SemanticModelStatusEnum } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { REDIS_CLIENT } from '@metad/server-core'
import { Inject, Logger } from '@nestjs/common'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { RedisClientType } from 'redis'
import { SemanticModelCacheService } from '../../cache/cache.service'
import { updateXmlaCatalogContent } from '../../helper'
import { SemanticModelService } from '../../model.service'
import { NgmDSCoreService, registerSemanticModel } from '../../ocap'
import { SemanticModelUpdatedEvent } from '../updated.event'

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
		private readonly redisClient: RedisClientType
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

		try {
			// await this.modelService.updateCatalogContent(model.id)

			// Update Xmla Schema into Redis for model
			await updateXmlaCatalogContent(this.redisClient, model)

			// Clear cache for model
			try {
				await this.cacheService.delete({ modelId: model.id })
			} catch (err) {
				//
			}

			registerSemanticModel(model, this.dsCoreService)
		} catch (error) {
			this.#logger.error(`When update model '${model.id}' xmla schema: ${getErrorMessage(error)}`)
		}
	}
}
