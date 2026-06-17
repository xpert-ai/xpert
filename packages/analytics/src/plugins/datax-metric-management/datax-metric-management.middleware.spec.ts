import { IWFNMiddleware, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	__esModule: true,
	AgentMiddlewareStrategy: () => () => undefined
}))
jest.mock('@xpert-ai/server-config', () => ({
	environment: {
		clientBaseUrl: 'http://localhost'
	}
}))
jest.mock('../../ai/queries', () => ({
	GetBIContextQuery: class GetBIContextQuery {
		constructor(
			public readonly models?: string[],
			public readonly params?: unknown
		) {}
	}
}))
jest.mock('../../ai/toolset/builtin/bi-toolset', () => ({
	BIToolsEnum: {
		SHOW_INDICATORS: 'show_indicators'
	},
	updateOcapIndicators: jest.fn()
}))
jest.mock('../../certification', () => ({
	CertificationService: class CertificationService {}
}))
jest.mock('../../indicator', () => ({
	IndicatorService: class IndicatorService {},
	applyIndicatorDraft: (indicator: unknown) => indicator,
	createIndicatorNamespace: (projectId: string) => ['project', projectId, 'indicators']
}))
jest.mock('../../indicator/indicator.entity', () => ({
	Indicator: class Indicator {}
}))
jest.mock('../../model-member', () => ({
	RetrieveMembersCommand: class RetrieveMembersCommand {
		constructor(
			public readonly query: string,
			public readonly options: unknown
		) {}
	}
}))
jest.mock('../../project', () => ({
	CreateProjectStoreCommand: class CreateProjectStoreCommand {
		constructor(public readonly input: unknown) {}
	},
	ProjectGetQuery: class ProjectGetQuery {
		constructor(public readonly input: unknown) {}
	},
	ProjectMyQuery: class ProjectMyQuery {
		constructor(public readonly input: unknown) {}
	}
}))

import {
	DATA_X_METRIC_MANAGEMENT_FEATURE,
	DATA_X_METRIC_PROVIDER_KEY,
	INDICATOR_MANAGEMENT_OPEN_TOOL_NAME
} from './constants'
import { DataXMetricManagementMiddleware } from './datax-metric-management.middleware'
import { DataXMetricManagementService } from './datax-metric-management.service'

describe('DataXMetricManagementMiddleware', () => {
	it('exposes the metric management middleware feature', () => {
		const middleware = new DataXMetricManagementMiddleware(createMetricService())

		expect(middleware.meta.name).toBe(DATA_X_METRIC_PROVIDER_KEY)
		expect(middleware.meta.features).toContain(DATA_X_METRIC_MANAGEMENT_FEATURE)
		expect(middleware.meta.deprecated).toBeUndefined()
	})

	it('creates the metric management middleware with native plugin tools', async () => {
		const service = createMetricService()
		const middleware = await new DataXMetricManagementMiddleware(service).createMiddleware(
			{},
			createMiddlewareContext(DATA_X_METRIC_PROVIDER_KEY)
		)

		expect(service.createSession).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				userId: 'user-1',
				workspaceId: 'workspace-1',
				projectId: 'project-1',
				conversationId: 'conversation-1',
				xpertId: 'xpert-1',
				agentKey: 'agent-1'
			})
		)
		expect(service.session.init).toHaveBeenCalled()
		expect(middleware.name).toBe(DATA_X_METRIC_PROVIDER_KEY)
		expect(middleware.tools?.map((item) => item.name)).toEqual([
			INDICATOR_MANAGEMENT_OPEN_TOOL_NAME,
			'indicator_scope_get',
			'indicator_scope_set',
			'indicator_scope_clear',
			'indicator_scope_options',
			'indicator_scope_preview',
			'create_derive_indicator',
			'create_basic_indicator',
			'list_indicators',
			'indicator_list_cubes',
			'edit_indicator',
			'delete_indicator',
			'indicator_retriever',
			'get_indicator_cube_context',
			'dimension_member_retriever',
			'show_indicators'
		])
	})

	it('preserves the indicator middleware state variables', async () => {
		const middleware = await new DataXMetricManagementMiddleware(createMetricService()).createMiddleware(
			{},
			createMiddlewareContext(DATA_X_METRIC_PROVIDER_KEY)
		)

		const parsed = middleware.stateSchema?.parse({})

		expect(Object.keys(parsed ?? {})).toEqual([
			'tool_indicators_prompts_default',
			'tool_indicators_cubes',
			'tool_indicators_scope',
			'tool_indicators'
		])
		expect(parsed?.tool_indicators_prompts_default).toContain('indicator_scope_get')
		expect(parsed?.tool_indicators_cubes).toContain('model-1')
		expect(parsed?.tool_indicators_scope).toEqual({})
	})

	it('delegates initial state creation to the native metric session', async () => {
		const service = createMetricService()
		const middleware = await new DataXMetricManagementMiddleware(service).createMiddleware(
			{},
			createMiddlewareContext(DATA_X_METRIC_PROVIDER_KEY)
		)

		const initial = (middleware.beforeAgent as (state: Record<string, unknown>) => unknown)?.({
			tool_indicators_prompts_default: 'custom prompt',
			tool_indicators_cubes: 'custom cubes',
			tool_indicators_scope: { projectId: 'project-1' },
			tool_indicators: { indicators: [{ code: 'A' }] }
		})

		expect(service.session.createInitialState).toHaveBeenCalledWith(
			expect.objectContaining({
				tool_indicators_prompts_default: 'custom prompt'
			}),
			expect.stringContaining('indicator_scope_set')
		)
		expect(initial).toEqual({
			tool_indicators_prompts_default: 'custom prompt',
			tool_indicators_cubes: 'custom cubes',
			tool_indicators_scope: { projectId: 'project-1' },
			tool_indicators: { indicators: [{ code: 'A' }] }
		})
	})

	it('restores metric scope from root graph state passed to beforeAgent runtime', async () => {
		const service = createMetricService()
		const middleware = await new DataXMetricManagementMiddleware(service).createMiddleware(
			{},
			createMiddlewareContext(DATA_X_METRIC_PROVIDER_KEY)
		)

		const initial = (
			middleware.beforeAgent as (state: Record<string, unknown>, config: Record<string, unknown>) => unknown
		)?.(
			{
				messages: []
			},
			{
				state: {
					tool_indicators_scope: { projectId: 'project-from-root' },
					tool_indicators_cubes: 'root cubes'
				}
			}
		)

		expect(service.session.createInitialState).toHaveBeenCalledWith(
			expect.objectContaining({
				tool_indicators_scope: { projectId: 'project-from-root' },
				tool_indicators_cubes: 'root cubes'
			}),
			expect.any(String)
		)
		expect(initial).toMatchObject({
			tool_indicators_scope: { projectId: 'project-from-root' }
		})
	})
})

function createMetricService() {
	const session = {
		models: [
			{
				id: 'model-1',
				name: 'Model 1',
				options: {
					schema: {
						cubes: [{ name: 'Sales' }]
					}
				}
			}
		],
		metricScope: {},
		init: jest.fn(async () => undefined),
		createInitialState: jest.fn((state) => state),
		createDeriveIndicatorTool: jest.fn(),
		createBasicIndicatorTool: jest.fn(),
		listIndicatorsTool: jest.fn(),
		listCubesTool: jest.fn(),
		metricScopeGetTool: jest.fn(),
		metricScopeSetTool: jest.fn(),
		metricScopeClearTool: jest.fn(),
		metricScopeOptionsTool: jest.fn(),
		metricScopePreviewTool: jest.fn(),
		editIndicatorTool: jest.fn(),
		deleteIndicatorTool: jest.fn(),
		indicatorRetrieverTool: jest.fn(),
		getCubeContextTool: jest.fn(),
		dimensionMemberRetrieverTool: jest.fn(),
		showIndicatorsTool: jest.fn()
	}
	const service = {
		session,
		createSession: jest.fn(() => session)
	}
	return service as unknown as DataXMetricManagementService & { session: typeof session; createSession: jest.Mock }
}

function createMiddlewareContext(provider: string): IAgentMiddlewareContext {
	return {
		tenantId: 'tenant-1',
		organizationId: 'org-1',
		userId: 'user-1',
		workspaceId: 'workspace-1',
		projectId: 'project-1',
		conversationId: 'conversation-1',
		xpertId: 'xpert-1',
		agentKey: 'agent-1',
		node: createMiddlewareNode(provider),
		tools: new Map(),
		runtime: {
			createModelClient: async () => {
				throw new Error('Not used in metric management middleware tests')
			},
			wrapWorkflowNodeExecution: async () => {
				throw new Error('Not used in metric management middleware tests')
			}
		}
	}
}

function createMiddlewareNode(provider: string): IWFNMiddleware {
	return {
		id: 'middleware-1',
		key: 'middleware-1',
		type: WorkflowNodeTypeEnum.MIDDLEWARE,
		provider
	}
}
