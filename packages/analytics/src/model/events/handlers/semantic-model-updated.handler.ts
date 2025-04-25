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
			// Update Xmla Schema into Redis for model
			await updateXmlaCatalogContent(this.redisClient, model)

			// Update draft
			await updateXmlaCatalogContent(this.redisClient, {...model, ...(model.draft ?? {}), options: {
				schema: model.draft?.schema ?? model.options?.schema,
				settings: model.draft?.settings ?? model.options?.settings,
			}, id: `${model.id}/draft`})

			// Clear cache for model
			try {
				await this.cacheService.delete({ modelId: model.id })
			} catch (err) {
				//
			}

			/**
			 * @deprecated use in dependent query
			 */
			registerSemanticModel(model, false, this.dsCoreService)
		} catch (error) {
			this.#logger.error(`When update model '${model.id}' xmla schema: ${getErrorMessage(error)}`)
		}
	}
}
