import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import {
	I18nObject,
	IconDefinition,
	JsonSchemaObjectType,
	ModelTypeEnum,
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
import { Injectable } from '@nestjs/common'
import {
	DATA_X_SEMANTIC_MODELING_FEATURE,
	DATA_X_SEMANTIC_MODELING_FIXED_SLOT,
	DATA_X_SEMANTIC_MODELING_ICON,
	DATA_X_SEMANTIC_MODELING_MAIN_SLOT,
	DATA_X_SEMANTIC_MODELING_PLUGIN_NAME,
	DATA_X_SEMANTIC_MODELING_PROVIDER_KEY,
	DATA_X_SEMANTIC_MODELING_REMOTE_ENTRY_KEY,
	DATA_X_SEMANTIC_MODELING_TOOL_NAMES,
	DATA_X_SEMANTIC_MODELING_VIEW_KEY
} from './constants'
import { DataXSemanticModelingService } from './datax-semantic-modeling.service'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const VIEW_ICON = {
	type: 'svg',
	value: DATA_X_SEMANTIC_MODELING_ICON,
	alt: 'Semantic Modeling'
} satisfies IconDefinition

const CREATE_WORKSPACE_INPUT_SCHEMA = {
	type: 'object',
	properties: {
		key: {
			type: 'string',
			title: text('Key', '标识')
		},
		name: {
			type: 'string',
			title: text('Name', '名称')
		},
		description: {
			type: 'string',
			title: text('Description', '描述')
		},
		dataSourceId: {
			type: 'string',
			title: text('Data Source ID', '数据源 ID')
		},
		catalog: {
			type: 'string',
			title: text('Catalog', '目录')
		},
		type: {
			type: 'string',
			title: text('Model Type', '模型类型'),
			enum: [ModelTypeEnum.SQL, ModelTypeEnum.XMLA],
			default: ModelTypeEnum.SQL
		},
		businessAreaId: {
			type: 'string',
			title: text('Business Area ID', '业务域 ID')
		},
		changeSummary: {
			type: 'string',
			title: text('Change Summary', '变更说明')
		}
	},
	required: ['key', 'name', 'dataSourceId', 'catalog', 'changeSummary']
} satisfies JsonSchemaObjectType

const SAVE_DRAFT_INPUT_SCHEMA = {
	type: 'object',
	properties: {
		schemaJson: {
			type: 'string',
			title: text('Schema JSON', '模型 Schema JSON')
		},
		baseVersion: {
			type: 'number',
			title: text('Base Version', '基础版本')
		},
		changeSummary: {
			type: 'string',
			title: text('Change Summary', '变更说明')
		}
	},
	required: ['schemaJson', 'changeSummary']
} satisfies JsonSchemaObjectType

const PUBLISH_INPUT_SCHEMA = {
	type: 'object',
	properties: {
		releaseNotes: {
			type: 'string',
			title: text('Release Notes', '发布说明')
		},
		changeSummary: {
			type: 'string',
			title: text('Change Summary', '变更说明')
		}
	},
	required: ['changeSummary']
} satisfies JsonSchemaObjectType

const EXECUTE_QUERY_INPUT_SCHEMA = {
	type: 'object',
	properties: {
		cubeName: {
			type: 'string',
			title: text('Cube', 'Cube')
		},
		statement: {
			type: 'string',
			title: text('MDX Statement', 'MDX 语句')
		},
		limit: {
			type: 'number',
			title: text('Row Limit', '行数上限'),
			default: 200
		}
	},
	required: ['cubeName', 'statement']
} satisfies JsonSchemaObjectType

const REMOTE_CSS = `
html,
body,
#root {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.datax-modeling-app {
  display: grid;
  height: 100vh;
  min-height: 0;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}

.datax-modeling-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 360px) auto auto auto 1fr;
  gap: 8px;
  align-items: center;
  border-bottom: 1px solid var(--xui-color-border);
  padding: 10px 12px;
}

.datax-modeling-body {
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(210px, 260px) minmax(0, 1fr) minmax(260px, 340px);
}

.datax-modeling-panel {
  min-height: 0;
  overflow: auto;
  border-right: 1px solid var(--xui-color-border);
  padding: 12px;
}

.datax-modeling-panel:last-child {
  border-right: 0;
  border-left: 1px solid var(--xui-color-border);
}

.datax-modeling-section-title {
  margin: 0 0 8px;
  font-size: var(--xui-font-size-sm);
  font-weight: 700;
}

.datax-modeling-list {
  display: grid;
  gap: 6px;
}

.datax-modeling-list-item {
  width: 100%;
  height: auto;
  justify-content: flex-start;
  padding: 8px 10px;
  text-align: left;
}

.datax-modeling-editor {
  display: grid;
  min-height: 0;
  grid-template-rows: auto 1fr auto;
  gap: 10px;
  padding: 12px;
}

.datax-modeling-code {
  min-height: 0;
  resize: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.5;
}

.datax-modeling-meta {
  display: grid;
  gap: 10px;
  margin: 0;
}

.datax-modeling-meta div {
  display: grid;
  gap: 2px;
}

.datax-modeling-meta dt {
  color: var(--xui-color-muted-foreground);
  font-size: var(--xui-font-size-xs);
}

.datax-modeling-meta dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.datax-modeling-issues {
  display: grid;
  gap: 6px;
}

.datax-modeling-issue {
  border: 1px solid var(--xui-color-border);
  border-radius: var(--xui-radius-md);
  padding: 8px;
  font-size: var(--xui-font-size-xs);
}

@media (max-width: 980px) {
  .datax-modeling-body {
    grid-template-columns: 190px minmax(0, 1fr);
  }

  .datax-modeling-panel:last-child {
    display: none;
  }
}
`

@Injectable()
@ViewExtensionProvider(DATA_X_SEMANTIC_MODELING_PROVIDER_KEY)
export class DataXSemanticModelingViewProvider implements IXpertViewExtensionProvider {
	constructor(private readonly service: DataXSemanticModelingService) {}

	supports(context: XpertResolvedViewHostContext) {
		return context.hostType === 'agent'
	}

	getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
		if (slot !== DATA_X_SEMANTIC_MODELING_MAIN_SLOT && slot !== DATA_X_SEMANTIC_MODELING_FIXED_SLOT) {
			return []
		}
		const fixed = slot === DATA_X_SEMANTIC_MODELING_FIXED_SLOT
		return [
			{
				key: DATA_X_SEMANTIC_MODELING_VIEW_KEY,
				title: text('Semantic Modeling', '语义模型建模'),
				description: text(
					'Create, inspect, edit, validate, and publish semantic model workspaces.',
					'创建、查看、编辑、验证并发布语义模型工作空间。'
				),
				icon: VIEW_ICON,
				hostType: 'agent',
				slot,
				order: 5,
				refreshable: true,
				activation: {
					requiredFeatures: [DATA_X_SEMANTIC_MODELING_FEATURE]
				},
				...(fixed
					? {
							workbench: {
								fixed: true,
								menu: {
									enabled: true,
									label: text('Semantic Modeling', '语义模型建模'),
									order: 5,
									icon: VIEW_ICON
								}
							}
						}
					: {}),
				source: {
					provider: DATA_X_SEMANTIC_MODELING_PROVIDER_KEY,
					plugin: DATA_X_SEMANTIC_MODELING_PLUGIN_NAME
				},
				parameters: [
					{
						key: 'modelId',
						label: text('Semantic Model', '语义模型'),
						type: 'string',
						optionSource: {
							mode: 'provider',
							searchable: true,
							preload: true
						}
					},
					{
						key: 'dataSourceId',
						label: text('Data Source', '数据源'),
						type: 'string',
						optionSource: {
							mode: 'provider',
							searchable: true,
							preload: true
						}
					},
					{
						key: 'cubeName',
						label: text('Cube', 'Cube'),
						type: 'string',
						optionSource: {
							mode: 'provider',
							searchable: true,
							preload: true,
							dependsOn: ['modelId']
						}
					}
				],
				view: {
					type: 'remote_component',
					runtime: 'react',
					protocolVersion: 1,
					component: {
						isolation: 'iframe',
						entry: DATA_X_SEMANTIC_MODELING_REMOTE_ENTRY_KEY
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
						supportsParameters: true
					},
					cache: {
						enabled: false
					}
				},
				hostEvents: {
					subscriptions: [
						{
							key: 'datax-semantic-modeling-tool-completed',
							event: 'assistant.tool.completed',
							filter: {
								sources: ['chatkit'],
								toolNames: [...DATA_X_SEMANTIC_MODELING_TOOL_NAMES]
							},
							action: {
								type: 'forward',
								debounceMs: 500
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
						key: 'create_workspace',
						label: text('New Model', '新建模型'),
						icon: 'ri-add-line',
						placement: 'toolbar',
						actionType: 'invoke',
						inputSchema: CREATE_WORKSPACE_INPUT_SCHEMA
					},
					{
						key: 'save_draft',
						label: text('Save Draft', '保存草稿'),
						icon: 'ri-save-line',
						placement: 'toolbar',
						actionType: 'invoke',
						inputSchema: SAVE_DRAFT_INPUT_SCHEMA
					},
					{
						key: 'publish',
						label: text('Publish', '发布'),
						icon: 'ri-send-plane-line',
						placement: 'toolbar',
						actionType: 'invoke',
						inputSchema: PUBLISH_INPUT_SCHEMA,
						confirm: {
							title: text('Publish semantic model?', '发布语义模型？'),
							message: text(
								'The current validated draft will become the published model.',
								'当前已验证草稿将成为正式发布模型。'
							)
						}
					},
					{
						key: 'execute_query',
						label: text('Run Query', '运行查询'),
						icon: 'ri-play-line',
						actionType: 'invoke',
						inputSchema: EXECUTE_QUERY_INPUT_SCHEMA
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
		if (
			viewKey !== DATA_X_SEMANTIC_MODELING_VIEW_KEY ||
			component.entry !== DATA_X_SEMANTIC_MODELING_REMOTE_ENTRY_KEY
		) {
			return {
				html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
				contentType: 'text/html; charset=utf-8'
			}
		}
		const appScript = await readFile(
			join(__dirname, 'remote-components', DATA_X_SEMANTIC_MODELING_REMOTE_ENTRY_KEY, 'app.js'),
			'utf8'
		)
		const appCss = await readFile(
			join(__dirname, 'remote-components', DATA_X_SEMANTIC_MODELING_REMOTE_ENTRY_KEY, 'app.css'),
			'utf8'
		)
		const react = await readPackageFile('react', 'umd/react.production.min.js')
		const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
		return {
			html: renderRemoteReactIframeHtml({
				title: 'Semantic Modeling',
				lang: 'en-US',
				reactUmd: react,
				reactDomUmd: reactDom,
				appCss: `${appCss}\n${REMOTE_CSS}`,
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
		if (viewKey !== DATA_X_SEMANTIC_MODELING_VIEW_KEY) {
			return {}
		}
		const modelId = getString(query.parameters, 'modelId')
		if (!modelId) {
			const items = await this.service.listWorkspaces(query.search)
			return {
				items,
				total: items.length,
				meta: {
					reason: 'model_required'
				}
			}
		}
		const mode = getString(query.parameters, 'mode')
		if (mode === 'tables') {
			const tables = await this.service.safeListTables(modelId)
			const items = normalizeTableNames(tables.items)
			return {
				items,
				total: items.length,
				meta: {
					modelId,
					error: tables.error,
					tableKey: 'name'
				}
			}
		}
		if (mode === 'table_schema') {
			const tableName = getString(query.parameters, 'tableName')
			if (!tableName) {
				return {
					item: null,
					meta: {
						modelId,
						error: 'tableName is required'
					}
				}
			}
			const tableSchema = await this.service.safeGetTableSchema(modelId, tableName)
			return {
				item: tableSchema.item,
				total: tableSchema.item ? 1 : 0,
				meta: {
					modelId,
					tableName,
					error: tableSchema.error
				}
			}
		}
		return {
			item: await this.service.getWorkspace(modelId),
			total: 1,
			meta: {
				modelId
			}
		}
	}

	async getViewParameterOptions(
		_context: XpertResolvedViewHostContext,
		viewKey: string,
		parameterKey: string,
		query: XpertViewParameterOptionsQuery
	): Promise<XpertViewParameterOptionsResult> {
		if (viewKey !== DATA_X_SEMANTIC_MODELING_VIEW_KEY) {
			return { items: [] }
		}
		if (parameterKey === 'modelId') {
			const models = await this.service.listWorkspaces(query.search)
			return {
				items: models.map((model) => ({
					value: model.id,
					label: model.name ?? model.id,
					description: model.description
				}))
			}
		}
		if (parameterKey === 'dataSourceId') {
			const dataSources = await this.service.listDataSources(query.search)
			return {
				items: dataSources.map((dataSource) => ({
					value: dataSource.id,
					label: dataSource.name,
					description: [dataSource.type, dataSource.protocol].filter(Boolean).join(' · ')
				}))
			}
		}
		if (parameterKey === 'cubeName') {
			const modelId = getString(query.parameters, 'modelId')
			if (!modelId) {
				return { items: [] }
			}
			const workspace = await this.service.getWorkspace(modelId)
			const search = query.search?.trim().toLowerCase()
			return {
				items: workspace.cubes
					.filter((cube) => !search || cube.name.toLowerCase().includes(search))
					.map((cube) => ({
						value: cube.name,
						label: cube.caption ?? cube.name,
						description: cube.description
					}))
			}
		}
		return { items: [] }
	}

	async executeViewAction(
		context: XpertResolvedViewHostContext,
		viewKey: string,
		actionKey: string,
		request: XpertViewActionRequest
	): Promise<XpertViewActionResult> {
		if (viewKey !== DATA_X_SEMANTIC_MODELING_VIEW_KEY) {
			return failure('Unsupported view', '不支持的视图')
		}
		if (actionKey === 'refresh') {
			return success('Semantic model refreshed', '语义模型已刷新')
		}
		if (actionKey === 'create_workspace') {
			const input = request.input
			const created = await this.service.createWorkspace(
				{
					key: requireString(input, 'key'),
					name: requireString(input, 'name'),
					description: getString(input, 'description'),
					dataSourceId: requireString(input, 'dataSourceId'),
					catalog: requireString(input, 'catalog'),
					type: toModelType(getString(input, 'type')),
					businessAreaId: getString(input, 'businessAreaId'),
					changeSummary: requireString(input, 'changeSummary')
				},
				context.userId
			)
			return successData('Semantic model created', '语义模型已创建', created)
		}

		const modelId = request.targetId?.trim() || getString(request.parameters, 'modelId')
		if (!modelId) {
			return failure('Semantic model is required', '请先选择语义模型')
		}
		if (actionKey === 'save_draft') {
			const result = await this.service.saveDraftJson(
				modelId,
				requireString(request.input, 'schemaJson'),
				getNumber(request.input, 'baseVersion')
			)
			return successData('Semantic model draft saved', '语义模型草稿已保存', result)
		}
		if (actionKey === 'publish') {
			const result = await this.service.publishWorkspace(modelId, getString(request.input, 'releaseNotes') ?? '')
			return successData('Semantic model published', '语义模型已发布', result)
		}
		if (actionKey === 'execute_query') {
			const cubeName = requireString(request.input, 'cubeName')
			const statement = requireString(request.input, 'statement')
			const limit = Math.min(Math.max(getNumber(request.input, 'limit') ?? 200, 1), 500)
			const result = await this.service.executeQuery(modelId, cubeName, statement, limit, {
				tenantId: context.tenantId,
				organizationId: context.organizationId,
				userId: context.userId
			})
			return {
				success: true,
				message: text(
					`Query completed with ${result.totalRowCount} row(s).`,
					`查询完成，共 ${result.totalRowCount} 行。`
				),
				data: result,
				refresh: false
			}
		}
		return failure('Unsupported action', '不支持的操作')
	}
}

async function readPackageFile(packageName: string, relativePath: string) {
	const packageRoot = dirname(requireFromHere.resolve(`${packageName}/package.json`))
	return readFile(join(packageRoot, relativePath), 'utf8')
}

function getString(input: Record<string, unknown> | null | undefined, key: string) {
	const value = input?.[key]
	return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireString(input: Record<string, unknown> | null | undefined, key: string) {
	const value = getString(input, key)
	if (!value) {
		throw new Error(`${key} is required`)
	}
	return value
}

function getNumber(input: Record<string, unknown> | null | undefined, key: string) {
	const value = input?.[key]
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeTableNames(input: unknown): string[] {
	const names = new Set<string>()
	const append = (value: unknown) => {
		if (typeof value === 'string' && value.trim()) {
			names.add(value.trim())
			return
		}
		if (!isRecord(value)) {
			return
		}
		const nestedTables = value['tables']
		if (Array.isArray(nestedTables)) {
			for (const table of nestedTables) {
				append(table)
			}
			return
		}
		const name = value['name']
		if (typeof name === 'string' && name.trim()) {
			names.add(name.trim())
		}
	}

	if (Array.isArray(input)) {
		for (const item of input) {
			append(item)
		}
	} else {
		append(input)
	}
	return [...names]
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toModelType(value?: string) {
	return value === ModelTypeEnum.XMLA ? ModelTypeEnum.XMLA : ModelTypeEnum.SQL
}

function success(en_US: string, zh_Hans: string): XpertViewActionResult {
	return {
		success: true,
		message: text(en_US, zh_Hans),
		refresh: true
	}
}

function successData<TData>(en_US: string, zh_Hans: string, data: TData): XpertViewActionResult<TData> {
	return {
		success: true,
		message: text(en_US, zh_Hans),
		data,
		refresh: true
	}
}

function failure(en_US: string, zh_Hans: string): XpertViewActionResult {
	return {
		success: false,
		message: text(en_US, zh_Hans)
	}
}
