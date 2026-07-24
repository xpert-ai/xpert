import { XpertResolvedViewHostContext } from '@xpert-ai/contracts'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	renderRemoteReactIframeHtml: (options: { title: string; appScript: string }) =>
		`<!doctype html><title>${options.title}</title><script>${options.appScript}</script>`,
	ViewExtensionProvider: () => () => undefined
}))
jest.mock('../../model', () => ({
	SemanticModelService: class SemanticModelService {}
}))

import {
	DATA_X_QUERY_ANALYSIS_FEATURE,
	DATA_X_QUERY_ANALYSIS_FIXED_SLOT,
	DATA_X_QUERY_ANALYSIS_MAIN_SLOT,
	DATA_X_QUERY_ANALYSIS_REMOTE_ENTRY_KEY,
	DATA_X_QUERY_ANALYSIS_TOOL_NAMES,
	DATA_X_QUERY_ANALYSIS_VIEW_KEY
} from './constants'
import { DataXQueryAnalysisService } from './datax-query-analysis.service'
import { DataXQueryAnalysisViewProvider } from './datax-query-analysis-view.provider'

describe('DataXQueryAnalysisViewProvider', () => {
	const context: XpertResolvedViewHostContext = {
		tenantId: 'tenant-1',
		organizationId: 'org-1',
		userId: 'user-1',
		hostType: 'agent',
		hostId: 'agent-1',
		slots: [{ key: DATA_X_QUERY_ANALYSIS_MAIN_SLOT, mode: 'sections' }]
	}

	it('registers feature-gated main and fixed remote views with ChatKit refresh events', () => {
		const provider = createProvider()
		const [main] = provider.getViewManifests(context, DATA_X_QUERY_ANALYSIS_MAIN_SLOT)
		const [fixed] = provider.getViewManifests(context, DATA_X_QUERY_ANALYSIS_FIXED_SLOT)

		expect(main).toMatchObject({
			key: DATA_X_QUERY_ANALYSIS_VIEW_KEY,
			activation: {
				requiredFeatures: [DATA_X_QUERY_ANALYSIS_FEATURE]
			},
			view: {
				type: 'remote_component',
				component: {
					isolation: 'iframe',
					entry: DATA_X_QUERY_ANALYSIS_REMOTE_ENTRY_KEY
				}
			}
		})
		expect(main.hostEvents?.subscriptions?.[0].filter).toEqual({
			sources: ['chatkit'],
			toolNames: [...DATA_X_QUERY_ANALYSIS_TOOL_NAMES]
		})
		expect(fixed.workbench?.fixed).toBe(true)
	})

	it('executes the same real query service from a manual remote view action', async () => {
		const service = createService()
		const provider = createProvider(service)

		const result = await provider.executeViewAction(context, DATA_X_QUERY_ANALYSIS_VIEW_KEY, 'execute', {
			parameters: {
				modelId: 'model-1',
				cubeName: 'Sales'
			},
			input: {
				statement: 'SELECT [Measures].[Sales] ON COLUMNS FROM [Sales]',
				limit: 50
			}
		})

		expect(service.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				modelId: 'model-1',
				cubeName: 'Sales',
				limit: 50
			}),
			{
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				userId: 'user-1'
			}
		)
		expect(result).toMatchObject({
			success: true,
			data: {
				rows: [{ Store: 'Shanghai', Sales: 120 }],
				totalRowCount: 1
			},
			refresh: false
		})
	})
})

function createService() {
	return {
		listModels: jest.fn(async () => []),
		getModel: jest.fn(async () => ({
			id: 'model-1',
			cubes: [{ name: 'Sales' }]
		})),
		execute: jest.fn(async () => ({
			modelId: 'model-1',
			cubeName: 'Sales',
			statement: 'SELECT [Measures].[Sales] ON COLUMNS FROM [Sales]',
			columns: [
				{ name: 'Store', type: 'string' },
				{ name: 'Sales', type: 'number' }
			],
			rows: [{ Store: 'Shanghai', Sales: 120 }],
			rowCount: 1,
			totalRowCount: 1,
			truncated: false,
			audit: {
				traceId: 'trace-1',
				taskId: 'task-1',
				durationMs: 12
			}
		}))
	}
}

function createProvider(service = createService()) {
	return new DataXQueryAnalysisViewProvider(service as unknown as DataXQueryAnalysisService)
}
