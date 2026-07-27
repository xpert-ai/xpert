import { Logger } from '@nestjs/common'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { DataSourceUpdatedEvent } from '@xpert-ai/server-core'
import { SemanticModelService } from '../../model.service'

@EventsHandler(DataSourceUpdatedEvent)
export class DataSourceUpdatedHandler implements IEventHandler<DataSourceUpdatedEvent> {
	readonly #logger = new Logger(DataSourceUpdatedHandler.name)

	constructor(private readonly modelService: SemanticModelService) {}

	async handle(event: DataSourceUpdatedEvent) {
		const { id: dataSourceId } = event
		const { items: models } = await this.modelService.findAll({
			where: { dataSourceId }
		})
		for (const model of models) {
			try {
				await this.modelService.updateCatalogContent(model.id)
			} catch (err) {
				this.#logger.error(err)
			}
		}
	}
}
