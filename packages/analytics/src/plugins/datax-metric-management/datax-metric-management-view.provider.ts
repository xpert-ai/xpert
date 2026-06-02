import { Injectable } from '@nestjs/common'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import {
	I18nObject,
	IconDefinition,
	IndicatorStatusEnum,
	IndicatorType,
	JsonSchemaObjectType,
	XpertExtensionViewManifest,
	XpertRemoteComponentEntry,
	XpertRemoteComponentViewSchema,
	XpertResolvedViewHostContext,
	XpertViewActionRequest,
	XpertViewActionResult,
	XpertViewDataResult,
	XpertViewParameterOptionsQuery,
	XpertViewParameterOptionsResult,
	XpertViewQuery
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import {
	AGENT_WORKBENCH_FIXED_SLOT,
	AGENT_WORKBENCH_MAIN_SLOT,
	DATA_X_METRIC_MANAGEMENT_FEATURE,
	DATA_X_METRIC_MANAGEMENT_TOOL_NAMES,
	DATA_X_METRIC_PLUGIN_NAME,
	DATA_X_METRIC_PROVIDER_KEY,
	DATA_X_METRIC_REMOTE_ENTRY_KEY,
	DATA_X_METRIC_VIEW_KEY
} from './constants'
import {
	DataXMetricManagementService,
	getStringInput,
	toBusinessAreaOption,
	toModelOption
} from './datax-metric-management.service'

const requireFromHere = createRequire(__filename)

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const DATA_X_METRIC_VIEW_ICON = {
	type: 'svg',
	value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 3 5-7"/></svg>',
	alt: 'Metric Management'
} satisfies IconDefinition
const DATA_X_METRIC_REMOTE_CSS = `
html,
body,
#root {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.xui-app {
  display: flex;
  height: 100vh;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.xui-metric-sticky-toolbar {
  position: sticky;
  top: 0;
  flex: 0 0 auto;
  z-index: 40;
  padding: 2px 0 10px;
  background: var(--xui-color-background);
}

.xui-notice,
.xui-pager {
  flex: 0 0 auto;
}

.xui-empty,
.xui-table-wrap {
  flex: 1 1 auto;
  min-height: 0;
}

.xui-table-wrap {
  overflow: auto;
}

.xui-table {
  width: max-content;
  min-width: 100%;
}

.xui-table th,
.xui-table td {
  white-space: nowrap;
}

.xui-table thead th {
  position: sticky;
  top: 0;
  z-index: 30;
}

.xui-table-actions-cell {
  min-width: 232px;
}

.xui-table-actions {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  min-width: max-content;
  white-space: nowrap;
}

.xui-table-actions .xui-button {
  flex: 0 0 auto;
}

.xui-metric-pager {
  justify-content: space-between;
  min-height: var(--xui-button-height-sm);
}

.xui-metric-pager-total {
  white-space: nowrap;
}

.xui-metric-pager-actions {
  align-items: center;
  justify-content: flex-end;
  flex-wrap: nowrap;
  margin-left: auto;
  white-space: nowrap;
}

.xui-metric-pager-actions .xui-button,
.xui-metric-pager-actions .xui-muted {
  flex: 0 0 auto;
}

.xui-metric-pager-actions .xui-muted {
  display: inline-flex;
  min-height: var(--xui-button-height-sm);
  align-items: center;
}

@media (max-width: 760px) {
  .xui-metric-sticky-toolbar {
    position: sticky;
  }
}
`

const filterInputSchema = {
	type: 'object' as const,
	properties: {
		dimension: {
			type: 'string',
			title: text('Dimension', '维度')
		},
		hierarchy: {
			type: 'string',
			title: text('Hierarchy', '层级')
		},
		member: {
			type: 'string',
			title: text('Member', '成员')
		}
	}
} satisfies JsonSchemaObjectType

const createIndicatorInputSchema = {
	type: 'object',
	properties: {
		modelId: {
			type: 'string',
			title: text('Model ID', '模型 ID')
		},
		businessAreaId: {
			type: 'string',
			title: text('Business Area', '业务域')
		},
		cube: {
			type: 'string',
			title: text('Cube', '立方体')
		},
		code: {
			type: 'string',
			title: text('Code', '编码')
		},
		name: {
			type: 'string',
			title: text('Name', '名称')
		},
		type: {
			type: 'string',
			title: text('Type', '类型'),
			enum: [IndicatorType.BASIC, IndicatorType.DERIVE],
			default: IndicatorType.BASIC
		},
		entity: {
			type: 'string',
			title: text('Entity', '实体')
		},
		description: {
			type: 'string',
			title: text('Description', '描述')
		},
		business: {
			type: 'string',
			title: text('Business Definition', '业务口径')
		},
		calendar: {
			type: 'string',
			title: text('Calendar', '日历')
		},
		measure: {
			type: 'string',
			title: text('Measure', '度量')
		},
		formula: {
			type: 'string',
			title: text('Formula', '公式')
		},
		filters: {
			type: 'array',
			title: text('Filters', '过滤条件'),
			items: filterInputSchema
		},
		unit: {
			type: 'string',
			title: text('Unit', '单位')
		},
		visible: {
			type: 'boolean',
			title: text('Visible', '可见'),
			default: true
		}
	},
	required: ['code', 'name']
} satisfies JsonSchemaObjectType

const editIndicatorInputSchema = {
	...createIndicatorInputSchema,
	properties: {
		...createIndicatorInputSchema.properties
	}
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(DATA_X_METRIC_PROVIDER_KEY)
export class DataXMetricManagementViewProvider implements IXpertViewExtensionProvider {
	constructor(private readonly metricManagementService: DataXMetricManagementService) {}

	supports(context: XpertResolvedViewHostContext) {
		return context.hostType === 'agent'
	}

	getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
		if (slot !== AGENT_WORKBENCH_MAIN_SLOT && slot !== AGENT_WORKBENCH_FIXED_SLOT) {
			return []
		}

		const isFixedWorkbenchView = slot === AGENT_WORKBENCH_FIXED_SLOT

		return [
			{
				key: DATA_X_METRIC_VIEW_KEY,
				title: text('Metric Management', '指标管理'),
				description: text(
					'Maintain and publish Data X indicators from a tool-triggered workbench view.',
					'通过工具触发的 Workbench 视图维护和发布 Data X 指标。'
				),
				hostType: 'agent',
				slot,
				order: 10,
				refreshable: true,
				activation: {
					requiredFeatures: [DATA_X_METRIC_MANAGEMENT_FEATURE]
				},
				...(isFixedWorkbenchView
					? {
							workbench: {
								fixed: true,
								menu: {
									enabled: true,
									label: text('Metric Management', '指标管理'),
									order: 10,
									icon: DATA_X_METRIC_VIEW_ICON
								}
							}
						}
					: {}),
				source: {
					provider: DATA_X_METRIC_PROVIDER_KEY,
					plugin: DATA_X_METRIC_PLUGIN_NAME
				},
				parameters: [
					{
						key: 'projectId',
						label: text('Project', '项目'),
						required: true,
						type: 'string',
						optionSource: {
							mode: 'provider',
							searchable: true,
							preload: true
						}
					},
					{
						key: 'modelId',
						label: text('Model', '模型'),
						type: 'string',
						optionSource: {
							mode: 'provider',
							searchable: true,
							preload: true,
							dependsOn: ['projectId']
						}
					},
					{
						key: 'businessAreaId',
						label: text('Business Area', '业务域'),
						type: 'string',
						optionSource: {
							mode: 'provider',
							searchable: true,
							preload: true,
							dependsOn: ['projectId']
						}
					},
					{
						key: 'status',
						label: text('Status', '状态'),
						type: 'string',
						optionSource: {
							mode: 'provider',
							preload: true
						}
					},
					{
						key: 'type',
						label: text('Type', '类型'),
						type: 'string',
						optionSource: {
							mode: 'provider',
							preload: true
						}
					}
				],
				view: {
					type: 'remote_component',
					runtime: 'react',
					protocolVersion: 1,
					component: {
						isolation: 'iframe',
						entry: DATA_X_METRIC_REMOTE_ENTRY_KEY
					},
					dataSource: {
						mode: 'platform'
					}
				},
				dataSource: {
					mode: 'platform',
					querySchema: {
						supportsPagination: true,
						supportsSearch: true,
						supportsSort: true,
						supportsFilter: true,
						supportsParameters: true,
						defaultPageSize: 20
					},
					cache: {
						enabled: false
					}
				},
				hostEvents: {
					subscriptions: [
						{
							key: 'datax-metric-management-tool-completed',
							event: 'assistant.tool.completed',
							filter: {
								sources: ['chatkit'],
								toolNames: [...DATA_X_METRIC_MANAGEMENT_TOOL_NAMES]
							},
							action: {
								type: 'forward',
								debounceMs: 1000
							}
						}
					]
				},
				actions: [
					{
						key: 'refresh',
						label: text('Refresh', '刷新'),
						icon: 'ri-refresh-line',
						placement: 'toolbar',
						actionType: 'refresh'
					},
					{
						key: 'create',
						label: text('Create', '新建'),
						icon: 'ri-add-line',
						placement: 'toolbar',
						actionType: 'invoke',
						inputSchema: createIndicatorInputSchema
					},
					{
						key: 'edit',
						label: text('Edit', '编辑'),
						icon: 'ri-edit-line',
						placement: 'row',
						actionType: 'invoke',
						inputDefaults: 'target',
						inputSchema: editIndicatorInputSchema
					},
					{
						key: 'publish',
						label: text('Publish', '发布'),
						icon: 'ri-send-plane-line',
						placement: 'row',
						actionType: 'invoke'
					},
					{
						key: 'embedding',
						label: text('Embed', '向量化'),
						icon: 'ri-cpu-line',
						placement: 'row',
						actionType: 'invoke'
					},
					{
						key: 'delete',
						label: text('Delete', '删除'),
						icon: 'ri-delete-bin-line',
						placement: 'row',
						actionType: 'invoke',
						confirm: {
							message: text('Delete this metric?', '确认删除该指标？')
						}
					}
				]
			}
		]
	}

	async getRemoteComponentEntry(
		_context: XpertResolvedViewHostContext,
		viewKey: string,
		component: XpertRemoteComponentViewSchema['component']
	): Promise<XpertRemoteComponentEntry> {
		if (viewKey !== DATA_X_METRIC_VIEW_KEY || component.entry !== DATA_X_METRIC_REMOTE_ENTRY_KEY) {
			return {
				html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
				contentType: 'text/html; charset=utf-8'
			}
		}

		const appScript = await readFile(
			join(__dirname, 'remote-components', DATA_X_METRIC_REMOTE_ENTRY_KEY, 'app.js'),
			'utf8'
		)
		const react = await readPackageFile('react', 'umd/react.production.min.js')
		const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')

		return {
			html: renderRemoteReactIframeHtml({
				title: 'Metric Management',
				lang: 'zh-Hans',
				reactUmd: react,
				reactDomUmd: reactDom,
				appCss: DATA_X_METRIC_REMOTE_CSS,
				appScript
			}),
			contentType: 'text/html; charset=utf-8'
		}
	}

	async getViewData(
		_context: XpertResolvedViewHostContext,
		viewKey: string,
		query: XpertViewQuery
	): Promise<XpertViewDataResult> {
		if (viewKey !== DATA_X_METRIC_VIEW_KEY) {
			return {}
		}

		return this.metricManagementService.getViewData(query)
	}

	async getViewParameterOptions(
		context: XpertResolvedViewHostContext,
		viewKey: string,
		parameterKey: string,
		query: XpertViewParameterOptionsQuery
	): Promise<XpertViewParameterOptionsResult> {
		if (viewKey !== DATA_X_METRIC_VIEW_KEY) {
			return { items: [] }
		}

		const projects = await this.metricManagementService.loadProjects()
		const search = query.search?.trim().toLowerCase() ?? ''

		if (parameterKey === 'projectId') {
			return {
				items: projects
					.filter((project) => !search || project.name?.toLowerCase().includes(search))
					.map((project) => ({
						value: project.id,
						label: project.name ?? project.id
					}))
			}
		}

		if (parameterKey === 'modelId') {
			const projectId = getStringInput(query.parameters, 'projectId')
			const project = projects.find((item) => item.id === projectId)
			const models = Array.isArray(project?.models) ? project.models : []

			return {
				items: models
					.map((model) => toModelOption(model))
					.filter((model) => !search || model.label.toLowerCase().includes(search))
			}
		}

		if (parameterKey === 'businessAreaId') {
			const projectId = getStringInput(query.parameters, 'projectId')
			const areas = await this.metricManagementService.loadBusinessAreas(projectId, context.userId)

			return {
				items: areas
					.map((area) => toBusinessAreaOption(area))
					.filter((area) => !search || area.label.toLowerCase().includes(search))
			}
		}

		if (parameterKey === 'status') {
			return {
				items: Object.values(IndicatorStatusEnum)
					.map((value) => ({ value, label: value }))
					.filter((item) => !search || item.label.toLowerCase().includes(search))
			}
		}

		if (parameterKey === 'type') {
			return {
				items: Object.values(IndicatorType)
					.map((value) => ({ value, label: value }))
					.filter((item) => !search || item.label.toLowerCase().includes(search))
			}
		}

		return { items: [] }
	}

	async executeViewAction(
		_context: XpertResolvedViewHostContext,
		viewKey: string,
		actionKey: string,
		request: XpertViewActionRequest
	): Promise<XpertViewActionResult> {
		if (viewKey !== DATA_X_METRIC_VIEW_KEY) {
			return failure('Unsupported view', '不支持的视图')
		}

		if (actionKey === 'refresh') {
			return success('Metrics refreshed', '指标视图已刷新')
		}

		if (actionKey === 'create') {
			const projectId = getStringInput(request.parameters, 'projectId')
			if (!projectId) {
				return failure('Project is required', '请先选择项目')
			}
			await this.metricManagementService.createViewDraft(
				projectId,
				withScopeDefaults(request.input, request.parameters)
			)
			return success('Metric created', '指标已创建')
		}

		const targetId = request.targetId?.trim()
		if (!targetId) {
			return failure('Target metric is required', '缺少目标指标')
		}

		if (actionKey === 'edit') {
			await this.metricManagementService.updateViewDraft(
				targetId,
				withScopeDefaults(request.input, request.parameters)
			)
			return success('Metric updated', '指标已更新')
		}

		if (actionKey === 'publish') {
			await this.metricManagementService.publishIndicator(targetId)
			return success('Metric published', '指标已发布')
		}

		if (actionKey === 'embedding') {
			await this.metricManagementService.embeddingIndicator(targetId)
			return success('Metric embedded', '指标已向量化')
		}

		if (actionKey === 'delete') {
			await this.metricManagementService.deleteIndicatorById(targetId)
			return success('Metric deleted', '指标已删除')
		}

		return failure('Unsupported action', '不支持的操作')
	}
}

async function readPackageFile(packageName: string, relativePath: string) {
	const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
	return readFile(join(packageRoot, relativePath), 'utf8')
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
	return {
		success: true,
		message: text(en_US, zh_Hans),
		refresh: true
	}
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
	return {
		success: false,
		message: text(en_US, zh_Hans)
	}
}

function withScopeDefaults(
	input: Record<string, unknown> | null | undefined,
	parameters: Record<string, unknown> | undefined
) {
	return {
		...(input ?? {}),
		...defaultIfMissing(input, 'modelId', getStringInput(parameters, 'modelId')),
		...defaultIfMissing(input, 'businessAreaId', getStringInput(parameters, 'businessAreaId'))
	}
}

function defaultIfMissing(input: Record<string, unknown> | null | undefined, key: string, value: string | undefined) {
	return value && !(input && typeof input[key] === 'string' && input[key]) ? { [key]: value } : {}
}
