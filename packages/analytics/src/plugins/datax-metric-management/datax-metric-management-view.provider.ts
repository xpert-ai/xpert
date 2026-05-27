import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { readFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import {
	I18nObject,
	IIndicator,
	IProject,
	IndicatorType,
	JsonSchemaObjectType,
	TIndicatorDraft,
	XpertExtensionViewManifest,
	XpertRemoteComponentEntry,
	XpertRemoteComponentViewSchema,
	XpertResolvedViewHostContext,
	XpertViewActionRequest,
	XpertViewActionResult,
	XpertViewDataResult,
	XpertViewParameterOptionsQuery,
	XpertViewParameterOptionsResult,
	XpertViewQuery,
	XpertViewScalar
} from '@xpert-ai/contracts'
import { IXpertViewExtensionProvider, renderRemoteReactIframeHtml, ViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { FindOptionsOrder, ILike } from 'typeorm'
import { IndicatorService } from '../../indicator'
import { Indicator } from '../../indicator/indicator.entity'
import { ProjectMyQuery } from '../../project'
import {
	AGENT_WORKBENCH_MAIN_SLOT,
	DATA_X_METRIC_PLUGIN_NAME,
	DATA_X_METRIC_PROVIDER_KEY,
	DATA_X_METRIC_REMOTE_ENTRY_KEY,
	DATA_X_METRIC_VIEW_KEY
} from './constants'

const requireFromHere = createRequire(__filename)

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

type ProjectListResult = {
	items: IProject[]
	total: number
}

const createIndicatorInputSchema = {
	type: 'object',
	properties: {
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
		business: {
			type: 'string',
			title: text('Business Definition', '业务口径')
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
		...createIndicatorInputSchema.properties,
		modelId: {
			type: 'string',
			title: text('Model ID', '模型 ID')
		}
	}
} satisfies JsonSchemaObjectType

@Injectable()
@ViewExtensionProvider(DATA_X_METRIC_PROVIDER_KEY)
export class DataXMetricManagementViewProvider implements IXpertViewExtensionProvider {
	constructor(
		private readonly indicatorService: IndicatorService,
		private readonly queryBus: QueryBus
	) {}

	supports(context: XpertResolvedViewHostContext) {
		return context.hostType === 'agent'
	}

	getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
		if (slot !== AGENT_WORKBENCH_MAIN_SLOT) {
			return []
		}

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

		const projectId = getStringParameter(query.parameters, 'projectId')
		if (!projectId) {
			return {
				items: [],
				total: 0,
				meta: {
					reason: 'project_required'
				}
			}
		}

		const modelId = getStringParameter(query.parameters, 'modelId')
		const page = query.page ?? 1
		const pageSize = query.pageSize ?? 20
		const options = {
			where: buildIndicatorWhere(projectId, modelId, query.search),
			relations: ['model'],
			take: pageSize,
			skip: (page - 1) * pageSize,
			order: buildIndicatorOrder(query.sortBy, query.sortDirection)
		}
		const result = await this.indicatorService.findMy(options)

		return {
			items: result.items.map(toMetricRow),
			total: result.total
		}
	}

	async getViewParameterOptions(
		_context: XpertResolvedViewHostContext,
		viewKey: string,
		parameterKey: string,
		query: XpertViewParameterOptionsQuery
	): Promise<XpertViewParameterOptionsResult> {
		if (viewKey !== DATA_X_METRIC_VIEW_KEY) {
			return { items: [] }
		}

		const projects = await this.loadProjects()
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
			const projectId = getStringParameter(query.parameters, 'projectId')
			const project = projects.find((item) => item.id === projectId)
			const models = Array.isArray(project?.models) ? project.models : []

			return {
				items: models
					.map((model) => toModelOption(model))
					.filter((model) => !search || model.label.toLowerCase().includes(search))
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
			const projectId = getStringParameter(request.parameters, 'projectId')
			if (!projectId) {
				return failure('Project is required', '请先选择项目')
			}
			await this.indicatorService.createDraft(toIndicatorDraft(request.input), projectId)
			return success('Metric created', '指标已创建')
		}

		const targetId = request.targetId?.trim()
		if (!targetId) {
			return failure('Target metric is required', '缺少目标指标')
		}

		if (actionKey === 'edit') {
			await this.indicatorService.updateDraft(targetId, toIndicatorDraft(request.input))
			return success('Metric updated', '指标已更新')
		}

		if (actionKey === 'publish') {
			await this.indicatorService.publish(targetId)
			return success('Metric published', '指标已发布')
		}

		if (actionKey === 'embedding') {
			await this.indicatorService.embedding(targetId)
			return success('Metric embedded', '指标已向量化')
		}

		if (actionKey === 'delete') {
			await this.indicatorService.deleteById(targetId)
			return success('Metric deleted', '指标已删除')
		}

		return failure('Unsupported action', '不支持的操作')
	}

	private async loadProjects(): Promise<IProject[]> {
		const result = await this.queryBus.execute<unknown, ProjectListResult>(
			new ProjectMyQuery({
				relations: ['models']
			})
		)
		return result.items
	}
}

type MetricRow = {
	id: string
	code?: string
	name?: string
	type?: string
	status?: string
	modelId?: string
	modelName?: string
	embeddingStatus?: string
	visible?: boolean
	updatedAt?: Date
	draft?: unknown
}

type ModelOptionSource = {
	id?: string
	name?: string
	title?: string
}

function buildIndicatorWhere(projectId: string, modelId?: string, search?: string) {
	const base = {
		projectId,
		...(modelId ? { modelId } : {})
	}
	const normalizedSearch = search?.trim()

	if (!normalizedSearch) {
		return base
	}

	const pattern = `%${normalizedSearch}%`
	return [
		{ ...base, code: ILike(pattern) },
		{ ...base, name: ILike(pattern) },
		{ ...base, business: ILike(pattern) }
	]
}

function buildIndicatorOrder(sortBy?: string, sortDirection?: string): FindOptionsOrder<Indicator> {
	const direction = sortDirection === 'asc' ? 'ASC' : 'DESC'
	if (
		sortBy === 'code' ||
		sortBy === 'name' ||
		sortBy === 'type' ||
		sortBy === 'status' ||
		sortBy === 'embeddingStatus' ||
		sortBy === 'updatedAt'
	) {
		return { [sortBy]: direction } as FindOptionsOrder<Indicator>
	}

	return { updatedAt: 'DESC' }
}

function toMetricRow(indicator: IIndicator): MetricRow {
	const model = indicator.model as ModelOptionSource | undefined

	return {
		id: indicator.id,
		code: indicator.code,
		name: indicator.name,
		type: indicator.type,
		status: indicator.status,
		modelId: indicator.modelId,
		modelName: model?.name ?? model?.title ?? indicator.modelId,
		embeddingStatus: indicator.embeddingStatus,
		visible: indicator.visible,
		updatedAt: indicator.updatedAt,
		draft: indicator.draft
	}
}

function toModelOption(model: unknown) {
	const source = model as ModelOptionSource
	return {
		value: source.id ?? '',
		label: source.name ?? source.title ?? source.id ?? ''
	}
}

function getStringParameter(parameters: Record<string, XpertViewScalar | XpertViewScalar[]> | undefined, key: string) {
	const value = parameters?.[key]
	const normalized = Array.isArray(value) ? value[0] : value
	return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined
}

function toIndicatorDraft(input: Record<string, unknown> | null | undefined): TIndicatorDraft {
	const source = input ?? {}
	return {
		code: getOptionalString(source, 'code'),
		name: getOptionalString(source, 'name'),
		type: getIndicatorType(source),
		modelId: getOptionalString(source, 'modelId'),
		entity: getOptionalString(source, 'entity'),
		business: getOptionalString(source, 'business'),
		unit: getOptionalString(source, 'unit'),
		visible: getOptionalBoolean(source, 'visible') ?? true,
		isApplication: getOptionalBoolean(source, 'isApplication') ?? false
	}
}

function getOptionalString(source: Record<string, unknown>, key: string) {
	const value = source[key]
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getOptionalBoolean(source: Record<string, unknown>, key: string) {
	const value = source[key]
	return typeof value === 'boolean' ? value : undefined
}

function getIndicatorType(source: Record<string, unknown>) {
	const value = source['type']
	if (value === IndicatorType.BASIC || value === IndicatorType.DERIVE) {
		return value
	}
	return IndicatorType.BASIC
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
