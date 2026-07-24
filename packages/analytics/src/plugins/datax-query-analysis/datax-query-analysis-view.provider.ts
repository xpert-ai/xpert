import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import {
	I18nObject,
	IconDefinition,
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
import { Injectable } from '@nestjs/common'
import {
	DATA_X_QUERY_ANALYSIS_FEATURE,
	DATA_X_QUERY_ANALYSIS_FIXED_SLOT,
	DATA_X_QUERY_ANALYSIS_ICON,
	DATA_X_QUERY_ANALYSIS_MAIN_SLOT,
	DATA_X_QUERY_ANALYSIS_PLUGIN_NAME,
	DATA_X_QUERY_ANALYSIS_PROVIDER_KEY,
	DATA_X_QUERY_ANALYSIS_REMOTE_ENTRY_KEY,
	DATA_X_QUERY_ANALYSIS_TOOL_NAMES,
	DATA_X_QUERY_ANALYSIS_VIEW_KEY
} from './constants'
import { DataXQueryAnalysisService } from './datax-query-analysis.service'

const requireFromHere = createRequire(__filename)
const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })
const VIEW_ICON = {
	type: 'svg',
	value: DATA_X_QUERY_ANALYSIS_ICON,
	alt: 'Query Analysis'
} satisfies IconDefinition
const EXECUTE_INPUT_SCHEMA = {
	type: 'object',
	properties: {
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
	required: ['statement']
} satisfies JsonSchemaObjectType

const REMOTE_CSS = `
html,
body,
#root {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.datax-query-app {
  display: grid;
  height: 100vh;
  min-height: 0;
  grid-template-rows: auto minmax(150px, 34vh) auto 1fr;
  overflow: hidden;
}

.datax-query-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 340px) minmax(200px, 320px) auto auto 1fr;
  gap: 8px;
  align-items: center;
  border-bottom: 1px solid var(--xui-color-border);
  padding: 10px 12px;
}

.datax-query-editor-wrap {
  min-height: 0;
  padding: 12px;
}

.datax-query-editor {
  height: 100%;
  min-height: 120px;
  resize: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.55;
}

.datax-query-summary {
  display: flex;
  min-height: 38px;
  align-items: center;
  gap: 10px;
  border-block: 1px solid var(--xui-color-border);
  padding: 6px 12px;
  color: var(--xui-color-muted-foreground);
  font-size: var(--xui-font-size-sm);
}

.datax-query-result {
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.datax-query-result .xui-table-wrap {
  min-height: 100%;
}

.datax-query-result .xui-table {
  width: max-content;
  min-width: 100%;
}

.datax-query-result .xui-table th {
  position: sticky;
  top: 0;
  z-index: 2;
}

.datax-query-cell {
  max-width: 440px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .datax-query-toolbar {
    grid-template-columns: 1fr 1fr;
  }
}
`

@Injectable()
@ViewExtensionProvider(DATA_X_QUERY_ANALYSIS_PROVIDER_KEY)
export class DataXQueryAnalysisViewProvider implements IXpertViewExtensionProvider {
	constructor(private readonly service: DataXQueryAnalysisService) {}

	supports(context: XpertResolvedViewHostContext) {
		return context.hostType === 'agent'
	}

	getViewManifests(_context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
		if (slot !== DATA_X_QUERY_ANALYSIS_MAIN_SLOT && slot !== DATA_X_QUERY_ANALYSIS_FIXED_SLOT) {
			return []
		}
		const fixed = slot === DATA_X_QUERY_ANALYSIS_FIXED_SLOT
		return [
			{
				key: DATA_X_QUERY_ANALYSIS_VIEW_KEY,
				title: text('Query Analysis', '查询分析'),
				description: text(
					'Execute MDX against semantic models and inspect real tabular query results.',
					'针对语义模型执行 MDX 并查看真实表格查询结果。'
				),
				icon: VIEW_ICON,
				hostType: 'agent',
				slot,
				order: 30,
				refreshable: true,
				activation: {
					requiredFeatures: [DATA_X_QUERY_ANALYSIS_FEATURE]
				},
				...(fixed
					? {
							workbench: {
								fixed: true,
								menu: {
									enabled: true,
									label: text('Query Analysis', '查询分析'),
									order: 30,
									icon: VIEW_ICON
								}
							}
						}
					: {}),
				source: {
					provider: DATA_X_QUERY_ANALYSIS_PROVIDER_KEY,
					plugin: DATA_X_QUERY_ANALYSIS_PLUGIN_NAME
				},
				parameters: [
					{
						key: 'modelId',
						label: text('Semantic Model', '语义模型'),
						required: true,
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
						required: true,
						type: 'string',
						optionSource: {
							mode: 'provider',
							searchable: true,
							preload: true,
							dependsOn: ['modelId']
						}
					},
					{
						key: 'statement',
						label: text('MDX Statement', 'MDX 语句'),
						type: 'string'
					},
					{
						key: 'autoRun',
						label: text('Run On Open', '打开时执行'),
						type: 'boolean'
					}
				],
				view: {
					type: 'remote_component',
					runtime: 'react',
					protocolVersion: 1,
					component: {
						isolation: 'iframe',
						entry: DATA_X_QUERY_ANALYSIS_REMOTE_ENTRY_KEY
					},
					dataSource: {
						mode: 'platform'
					}
				},
				dataSource: {
					mode: 'platform',
					querySchema: {
						supportsPagination: false,
						supportsParameters: true,
						defaultPageSize: 200
					},
					cache: {
						enabled: false
					}
				},
				hostEvents: {
					subscriptions: [
						{
							key: 'datax-query-analysis-tool-completed',
							event: 'assistant.tool.completed',
							filter: {
								sources: ['chatkit'],
								toolNames: [...DATA_X_QUERY_ANALYSIS_TOOL_NAMES]
							},
							action: {
								type: 'forward',
								debounceMs: 300
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
						key: 'execute',
						label: text('Run Query', '运行查询'),
						icon: 'ri-play-line',
						placement: 'toolbar',
						actionType: 'invoke',
						inputSchema: EXECUTE_INPUT_SCHEMA
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
		if (viewKey !== DATA_X_QUERY_ANALYSIS_VIEW_KEY || component.entry !== DATA_X_QUERY_ANALYSIS_REMOTE_ENTRY_KEY) {
			return {
				html: '<!doctype html><html><body>Unsupported remote component entry.</body></html>',
				contentType: 'text/html; charset=utf-8'
			}
		}
		const appScript = await readFile(
			join(__dirname, 'remote-components', DATA_X_QUERY_ANALYSIS_REMOTE_ENTRY_KEY, 'app.js'),
			'utf8'
		)
		const appCss = await readFile(
			join(__dirname, 'remote-components', DATA_X_QUERY_ANALYSIS_REMOTE_ENTRY_KEY, 'app.css'),
			'utf8'
		)
		const react = await readPackageFile('react', 'umd/react.production.min.js')
		const reactDom = await readPackageFile('react-dom', 'umd/react-dom.production.min.js')
		return {
			html: renderRemoteReactIframeHtml({
				title: 'Query Analysis',
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
		context: XpertResolvedViewHostContext,
		viewKey: string,
		query: XpertViewQuery
	): Promise<XpertViewDataResult> {
		if (viewKey !== DATA_X_QUERY_ANALYSIS_VIEW_KEY) {
			return {}
		}
		const modelId = getString(query.parameters, 'modelId')
		const cubeName = getString(query.parameters, 'cubeName')
		const statement = getString(query.parameters, 'statement')
		if (!modelId) {
			return {
				items: [],
				total: 0,
				meta: {
					reason: 'model_required'
				}
			}
		}
		const model = await this.service.getModel(modelId)
		if (!cubeName || !statement) {
			return {
				items: [],
				total: 0,
				meta: {
					model,
					reason: cubeName ? 'statement_required' : 'cube_required'
				}
			}
		}
		const result = await this.service.execute(
			{
				modelId,
				cubeName,
				statement,
				limit: Math.min(Math.max(query.pageSize ?? 200, 1), 500),
				openWorkbench: false
			},
			{
				tenantId: context.tenantId,
				organizationId: context.organizationId,
				userId: context.userId
			}
		)
		return {
			items: result.rows,
			total: result.totalRowCount,
			meta: result
		}
	}

	async getViewParameterOptions(
		_context: XpertResolvedViewHostContext,
		viewKey: string,
		parameterKey: string,
		query: XpertViewParameterOptionsQuery
	): Promise<XpertViewParameterOptionsResult> {
		if (viewKey !== DATA_X_QUERY_ANALYSIS_VIEW_KEY) {
			return { items: [] }
		}
		if (parameterKey === 'modelId') {
			const models = await this.service.listModels(query.search)
			return {
				items: models.map((model) => ({
					value: model.id,
					label: model.name ?? model.id,
					description: model.description
				}))
			}
		}
		if (parameterKey === 'cubeName') {
			const modelId = getString(query.parameters, 'modelId')
			if (!modelId) {
				return { items: [] }
			}
			const model = await this.service.getModel(modelId)
			const search = query.search?.trim().toLowerCase()
			return {
				items: model.cubes
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
		if (viewKey !== DATA_X_QUERY_ANALYSIS_VIEW_KEY) {
			return failure('Unsupported view', '不支持的视图')
		}
		if (actionKey === 'refresh') {
			return success('Query view refreshed', '查询视图已刷新')
		}
		if (actionKey !== 'execute') {
			return failure('Unsupported action', '不支持的操作')
		}
		const modelId = getString(request.parameters, 'modelId')
		const cubeName = getString(request.parameters, 'cubeName')
		if (!modelId || !cubeName) {
			return failure('Semantic model and cube are required', '请先选择语义模型和 Cube')
		}
		const statement = requireString(request.input, 'statement')
		const result = await this.service.execute(
			{
				modelId,
				cubeName,
				statement,
				limit: Math.min(Math.max(getNumber(request.input, 'limit') ?? 200, 1), 500),
				openWorkbench: false
			},
			{
				tenantId: context.tenantId,
				organizationId: context.organizationId,
				userId: context.userId
			}
		)
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
