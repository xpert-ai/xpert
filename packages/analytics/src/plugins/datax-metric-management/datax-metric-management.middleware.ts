import { Injectable } from '@nestjs/common'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
	AgentMiddleware,
	AgentMiddlewareStrategy,
	IAgentMiddlewareContext,
	IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { DATA_X_METRIC_ICON, DATA_X_METRIC_MANAGEMENT_FEATURE, DATA_X_METRIC_PROVIDER_KEY } from './constants'
import { DataXMetricManagementService } from './datax-metric-management.service'
import { DataXMetricManagementRuntime } from './runtime'

export const DataXMetricManagementMiddlewareName = DATA_X_METRIC_PROVIDER_KEY

@Injectable()
@AgentMiddlewareStrategy(DataXMetricManagementMiddlewareName)
export class DataXMetricManagementMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
	readonly meta = createDataXMetricManagementMeta(DataXMetricManagementMiddlewareName)

	constructor(private readonly metricManagementService: DataXMetricManagementService) {}

	async createMiddleware(
		_options: Record<string, never>,
		context: IAgentMiddlewareContext
	): Promise<AgentMiddleware> {
		const runtime = new DataXMetricManagementRuntime(this.metricManagementService.createSession(context))
		await runtime.init()

		return {
			name: DataXMetricManagementMiddlewareName,
			stateSchema: runtime.createStateSchema(),
			tools: runtime.createTools(),
			beforeAgent: (state, config) =>
				runtime.createInitialState({
					...((config as { state?: Record<string, unknown> } | undefined)?.state ?? {}),
					...(state ?? {})
				})
		}
	}
}

function createDataXMetricManagementMeta(name: string): TAgentMiddlewareMeta {
	return {
		name,
		label: {
			en_US: 'Data X Metric Management',
			zh_Hans: 'Data X 指标管理'
		},
		description: {
			en_US: 'Adds middleware tools for creating, querying, operating, and opening metric management views in Data X assistant workbench.',
			zh_Hans: '在 Data X Assistant Workbench 中提供创建、查询、操作并打开指标管理插件视图的中间件工具。'
		},
		icon: {
			type: 'svg',
			value: DATA_X_METRIC_ICON,
			color: '#2563eb'
		},
		features: [DATA_X_METRIC_MANAGEMENT_FEATURE],
		configSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}
}
