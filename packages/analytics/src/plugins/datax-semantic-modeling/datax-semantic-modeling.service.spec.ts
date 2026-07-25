jest.mock('../../data-source', () => ({
	DataSourceQuery: class DataSourceQuery {
		constructor(
			public readonly dataSourceId: string,
			public readonly input: unknown
		) {}
	},
	DataSourceService: class DataSourceService {}
}))
jest.mock('../../model', () => ({
	SemanticModelCreateCommand: class SemanticModelCreateCommand {
		constructor(public readonly input: unknown) {}
	},
	SemanticModelPublishCommand: class SemanticModelPublishCommand {
		constructor(
			public readonly modelId: string,
			public readonly releaseNotes: string
		) {}
	},
	SemanticModelService: class SemanticModelService {}
}))
jest.mock('../../project/queries', () => ({
	ProjectMyQuery: class ProjectMyQuery {
		constructor(public readonly input: unknown) {}
	}
}))
jest.mock('../../project/commands', () => ({
	ProjectModelsUpdateCommand: class ProjectModelsUpdateCommand {
		constructor(
			public readonly projectId: string,
			public readonly modelIds: string[]
		) {}
	}
}))

import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { DataSourceService } from '../../data-source'
import { SemanticModelService } from '../../model'
import { DataXQueryAnalysisService } from '../datax-query-analysis/datax-query-analysis.service'
import { DataXSemanticModelingService } from './datax-semantic-modeling.service'

describe('DataXSemanticModelingService', () => {
	it('returns draft artifacts and validation issues for manual and conversational modeling', async () => {
		const dependencies = createDependencies()
		dependencies.semanticModelService.findOne.mockResolvedValue({
			id: 'model-1',
			key: 'retail',
			name: 'Retail',
			draft: {
				version: 3,
				schema: {
					name: 'Retail',
					cubes: [{ name: 'Sales', caption: 'Sales cube' }],
					dimensions: [{ name: 'Store' }]
				},
				checklist: ['Review missing calendar']
			}
		})
		const service = createService(dependencies)

		const workspace = await service.getWorkspace('model-1')

		expect(workspace).toMatchObject({
			model: {
				id: 'model-1',
				draftVersion: 3,
				cubeCount: 1,
				dimensionCount: 1
			},
			cubes: [{ name: 'Sales', caption: 'Sales cube', kind: 'cube' }],
			dimensions: [{ name: 'Store' }],
			checklist: ['Review missing calendar']
		})
	})

	it('rejects stale full-schema saves before mutating the draft', async () => {
		const dependencies = createDependencies()
		dependencies.semanticModelService.findOne.mockResolvedValue({
			id: 'model-1',
			name: 'Retail',
			draft: {
				version: 4,
				schema: {
					name: 'Retail'
				}
			}
		})
		const service = createService(dependencies)

		await expect(
			service.saveDraft({
				modelId: 'model-1',
				baseVersion: 3,
				schema: {
					name: 'Retail',
					cubes: []
				},
				changeSummary: 'Update cubes'
			})
		).rejects.toThrow('changed from version 3 to 4')
		expect(dependencies.semanticModelService.saveDraft).not.toHaveBeenCalled()
	})

	it('validates complete schema shape and persists a missing schema name safely', async () => {
		const dependencies = createDependencies()
		dependencies.semanticModelService.findOne.mockResolvedValue({
			id: 'model-1',
			draft: {
				version: 1,
				schema: {
					name: 'Retail'
				}
			}
		})
		dependencies.semanticModelService.saveDraft.mockResolvedValue({
			id: 'model-1',
			draft: {
				version: 2,
				checklist: []
			}
		})
		const service = createService(dependencies)

		const result = await service.saveDraft({
			modelId: 'model-1',
			baseVersion: 1,
			schema: {
				cubes: [{ name: 'Sales' }],
				dimensions: [],
				virtualCubes: []
			},
			changeSummary: 'Create Sales cube'
		})

		expect(dependencies.semanticModelService.saveDraft).toHaveBeenCalledWith(
			'model-1',
			expect.objectContaining({
				schema: {
					name: '',
					cubes: [{ name: 'Sales' }],
					dimensions: [],
					virtualCubes: []
				}
			})
		)
		expect(result).toEqual({
			modelId: 'model-1',
			version: 2,
			checklist: []
		})
	})

	it('discovers physical table columns through the workspace data source', async () => {
		const dependencies = createDependencies()
		dependencies.semanticModelService.findOne.mockResolvedValue({
			id: 'model-1',
			dataSourceId: 'source-1',
			catalog: 'retail'
		})
		dependencies.queryBus.execute.mockResolvedValue([
			{
				name: 'sales',
				columns: [{ name: 'amount', type: 'number', dataType: 'decimal' }]
			}
		])
		const service = createService(dependencies)

		await expect(service.getTableSchema('model-1', 'retail.sales')).resolves.toEqual([
			{
				name: 'sales',
				columns: [{ name: 'amount', type: 'number', dataType: 'decimal' }]
			}
		])
		expect(dependencies.queryBus.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				dataSourceId: 'source-1',
				input: {
					command: 'TableSchema',
					schema: 'retail',
					table: 'retail.sales'
				}
			})
		)
	})

	it('discovers catalogs only after resolving an accessible data source', async () => {
		const dependencies = createDependencies()
		dependencies.dataSourceService.findOne.mockResolvedValue({
			id: 'source-1',
			name: 'Warehouse'
		})
		dependencies.dataSourceService.getCatalogs.mockResolvedValue([
			{ name: 'demo', label: 'Demo warehouse', type: 'schema' },
			{ name: 'analytics', catalog: 'prod', schema: 'analytics' }
		])
		const service = createService(dependencies)

		await expect(service.listCatalogs('source-1')).resolves.toEqual([
			{ value: 'demo', label: 'Demo warehouse', description: 'schema' },
			{ value: 'prod', label: 'analytics', description: 'analytics' }
		])
		expect(dependencies.dataSourceService.findOne).toHaveBeenCalledWith('source-1')
		expect(dependencies.dataSourceService.getCatalogs).toHaveBeenCalledWith('source-1')
	})

	it('links a newly created workspace only to a project accessible by the current user', async () => {
		const dependencies = createDependencies()
		dependencies.dataSourceService.findOne.mockResolvedValue({ id: 'source-1' })
		dependencies.queryBus.execute.mockResolvedValue({
			items: [
				{
					id: 'project-1',
					name: 'Retail Analytics',
					models: [{ id: 'model-existing' }]
				}
			]
		})
		dependencies.commandBus.execute.mockResolvedValue({
			id: 'model-new',
			name: 'Revenue Analytics',
			draft: { schema: {} }
		})
		const service = createService(dependencies)

		await service.createWorkspace(
			{
				key: 'revenue_analytics',
				name: 'Revenue Analytics',
				dataSourceId: 'source-1',
				catalog: 'demo',
				projectId: 'project-1',
				changeSummary: 'Create governed model'
			},
			'user-1'
		)

		expect(dependencies.commandBus.execute).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				projectId: 'project-1',
				modelIds: ['model-existing', 'model-new']
			})
		)
	})
})

function createDependencies() {
	return {
		semanticModelService: {
			findOne: jest.fn(),
			saveDraft: jest.fn(),
			findMy: jest.fn()
		},
		dataSourceService: {
			findAll: jest.fn(),
			findOne: jest.fn(),
			getCatalogs: jest.fn()
		},
		commandBus: {
			execute: jest.fn()
		},
		queryBus: {
			execute: jest.fn()
		},
		queryAnalysisService: {
			execute: jest.fn()
		}
	}
}

function createService(dependencies: ReturnType<typeof createDependencies>) {
	return new DataXSemanticModelingService(
		dependencies.semanticModelService as unknown as SemanticModelService,
		dependencies.dataSourceService as unknown as DataSourceService,
		dependencies.commandBus as unknown as CommandBus,
		dependencies.queryBus as unknown as QueryBus,
		dependencies.queryAnalysisService as unknown as DataXQueryAnalysisService
	)
}
