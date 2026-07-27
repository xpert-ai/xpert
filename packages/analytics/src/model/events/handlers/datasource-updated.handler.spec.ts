jest.mock('@xpert-ai/server-core', () => ({
	DataSourceUpdatedEvent: class DataSourceUpdatedEvent {
		constructor(public readonly id: string) {}
	}
}))
jest.mock('../../model.service', () => ({
	SemanticModelService: class SemanticModelService {}
}))

import { DataSourceUpdatedEvent } from '@xpert-ai/server-core'
import { SemanticModelService } from '../../model.service'
import { DataSourceUpdatedHandler } from './datasource-updated.handler'

describe('DataSourceUpdatedHandler', () => {
	let modelService: SemanticModelService
	let handler: DataSourceUpdatedHandler

	beforeEach(() => {
		modelService = {
			findAll: jest.fn(),
			updateCatalogContent: jest.fn()
		} as unknown as SemanticModelService
		handler = new DataSourceUpdatedHandler(modelService)
	})

	it('emits the concrete service class as the Nest injection token', () => {
		expect(Reflect.getMetadata('design:paramtypes', DataSourceUpdatedHandler)).toEqual([SemanticModelService])
	})

	it('refreshes only semantic models belonging to the updated data source', async () => {
		const models = [{ id: 'model-1' }, { id: 'model-2' }]
		;(modelService.findAll as jest.Mock).mockResolvedValue({ items: models, total: models.length })

		await handler.handle(new DataSourceUpdatedEvent('data-source-1'))

		expect(modelService.findAll).toHaveBeenCalledWith({
			where: { dataSourceId: 'data-source-1' }
		})
		expect(modelService.updateCatalogContent).toHaveBeenNthCalledWith(1, 'model-1')
		expect(modelService.updateCatalogContent).toHaveBeenNthCalledWith(2, 'model-2')
	})

	it('continues refreshing remaining models when one refresh fails', async () => {
		const models = [{ id: 'model-1' }, { id: 'model-2' }]
		;(modelService.findAll as jest.Mock).mockResolvedValue({ items: models, total: models.length })
		;(modelService.updateCatalogContent as jest.Mock)
			.mockRejectedValueOnce(new Error('refresh failed'))
			.mockResolvedValueOnce(undefined)

		await handler.handle(new DataSourceUpdatedEvent('data-source-1'))

		expect(modelService.updateCatalogContent).toHaveBeenCalledTimes(2)
		expect(modelService.updateCatalogContent).toHaveBeenLastCalledWith('model-2')
	})
})
