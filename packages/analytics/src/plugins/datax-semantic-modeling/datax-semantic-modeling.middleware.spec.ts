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
jest.mock('../../ai/toolset/builtin/bi-toolset', () => ({
	BIVariableEnum: {
		CurrentCubeContext: 'tool_cube_context'
	}
}))
jest.mock('../../ai/toolset/builtin/semantic-model/types', () => ({
	SemanticModelVariableEnum: {
		LatestState: 'semantic_model_latest_state'
	}
}))
jest.mock('../../ai/toolset/builtin/semantic-model/prompts', () => ({
	TOOL_MODEL_PROMPTS_DEFAULT: 'Native semantic modeling prompt.'
}))
jest.mock('../../ai/toolset/builtin/semantic-model/semantic-model', () => ({
	SemanticModelToolset: class SemanticModelToolset {
		static provider = 'semantic-model'

		async initTools() {
			return [{ name: 'switch_model_workspace' }, { name: 'edit_cube' }, { name: 'preview_cube' }]
		}
	}
}))

import {
	DATA_X_SEMANTIC_MODELING_FEATURE,
	DATA_X_SEMANTIC_MODELING_MIDDLEWARE_NAME,
	DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME
} from './constants'
import { DataXSemanticModelingMiddleware } from './datax-semantic-modeling.middleware'
import { DataXSemanticModelingService } from './datax-semantic-modeling.service'

describe('DataXSemanticModelingMiddleware', () => {
	it('combines Agentic workspace tools with focused native semantic editing tools', async () => {
		const service = createService()
		const strategy = new DataXSemanticModelingMiddleware(
			service as unknown as DataXSemanticModelingService,
			{ execute: jest.fn() } as never,
			{ execute: jest.fn() } as never
		)
		const middleware = await strategy.createMiddleware({}, createContext())

		expect(strategy.meta).toMatchObject({
			name: DATA_X_SEMANTIC_MODELING_MIDDLEWARE_NAME,
			features: [DATA_X_SEMANTIC_MODELING_FEATURE]
		})
		expect(middleware.tools?.map((item) => item.name)).toEqual(
			expect.arrayContaining([
				DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME,
				DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME,
				'switch_model_workspace',
				'edit_cube',
				'preview_cube'
			])
		)

		const list = middleware.tools?.find((item) => item.name === DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME)
		const output = JSON.parse(String(await list?.invoke({ search: 'retail', limit: 10 })))

		expect(service.listWorkspaces).toHaveBeenCalledWith('retail', 10)
		expect(output).toMatchObject({
			count: 1,
			workspaces: [{ id: 'model-1', name: 'Retail' }]
		})
	})
})

function createService() {
	return {
		listWorkspaces: jest.fn(async () => [{ id: 'model-1', name: 'Retail' }]),
		createWorkspace: jest.fn(),
		saveDraft: jest.fn(),
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
		agentKey: 'agent-1',
		store: {
			get: jest.fn(),
			put: jest.fn(),
			delete: jest.fn()
		}
	} as unknown as IAgentMiddlewareContext
}
