import { Injectable } from '@nestjs/common'
import { BuiltinToolset, IToolsetStrategy, ToolsetStrategy } from '@xpert-ai/plugin-sdk'
import { DataXMetricManagementToolset } from './toolset'
import { buildOpenMetricManagementTool } from './tool'

export const DataXMetricManagementToolsetName = 'datax_metric_management'

@Injectable()
@ToolsetStrategy(DataXMetricManagementToolsetName)
export class DataXMetricManagementStrategy implements IToolsetStrategy<Record<string, never>> {
	meta: IToolsetStrategy<Record<string, never>>['meta'] = {
		author: 'Xpert AI',
		tags: ['data-xpert', 'metric', 'indicator', 'view-extension'],
		name: DataXMetricManagementToolsetName,
		label: {
			en_US: 'Data X Metric Management',
			zh_Hans: 'Data X 指标管理'
		},
		description: {
			en_US: 'Open and operate metric management plugin views in Data X assistant workbench.',
			zh_Hans: '在 Data X Assistant Workbench 中打开并操作指标管理插件视图。'
		},
		icon: {
			type: 'font',
			value: 'ri-line-chart-line',
			color: '#2563eb'
		},
		configSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}

	async validateConfig(): Promise<void> {
		return
	}

	async create(): Promise<BuiltinToolset> {
		return new DataXMetricManagementToolset()
	}

	createTools() {
		return [buildOpenMetricManagementTool()]
	}
}
