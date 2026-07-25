import { AIMessage, SystemMessage } from '@langchain/core/messages'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	AgentMiddlewareStrategy: () => () => undefined
}))
jest.mock('../../data-source', () => ({
	DataSourceQuery: class DataSourceQuery {},
	DataSourceService: class DataSourceService {}
}))
jest.mock('../../model', () => ({
	SemanticModelCreateCommand: class SemanticModelCreateCommand {},
	SemanticModelPublishCommand: class SemanticModelPublishCommand {},
	SemanticModelService: class SemanticModelService {}
}))

import {
	DATA_X_SEMANTIC_MODEL_DESCRIBE_TABLE_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_EXECUTE_QUERY_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_LIST_DATA_SOURCES_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_LIST_TABLES_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_READ_WORKSPACE_TOOL_NAME,
	DATA_X_SEMANTIC_MODELING_FEATURE,
	DATA_X_SEMANTIC_MODELING_MIDDLEWARE_NAME,
	DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME,
	DATA_X_SEMANTIC_MODELING_TOOL_NAMES
} from './constants'
import { DataXSemanticModelingMiddleware } from './datax-semantic-modeling.middleware'
import { DataXSemanticModelingService } from './datax-semantic-modeling.service'

describe('DataXSemanticModelingMiddleware', () => {
	it('exposes application-service tools without the deprecated semantic model toolset', async () => {
		const service = createService()
		const strategy = new DataXSemanticModelingMiddleware(service as unknown as DataXSemanticModelingService)
		const middleware = strategy.createMiddleware({}, createContext())

		expect(strategy.meta).toMatchObject({
			name: DATA_X_SEMANTIC_MODELING_MIDDLEWARE_NAME,
			features: [DATA_X_SEMANTIC_MODELING_FEATURE]
		})
		expect(middleware.tools?.map((item) => item.name)).toEqual([...DATA_X_SEMANTIC_MODELING_TOOL_NAMES])
		expect(middleware.tools?.map((item) => item.name)).not.toEqual(
			expect.arrayContaining(['switch_model_workspace', 'edit_cube', 'preview_cube'])
		)

		const list = middleware.tools?.find((item) => item.name === DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME)
		const listOutput = JSON.parse(String(await list?.invoke({ search: 'retail', limit: 10 })))
		expect(service.listWorkspaces).toHaveBeenCalledWith('retail', 10)
		expect(listOutput).toMatchObject({
			count: 1,
			workspaces: [{ id: 'model-1', name: 'Retail' }]
		})

		const read = middleware.tools?.find((item) => item.name === DATA_X_SEMANTIC_MODEL_READ_WORKSPACE_TOOL_NAME)
		const readOutput = JSON.parse(String(await read?.invoke({ modelId: 'model-1' })))
		expect(service.getWorkspace).toHaveBeenCalledWith('model-1')
		expect(readOutput).toMatchObject({
			model: { id: 'model-1' },
			draft: { version: 4 }
		})

		const listTables = middleware.tools?.find((item) => item.name === DATA_X_SEMANTIC_MODEL_LIST_TABLES_TOOL_NAME)
		await listTables?.invoke({ modelId: 'model-1' })
		expect(service.listTables).toHaveBeenCalledWith('model-1')

		const describeTable = middleware.tools?.find(
			(item) => item.name === DATA_X_SEMANTIC_MODEL_DESCRIBE_TABLE_TOOL_NAME
		)
		await describeTable?.invoke({ modelId: 'model-1', tableName: 'public.sales' })
		expect(service.getTableSchema).toHaveBeenCalledWith('model-1', 'public.sales')

		const executeQuery = middleware.tools?.find(
			(item) => item.name === DATA_X_SEMANTIC_MODEL_EXECUTE_QUERY_TOOL_NAME
		)
		await executeQuery?.invoke({
			modelId: 'model-1',
			cubeName: 'Sales',
			statement: 'SELECT [Measures].Members ON COLUMNS FROM [Sales]'
		})
		expect(service.executeQuery).toHaveBeenCalledWith(
			'model-1',
			'Sales',
			'SELECT [Measures].Members ON COLUMNS FROM [Sales]',
			200,
			expect.objectContaining({
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				userId: 'user-1'
			})
		)
	})

	it('adds current semantic modeling instructions through wrapModelCall', async () => {
		const strategy = new DataXSemanticModelingMiddleware(createService() as unknown as DataXSemanticModelingService)
		const middleware = strategy.createMiddleware({}, createContext())
		let forwardedSystemMessage: SystemMessage | undefined

		await middleware.wrapModelCall?.(
			{
				systemMessage: new SystemMessage('Base instructions')
			} as never,
			async (request) => {
				forwardedSystemMessage = request.systemMessage
				return new AIMessage('done')
			}
		)

		expect(forwardedSystemMessage?.content).toContain('Base instructions')
		expect(forwardedSystemMessage?.content).toContain(DATA_X_SEMANTIC_MODEL_READ_WORKSPACE_TOOL_NAME)
		expect(forwardedSystemMessage?.content).toContain(DATA_X_SEMANTIC_MODEL_LIST_DATA_SOURCES_TOOL_NAME)
		expect(forwardedSystemMessage?.content).toContain(DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME)
		expect(forwardedSystemMessage?.content).not.toContain('switch_model_workspace')
	})
})

function createService() {
	return {
		listWorkspaces: jest.fn(async () => [{ id: 'model-1', name: 'Retail' }]),
		listDataSources: jest.fn(async () => [{ id: 'source-1', name: 'Warehouse' }]),
		getWorkspace: jest.fn(async () => ({
			model: { id: 'model-1', name: 'Retail' },
			draft: { version: 4, schema: { name: 'Retail' } },
			cubes: [],
			dimensions: [],
			checklist: []
		})),
		listTables: jest.fn(async () => [{ name: 'sales' }]),
		getTableSchema: jest.fn(async () => [{ name: 'sales', columns: [{ name: 'amount' }] }]),
		createWorkspace: jest.fn(),
		saveDraft: jest.fn(),
		executeQuery: jest.fn(async () => ({
			modelId: 'model-1',
			cubeName: 'Sales',
			columns: [],
			rows: [],
			rowCount: 0,
			totalRowCount: 0,
			truncated: false,
			audit: {}
		})),
		publishWorkspace: jest.fn()
	}
}

function createContext() {
	return {
		tenantId: 'tenant-1',
		organizationId: 'org-1',
		userId: 'user-1',
		projectId: 'project-1',
		conversationId: 'conversation-1',
		xpertId: 'xpert-1',
		agentKey: 'agent-1'
	} as IAgentMiddlewareContext
}
