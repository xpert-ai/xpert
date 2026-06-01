import { tool } from '@langchain/core/tools'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { IWFNMiddleware, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'

type MockIndicatorToolsetInstance = {
	toolset: unknown
	params: unknown
}

const mockIndicatorTools = [
	'switch_project',
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
].map((name) =>
	tool(async () => name, {
		name,
		description: name,
		schema: z.object({})
	})
)
const mockIndicatorToolsetInstances: MockIndicatorToolsetInstance[] = []

jest.mock('@xpert-ai/plugin-sdk', () => ({
	__esModule: true,
	AgentMiddlewareStrategy: () => () => undefined
}))

jest.mock('../../ai/toolset/builtin/bi-toolset', () => ({
	BIToolsEnum: {
		SHOW_INDICATORS: 'show_indicators'
	}
}))

jest.mock('../../ai/toolset/builtin/indicators/indicators', () => ({
	IndicatorsToolset: class IndicatorsToolset {
		static provider = 'indicators'
		tools = mockIndicatorTools
		models = []

		constructor(
			public readonly toolset: unknown,
			public readonly params: unknown
		) {
			mockIndicatorToolsetInstances.push({ toolset, params })
		}

		async initTools() {
			return this.tools
		}
	}
}))

jest.mock('../../ai/toolset/schema', () => {
	const zod = jest.requireActual<typeof import('zod')>('zod')
	return {
		BasicIndicatorSchema: zod.z.object({
			code: zod.z.string()
		}),
		IndicatorSchema: zod.z.object({
			code: zod.z.string()
		})
	}
})

jest.mock('../../ai/toolset/types', () => ({
	markdownModelCubes: () => 'model cubes'
}))

import {
	DATA_X_METRIC_MANAGEMENT_FEATURE,
	DATA_X_METRIC_PROVIDER_KEY,
	INDICATOR_MANAGEMENT_OPEN_TOOL_NAME
} from './constants'
import { DataXMetricManagementMiddleware } from './datax-metric-management.middleware'

describe('DataXMetricManagementMiddleware', () => {
	beforeEach(() => {
		mockIndicatorToolsetInstances.length = 0
	})

	it('exposes the metric management middleware feature', () => {
		const middleware = new DataXMetricManagementMiddleware(createCommandBus(), createQueryBus())

		expect(middleware.meta.name).toBe(DATA_X_METRIC_PROVIDER_KEY)
		expect(middleware.meta.features).toContain(DATA_X_METRIC_MANAGEMENT_FEATURE)
		expect(middleware.meta.deprecated).toBeUndefined()
	})

	it('creates the metric management middleware with the indicator tool surface', async () => {
		const middleware = await new DataXMetricManagementMiddleware(
			createCommandBus(),
			createQueryBus()
		).createMiddleware({}, createMiddlewareContext(DATA_X_METRIC_PROVIDER_KEY))

		expect(middleware.name).toBe(DATA_X_METRIC_PROVIDER_KEY)
		expect(middleware.tools?.map((item) => item.name)).toEqual([
			INDICATOR_MANAGEMENT_OPEN_TOOL_NAME,
			'switch_project',
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
		const middleware = await new DataXMetricManagementMiddleware(
			createCommandBus(),
			createQueryBus()
		).createMiddleware({}, createMiddlewareContext(DATA_X_METRIC_PROVIDER_KEY))

		const parsed = middleware.stateSchema?.parse({})

		expect(Object.keys(parsed ?? {})).toEqual([
			'tool_indicators_prompts_default',
			'tool_indicators_cubes',
			'tool_indicators'
		])
		expect(parsed?.tool_indicators_cubes).toBe('model cubes')
	})

	it('passes middleware runtime context to the existing indicators toolset', async () => {
		const commandBus = createCommandBus()
		const queryBus = createQueryBus()
		await new DataXMetricManagementMiddleware(commandBus, queryBus).createMiddleware(
			{},
			createMiddlewareContext(DATA_X_METRIC_PROVIDER_KEY)
		)

		expect(mockIndicatorToolsetInstances).toHaveLength(1)
		expect(mockIndicatorToolsetInstances[0]?.toolset).toMatchObject({
			name: 'Data X Metric Management',
			type: 'indicators',
			tools: []
		})
		expect(mockIndicatorToolsetInstances[0]?.params).toMatchObject({
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			userId: 'user-1',
			projectId: 'project-1',
			conversationId: 'conversation-1',
			xpertId: 'xpert-1',
			agentKey: 'agent-1',
			commandBus,
			queryBus
		})
	})
})

function createCommandBus() {
	return Object.assign(Object.create(CommandBus.prototype), {
		execute: jest.fn()
	}) as CommandBus
}

function createQueryBus() {
	return Object.assign(Object.create(QueryBus.prototype), {
		execute: jest.fn()
	}) as QueryBus
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
