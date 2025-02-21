import { Logger } from '@nestjs/common'
import { EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { DataSourceService, DataSourceUpdatedEvent } from '../../../data-source'
import { SemanticModelService } from '../../model.service'

@EventsHandler(DataSourceUpdatedEvent)
export class DataSourceUpdatedHandler implements IEventHandler<DataSourceUpdatedEvent> {
	readonly #logger = new Logger(DataSourceUpdatedHandler.name)

	constructor(
		private readonly dataSourceService: DataSourceService,
		private readonly modelService: SemanticModelService
	) {}

	async handle(event: DataSourceUpdatedEvent) {
		const { id: dataSourceId } = event
		const dataSource = await this.dataSourceService.findOneByIdString(dataSourceId, { relations: ['models'] })
		if (!dataSource) {
			throw new Error(`Can't found data source for id '${dataSourceId}'`)
		}
		for (const model of dataSource.models) {
			try {
				await this.modelService.updateCatalogContent(model.id)
			} catch (err) {
				this.#logger.error(err)
			}
		}
	}
}
