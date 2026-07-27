import { XpertResolvedViewHostContext } from '@xpert-ai/contracts'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	renderRemoteReactIframeHtml: (options: { title: string; appScript: string }) =>
		`<!doctype html><title>${options.title}</title><script>${options.appScript}</script>`,
	ViewExtensionProvider: () => () => undefined
}))
jest.mock('@xpert-ai/server-core', () => ({
	DataSourceQuery: class DataSourceQuery {},
	DataSourceService: class DataSourceService {}
}))
jest.mock('../../model', () => ({
	SemanticModelCreateCommand: class SemanticModelCreateCommand {},
	SemanticModelPublishCommand: class SemanticModelPublishCommand {},
	SemanticModelService: class SemanticModelService {}
}))
jest.mock('../../project/queries', () => ({
	ProjectMyQuery: class ProjectMyQuery {}
}))
jest.mock('../../project/commands', () => ({
	ProjectModelsUpdateCommand: class ProjectModelsUpdateCommand {}
}))

import {
	DATA_X_SEMANTIC_MODELING_FEATURE,
	DATA_X_SEMANTIC_MODELING_FIXED_SLOT,
	DATA_X_SEMANTIC_MODELING_MAIN_SLOT,
	DATA_X_SEMANTIC_MODELING_REMOTE_ENTRY_KEY,
	DATA_X_SEMANTIC_MODELING_TOOL_NAMES,
	DATA_X_SEMANTIC_MODELING_VIEW_KEY
} from './constants'
import { DataXSemanticModelingService } from './datax-semantic-modeling.service'
import { DataXSemanticModelingViewProvider } from './datax-semantic-modeling-view.provider'

describe('DataXSemanticModelingViewProvider', () => {
	const context: XpertResolvedViewHostContext = {
		tenantId: 'tenant-1',
		organizationId: 'org-1',
		userId: 'user-1',
		hostType: 'agent',
		hostId: 'agent-1',
		slots: [{ key: DATA_X_SEMANTIC_MODELING_MAIN_SLOT, mode: 'sections' }]
	}

	it('exposes feature-gated main and fixed semantic modeling workbenches', () => {
		const provider = createProvider()
		const [main] = provider.getViewManifests(context, DATA_X_SEMANTIC_MODELING_MAIN_SLOT)
		const [fixed] = provider.getViewManifests(context, DATA_X_SEMANTIC_MODELING_FIXED_SLOT)

		expect(main).toMatchObject({
			key: DATA_X_SEMANTIC_MODELING_VIEW_KEY,
			activation: {
				requiredFeatures: [DATA_X_SEMANTIC_MODELING_FEATURE]
			},
			view: {
				type: 'remote_component',
				component: {
					isolation: 'iframe',
					entry: DATA_X_SEMANTIC_MODELING_REMOTE_ENTRY_KEY
				}
			},
			dataSource: {
				querySchema: {
					supportsPagination: true
				}
			}
		})
		expect(main.hostEvents?.subscriptions?.[0].filter).toEqual({
			sources: ['chatkit'],
			toolNames: [...DATA_X_SEMANTIC_MODELING_TOOL_NAMES]
		})
		expect(main.actions?.map((action) => action.key)).toEqual(
			expect.arrayContaining(['create_workspace', 'save_draft', 'publish'])
		)
		expect(fixed.workbench?.fixed).toBe(true)
	})

	it('uses the same draft service for manual schema saves', async () => {
		const service = createService()
		const provider = createProvider(service)

		const result = await provider.executeViewAction(context, DATA_X_SEMANTIC_MODELING_VIEW_KEY, 'save_draft', {
			targetId: 'model-1',
			input: {
				schemaJson: '{"name":"Retail","cubes":[]}',
				baseVersion: 4,
				changeSummary: 'Remove draft cubes'
			}
		})

		expect(service.saveDraftJson).toHaveBeenCalledWith('model-1', '{"name":"Retail","cubes":[]}', 4)
		expect(result).toMatchObject({
			success: true,
			data: {
				modelId: 'model-1',
				version: 5
			}
		})
	})

	it('serves table schema metadata to the structured source explorer', async () => {
		const service = createService()
		service.safeGetTableSchema.mockResolvedValue({
			item: [{ name: 'sales', columns: [{ name: 'amount', type: 'number' }] }],
			error: null
		})
		const provider = createProvider(service)

		const result = await provider.getViewData(context, DATA_X_SEMANTIC_MODELING_VIEW_KEY, {
			parameters: {
				modelId: 'model-1',
				mode: 'table_schema',
				tableName: 'sales'
			}
		})

		expect(service.safeGetTableSchema).toHaveBeenCalledWith('model-1', 'sales')
		expect(result).toMatchObject({
			item: [{ name: 'sales', columns: [{ name: 'amount', type: 'number' }] }],
			total: 1
		})
	})

	it('normalizes catalog metadata into table names for the source explorer', async () => {
		const service = createService()
		service.safeListTables.mockResolvedValue({
			items: [
				{
					schema: 'demo',
					name: 'demo',
					tables: [
						{ schema: 'demo', name: 'adv_sales', columns: [] },
						{ schema: 'demo', name: 'adv_product', columns: [] }
					]
				}
			],
			error: null
		})
		const provider = createProvider(service)

		const result = await provider.getViewData(context, DATA_X_SEMANTIC_MODELING_VIEW_KEY, {
			parameters: {
				modelId: 'model-1',
				mode: 'tables'
			}
		})

		expect(result).toMatchObject({
			items: ['adv_sales', 'adv_product'],
			total: 2,
			meta: {
				tableKey: 'name'
			}
		})
	})

	it('provides accessible catalogs for the selected data source', async () => {
		const service = createService()
		service.listCatalogs.mockResolvedValue([
			{ value: 'demo', label: 'Demo warehouse', description: 'schema' },
			{ value: 'sales', label: 'Sales mart' }
		])
		const provider = createProvider(service)

		const result = await provider.getViewParameterOptions(context, DATA_X_SEMANTIC_MODELING_VIEW_KEY, 'catalog', {
			search: 'demo',
			parameters: {
				dataSourceId: 'source-1'
			}
		})

		expect(service.listCatalogs).toHaveBeenCalledWith('source-1')
		expect(result).toEqual({
			items: [{ value: 'demo', label: 'Demo warehouse', description: 'schema' }]
		})
	})

	it('provides only projects resolved by the permission-aware modeling service', async () => {
		const service = createService()
		service.listProjects.mockResolvedValue([
			{
				id: 'project-1',
				name: 'Retail Analytics',
				description: 'Governed retail metrics',
				modelIds: []
			}
		])
		const provider = createProvider(service)

		const result = await provider.getViewParameterOptions(context, DATA_X_SEMANTIC_MODELING_VIEW_KEY, 'projectId', {
			search: 'retail'
		})

		expect(result).toEqual({
			items: [
				{
					value: 'project-1',
					label: 'Retail Analytics',
					description: 'Governed retail metrics'
				}
			]
		})
	})
})

function createService() {
	return {
		listWorkspaces: jest.fn(async () => []),
		listDataSources: jest.fn(async () => []),
		listCatalogs: jest.fn(async () => []),
		listProjects: jest.fn(async () => []),
		getWorkspace: jest.fn(),
		safeListTables: jest.fn(),
		safeGetTableSchema: jest.fn(),
		createWorkspace: jest.fn(),
		saveDraftJson: jest.fn(async () => ({
			modelId: 'model-1',
			version: 5,
			checklist: []
		})),
		publishWorkspace: jest.fn()
	}
}

function createProvider(service = createService()) {
	return new DataXSemanticModelingViewProvider(service as unknown as DataXSemanticModelingService)
}
