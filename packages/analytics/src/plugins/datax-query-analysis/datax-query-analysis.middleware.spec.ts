import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	AgentMiddlewareStrategy: () => () => undefined
}))
jest.mock('../../model', () => ({
	SemanticModelService: class SemanticModelService {}
}))

import {
	DATA_X_QUERY_ANALYSIS_CONTEXT_TOOL_NAME,
	DATA_X_QUERY_ANALYSIS_EXECUTE_TOOL_NAME,
	DATA_X_QUERY_ANALYSIS_FEATURE,
	DATA_X_QUERY_ANALYSIS_MIDDLEWARE_NAME,
	DATA_X_QUERY_ANALYSIS_OPEN_TOOL_NAME,
	DATA_X_QUERY_VISUALIZATION_META_KEY
} from './constants'
import { DataXQueryAnalysisMiddleware } from './datax-query-analysis.middleware'
import { DataXQueryAnalysisService } from './datax-query-analysis.service'

describe('DataXQueryAnalysisMiddleware', () => {
	it('exposes model context, real query execution, and the manual workbench to ChatKit', async () => {
		const service = createService()
		const strategy = new DataXQueryAnalysisMiddleware(service as unknown as DataXQueryAnalysisService)
		const middleware = strategy.createMiddleware({}, createContext())

		expect(strategy.meta).toMatchObject({
			name: DATA_X_QUERY_ANALYSIS_MIDDLEWARE_NAME,
			features: [DATA_X_QUERY_ANALYSIS_FEATURE]
		})
		expect(middleware.tools?.map((item) => item.name)).toEqual([
			DATA_X_QUERY_ANALYSIS_OPEN_TOOL_NAME,
			DATA_X_QUERY_ANALYSIS_CONTEXT_TOOL_NAME,
			DATA_X_QUERY_ANALYSIS_EXECUTE_TOOL_NAME
		])

		const execute = middleware.tools?.find((item) => item.name === DATA_X_QUERY_ANALYSIS_EXECUTE_TOOL_NAME)
		const output = JSON.parse(
			String(
				await execute?.invoke({
					modelId: 'model-1',
					cubeName: 'Sales',
					statement: 'SELECT [Measures].[Sales] ON COLUMNS FROM [Sales]',
					limit: 100,
					openWorkbench: true
				})
			)
		)

		expect(service.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				modelId: 'model-1',
				cubeName: 'Sales'
			}),
			{
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				userId: 'user-1'
			}
		)
		expect(output).toMatchObject({
			rows: [{ Store: 'Shanghai', Sales: 120 }],
			totalRowCount: 1,
			_meta: {
				[DATA_X_QUERY_VISUALIZATION_META_KEY]: {
					type: 'xpert.extension_view'
				}
			}
		})
	})
})

function createService() {
	return {
		listModels: jest.fn(),
		getModel: jest.fn(),
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

function createContext() {
	return {
		tenantId: 'tenant-1',
		organizationId: 'org-1',
		userId: 'user-1'
	} as unknown as IAgentMiddlewareContext
}
