jest.mock('./data-source-type/data-source-type.service', () => ({
	DataSourceTypeService: class DataSourceTypeService {}
}))

jest.mock('./model/model.service', () => ({
	SemanticModelService: class SemanticModelService {}
}))

import { Test } from '@nestjs/testing'
import { DataSourceTypeService } from './data-source-type/data-source-type.service'
import { AnalyticsService } from './app.service'
import { SemanticModelService } from './model/model.service'

describe('AnalyticsService', () => {
	it('syncs plugin datasource types during application bootstrap', async () => {
		const dataSourceTypeService = {
			syncAllTenants: jest.fn()
		}
		const modelService = {
			seedIfEmpty: jest.fn()
		}
		const testingModule = await Test.createTestingModule({
			providers: [
				AnalyticsService,
				{
					provide: DataSourceTypeService,
					useValue: dataSourceTypeService
				},
				{
					provide: SemanticModelService,
					useValue: modelService
				}
			]
		}).compile()
		const service = testingModule.get(AnalyticsService)

		await service.seedDBIfEmpty()

		expect(dataSourceTypeService.syncAllTenants).toHaveBeenCalled()
		expect(modelService.seedIfEmpty).toHaveBeenCalled()
	})
})
