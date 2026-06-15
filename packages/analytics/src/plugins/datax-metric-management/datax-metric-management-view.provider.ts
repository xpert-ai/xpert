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
import {
	IXpertViewExtensionProvider,
	renderRemoteReactIframeHtml,
	ViewExtensionProvider,
	XpertViewFileActionFile
} from '@xpert-ai/plugin-sdk'
import {
	AGENT_WORKBENCH_FIXED_SLOT,
	AGENT_WORKBENCH_MAIN_SLOT,
	DATA_X_METRIC_APPROVALS_VIEW_KEY,
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
	toCertificationOption,
	toModelOption
} from './datax-metric-management.service'

const requireFromHere = createRequire(__filename)
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024

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
		certificationId: {
			type: 'string',
			title: text('Certification', '认证')
		},
		principal: {
			type: 'string',
			title: text('Principal', '负责人')
		},
		validity: {
			type: 'string',
			title: text('Validity', '有效期')
		},
		aggregator: {
			type: 'string',
			title: text('SQL Aggregator', 'SQL 聚合器')
		},
		dimensions: {
			type: 'array',
			title: text('Free Dimensions', '自由维度'),
			items: {
				type: 'string'
			}
		},
		visible: {
			type: 'boolean',
			title: text('Visible', '可见'),
			default: true
		},
		isApplication: {
			type: 'boolean',
			title: text('Available In Apps', '应用可用'),
			default: false
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
					},
					{
						key: 'certificationId',
						label: text('Certification', '认证'),
						type: 'string',
						optionSource: {
							mode: 'provider',
							searchable: true,
							preload: true
						}
					},
					{
						key: 'tagId',
						label: text('Tag', '标签'),
						type: 'string',
						optionSource: {
							mode: 'provider',
							searchable: true,
							preload: true,
							dependsOn: ['projectId']
						}
					},
					{
						key: 'isApplication',
						label: text('App Available', '应用可用'),
						type: 'boolean',
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
						key: 'duplicate',
						label: text('Duplicate', '复制'),
						icon: 'ri-file-copy-line',
						placement: 'row',
						actionType: 'invoke'
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
					},
					{
						key: 'bulk_delete',
						label: text('Delete Selected', '删除选中'),
						icon: 'ri-delete-bin-2-line',
						placement: 'toolbar',
						actionType: 'invoke',
						inputSchema: {
							type: 'object',
							properties: {
								ids: {
									type: 'array',
									title: text('Metric IDs', '指标 ID'),
									items: {
										type: 'string'
									}
								}
							},
							required: ['ids']
						},
						confirm: {
							message: text('Delete selected metrics?', '确认删除选中的指标？')
						}
					},
					{
						key: 'export',
						label: text('Export', '导出'),
						icon: 'ri-download-line',
						placement: 'toolbar',
						actionType: 'invoke',
						inputSchema: {
							type: 'object',
							properties: {
								ids: {
									type: 'array',
									title: text('Metric IDs', '指标 ID'),
									items: {
										type: 'string'
									}
								}
							}
						}
					},
					{
						key: 'import',
						label: text('Import YAML', '导入 YAML'),
						icon: 'ri-upload-line',
						placement: 'toolbar',
						actionType: 'invoke',
						transport: 'file'
					},
					{
						key: 'start_embedding_project',
						label: text('Embed Project', '全量向量化'),
						icon: 'ri-cpu-line',
						placement: 'toolbar',
						actionType: 'invoke'
					},
					{
						key: 'refresh_embedding_status',
						label: text('Refresh Embedding', '刷新向量状态'),
						icon: 'ri-refresh-line',
						placement: 'toolbar',
						actionType: 'invoke'
					}
				]
			},
			{
				key: DATA_X_METRIC_APPROVALS_VIEW_KEY,
				title: text('Metric Approvals', '指标审批'),
				description: text(
					'Review and process Data X metric governance approvals in the workbench.',
					'在 Workbench 中查看并处理 Data X 指标治理审批。'
				),
				hostType: 'agent',
				slot,
				order: 20,
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
									label: text('Metric Approvals', '指标审批'),
									order: 20,
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
				actions: [
					{
						key: 'refresh',
						label: text('Refresh', '刷新'),
						icon: 'ri-refresh-line',
						placement: 'toolbar',
						actionType: 'refresh'
					},
					{
						key: 'approve',
						label: text('Approve', '通过'),
						icon: 'ri-checkbox-circle-line',
						placement: 'row',
						actionType: 'invoke'
					},
					{
						key: 'refuse',
						label: text('Refuse', '拒绝'),
						icon: 'ri-close-circle-line',
						placement: 'row',
						actionType: 'invoke',
						confirm: {
							message: text('Refuse this approval?', '确认拒绝该审批？')
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
		if (!isSupportedViewKey(viewKey) || component.entry !== DATA_X_METRIC_REMOTE_ENTRY_KEY) {
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
		if (viewKey === DATA_X_METRIC_VIEW_KEY) {
			return this.metricManagementService.getViewData(query)
		}

		if (viewKey === DATA_X_METRIC_APPROVALS_VIEW_KEY) {
			return this.metricManagementService.getApprovalsViewData(query)
		}

		if (!isSupportedViewKey(viewKey)) {
			return {}
		}

		return {}
	}

	async getViewParameterOptions(
		context: XpertResolvedViewHostContext,
		viewKey: string,
		parameterKey: string,
		query: XpertViewParameterOptionsQuery
	): Promise<XpertViewParameterOptionsResult> {
		if (!isSupportedViewKey(viewKey)) {
			return { items: [] }
		}

		const search = query.search?.trim().toLowerCase() ?? ''

		if (parameterKey === 'projectId') {
			const projects = await this.metricManagementService.loadProjects()
			return {
				items: projects
					.filter((project) => !search || project.name?.toLowerCase().includes(search))
					.map((project) => ({
						value: project.id,
						label: project.name ?? project.id
					}))
			}
		}

		if (viewKey !== DATA_X_METRIC_VIEW_KEY) {
			return { items: [] }
		}

		if (parameterKey === 'modelId') {
			const projects = await this.metricManagementService.loadProjects()
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

		if (parameterKey === 'certificationId') {
			const certifications = await this.metricManagementService.loadCertifications()
			return {
				items: certifications
					.map((certification) => toCertificationOption(certification))
					.filter((certification) => !search || certification.label.toLowerCase().includes(search))
			}
		}

		if (parameterKey === 'tagId') {
			const projectId = getStringInput(query.parameters, 'projectId')
			const tags = await this.metricManagementService.loadMetricTags(projectId)
			return {
				items: tags
					.map((tag) => ({
						value: tag.id ?? tag.name ?? '',
						label: tag.name ?? tag.id ?? ''
					}))
					.filter((tag) => tag.value && (!search || tag.label.toLowerCase().includes(search)))
			}
		}

		if (parameterKey === 'isApplication') {
			return {
				items: [
					{ value: true, label: 'true' },
					{ value: false, label: 'false' }
				].filter((item) => !search || item.label.includes(search))
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
		if (viewKey === DATA_X_METRIC_APPROVALS_VIEW_KEY) {
			return this.executeApprovalsAction(actionKey, request)
		}

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

		if (actionKey === 'bulk_delete') {
			const ids = getStringArrayInput(request.input, 'ids')
			if (!ids.length) {
				return failure('Select at least one metric', '请先选择至少一个指标')
			}
			const result = await this.metricManagementService.bulkDeleteIndicators(ids)
			return {
				success: result.failures.length === 0,
				message: text(
					`Deleted ${result.deleted.length} metric(s), ${result.failures.length} failed.`,
					`已删除 ${result.deleted.length} 个指标，失败 ${result.failures.length} 个。`
				),
				data: result,
				refresh: result.deleted.length > 0
			}
		}

		if (actionKey === 'export') {
			const result = await this.metricManagementService.exportIndicators(
				actionQuery(request),
				getStringArrayInput(request.input, 'ids')
			)
			return successData('Metrics exported', '指标已导出', result, false)
		}

		if (actionKey === 'start_embedding_project') {
			const projectId = getStringInput(request.parameters, 'projectId')
			if (!projectId) {
				return failure('Project is required', '请先选择项目')
			}
			const result = await this.metricManagementService.startEmbeddingProject(projectId)
			return successData('Project embedding started', '项目指标向量化已启动', result)
		}

		if (actionKey === 'refresh_embedding_status') {
			const result = await this.metricManagementService.refreshEmbeddingStatuses(actionQuery(request))
			return successData('Embedding status refreshed', '向量状态已刷新', result, false)
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

		if (actionKey === 'duplicate') {
			const projectId = getStringInput(request.parameters, 'projectId')
			const row = await this.metricManagementService.duplicateIndicator(targetId, projectId)
			return successData('Metric duplicated', '指标已复制', row)
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

	async executeViewFileAction(
		_context: XpertResolvedViewHostContext,
		viewKey: string,
		actionKey: string,
		request: XpertViewActionRequest,
		file: XpertViewFileActionFile
	): Promise<XpertViewActionResult> {
		if (viewKey !== DATA_X_METRIC_VIEW_KEY || actionKey !== 'import') {
			return failure('Unsupported file action', '不支持的文件操作')
		}

		const projectId = getStringInput(request.parameters, 'projectId')
		if (!projectId) {
			return failure('Project is required', '请先选择项目')
		}
		if ((file.size ?? file.buffer.length) > MAX_IMPORT_FILE_BYTES) {
			return failure('Import file is too large', '导入文件过大')
		}
		if (!isSupportedImportFile(file)) {
			return failure('Only YAML files are supported', '仅支持 YAML 文件')
		}

		const result = await this.metricManagementService.importIndicators(projectId, file.buffer.toString('utf8'))
		return {
			success: result.failures.length === 0,
			message: text(
				`Imported ${result.created.length} metric(s), ${result.failures.length} failed.`,
				`已导入 ${result.created.length} 个指标，失败 ${result.failures.length} 个。`
			),
			data: result,
			refresh: result.created.length > 0
		}
	}

	private async executeApprovalsAction(
		actionKey: string,
		request: XpertViewActionRequest
	): Promise<XpertViewActionResult> {
		if (actionKey === 'refresh') {
			return success('Approvals refreshed', '审批视图已刷新')
		}

		const targetId = request.targetId?.trim()
		if (!targetId) {
			return failure('Target approval is required', '缺少目标审批')
		}

		if (actionKey === 'approve') {
			const row = await this.metricManagementService.approvePermissionApproval(targetId)
			return successData('Approval approved', '审批已通过', row)
		}

		if (actionKey === 'refuse') {
			const row = await this.metricManagementService.refusePermissionApproval(targetId)
			return successData('Approval refused', '审批已拒绝', row)
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

function successData<TData>(en_US: string, zh_Hans: string, data: TData, refresh = true): XpertViewActionResult<TData> {
	return {
		success: true,
		message: text(en_US, zh_Hans),
		data,
		refresh
	}
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
	return {
		success: false,
		message: text(en_US, zh_Hans)
	}
}

function isSupportedViewKey(viewKey: string) {
	return viewKey === DATA_X_METRIC_VIEW_KEY || viewKey === DATA_X_METRIC_APPROVALS_VIEW_KEY
}

function isSupportedImportFile(file: XpertViewFileActionFile) {
	const name = file.originalname?.toLowerCase() ?? ''
	const mimetype = file.mimetype?.toLowerCase() ?? ''
	return (
		name.endsWith('.yaml') ||
		name.endsWith('.yml') ||
		name.endsWith('.txt') ||
		mimetype === 'application/x-yaml' ||
		mimetype === 'application/yaml' ||
		mimetype === 'text/yaml' ||
		mimetype === 'text/plain'
	)
}

function withScopeDefaults(
	input: Record<string, unknown> | null | undefined,
	parameters: Record<string, unknown> | undefined
) {
	return {
		...(input ?? {}),
		...defaultIfMissing(input, 'modelId', getStringInput(parameters, 'modelId')),
		...defaultIfMissing(input, 'businessAreaId', getStringInput(parameters, 'businessAreaId')),
		...defaultIfMissing(input, 'certificationId', getStringInput(parameters, 'certificationId'))
	}
}

function defaultIfMissing(input: Record<string, unknown> | null | undefined, key: string, value: string | undefined) {
	return value && !(input && typeof input[key] === 'string' && input[key]) ? { [key]: value } : {}
}

function getStringArrayInput(input: Record<string, unknown> | null | undefined, key: string) {
	const value = input?.[key]
	if (!Array.isArray(value)) {
		return []
	}
	const seen = new Set<string>()
	const result: string[] = []
	for (const item of value) {
		if (typeof item === 'string' && item.trim() && !seen.has(item.trim())) {
			seen.add(item.trim())
			result.push(item.trim())
		}
	}
	return result
}

function getNumberInput(input: Record<string, unknown> | null | undefined, key: string) {
	const value = input?.[key]
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function actionQuery(request: XpertViewActionRequest): XpertViewQuery {
	return {
		parameters: request.parameters,
		page: getNumberInput(request.input, 'page'),
		pageSize: getNumberInput(request.input, 'pageSize'),
		search: getStringInput(request.input, 'search'),
		sortBy: getStringInput(request.input, 'sortBy'),
		sortDirection: getStringInput(request.input, 'sortDirection') === 'asc' ? 'asc' : 'desc'
	}
}
