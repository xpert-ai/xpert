import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
	AgentMiddleware,
	AgentMiddlewareStrategy,
	IAgentMiddlewareContext,
	IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import {
	DATA_X_SEMANTIC_MODEL_CREATE_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_DESCRIBE_TABLE_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_EXECUTE_QUERY_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_LIST_CATALOGS_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_LIST_DATA_SOURCES_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_LIST_PROJECTS_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_LIST_TABLES_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME,
	DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_PUBLISH_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_READ_WORKSPACE_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_SAVE_DRAFT_TOOL_NAME,
	DATA_X_SEMANTIC_MODELING_FEATURE,
	DATA_X_SEMANTIC_MODELING_ICON,
	DATA_X_SEMANTIC_MODELING_MIDDLEWARE_NAME
} from './constants'
import { DataXSemanticModelingService } from './datax-semantic-modeling.service'
import {
	SemanticModelDataSourceListSchema,
	SemanticModelCatalogListSchema,
	SemanticModelDescribeTableSchema,
	SemanticModelExecuteQuerySchema,
	SemanticModelListTablesSchema,
	SemanticModelPublishSchema,
	SemanticModelProjectListSchema,
	SemanticModelSaveDraftSchema,
	SemanticModelWorkspaceCreateSchema,
	SemanticModelWorkspaceListSchema,
	SemanticModelWorkspaceReadSchema
} from './schemas'
import { buildOpenSemanticModelingTool } from './tool'

@Injectable()
@AgentMiddlewareStrategy(DATA_X_SEMANTIC_MODELING_MIDDLEWARE_NAME)
export class DataXSemanticModelingMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
	readonly meta: TAgentMiddlewareMeta = {
		name: DATA_X_SEMANTIC_MODELING_MIDDLEWARE_NAME,
		label: {
			en_US: 'Data X Semantic Modeling',
			zh_Hans: 'Data X 语义模型建模'
		},
		description: {
			en_US: 'Adds conversational semantic model workspace discovery, source inspection, draft editing, validation queries, and publishing tools.',
			zh_Hans: '提供语义模型空间发现、数据源检查、草稿编辑、验证查询和发布工具。'
		},
		icon: {
			type: 'svg',
			value: DATA_X_SEMANTIC_MODELING_ICON,
			color: '#4f46e5'
		},
		features: [DATA_X_SEMANTIC_MODELING_FEATURE],
		configSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}

	constructor(private readonly service: DataXSemanticModelingService) {}

	createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
		const listWorkspacesTool = tool(
			async (input) => {
				const workspaces = await this.service.listWorkspaces(input.search, input.limit)
				return JSON.stringify({
					message: workspaces.length
						? `Found ${workspaces.length} semantic model workspace(s). Read one workspace before changing its draft.`
						: 'No semantic model workspace matched.',
					count: workspaces.length,
					workspaces
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME,
				description:
					'List semantic model workspaces available to the current user. Use this when the exact modelId is unknown.',
				schema: SemanticModelWorkspaceListSchema,
				verboseParsingErrors: true
			}
		)

		const listDataSourcesTool = tool(
			async (input) => {
				const dataSources = await this.service.listDataSources(input.search)
				return JSON.stringify({
					message: dataSources.length
						? `Found ${dataSources.length} data source(s) available for semantic modeling.`
						: 'No data source matched.',
					count: dataSources.length,
					dataSources
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_LIST_DATA_SOURCES_TOOL_NAME,
				description:
					'List data sources available for creating a semantic model workspace. Use it before creation when the dataSourceId is unknown.',
				schema: SemanticModelDataSourceListSchema,
				verboseParsingErrors: true
			}
		)

		const listCatalogsTool = tool(
			async (input) => {
				const catalogs = await this.service.listCatalogs(input.dataSourceId)
				return JSON.stringify({
					message: catalogs.length
						? `Found ${catalogs.length} catalog(s) available on the selected data source.`
						: 'No catalog is available on the selected data source.',
					dataSourceId: input.dataSourceId,
					count: catalogs.length,
					catalogs
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_LIST_CATALOGS_TOOL_NAME,
				description:
					'List catalogs or schemas available on one exact accessible data source. Use a returned value as catalog when creating a workspace.',
				schema: SemanticModelCatalogListSchema,
				verboseParsingErrors: true
			}
		)

		const listProjectsTool = tool(
			async (input) => {
				const search = input.search?.trim().toLocaleLowerCase()
				const projects = (await this.service.listProjects()).filter(
					(project) =>
						!search ||
						project.name.toLocaleLowerCase().includes(search) ||
						project.description?.toLocaleLowerCase().includes(search)
				)
				return JSON.stringify({
					message: projects.length
						? `Found ${projects.length} accessible project(s). Select one projectId so later governed metrics can use the semantic model.`
						: 'No accessible project matched.',
					count: projects.length,
					projects
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_LIST_PROJECTS_TOOL_NAME,
				description:
					'List BI projects available to the current user. Use it before workspace creation and pass one exact projectId when governed metrics are required.',
				schema: SemanticModelProjectListSchema,
				verboseParsingErrors: true
			}
		)

		const readWorkspaceTool = tool(
			async (input) => {
				const workspace = await this.service.getWorkspace(input.modelId)
				return JSON.stringify({
					message:
						'Semantic model workspace loaded. Preserve unrelated draft fields and use draft.version as baseVersion when saving.',
					...workspace
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_READ_WORKSPACE_TOOL_NAME,
				description:
					'Read the current semantic model draft, revision, artifacts, and validation checklist. Always call this before changing a draft.',
				schema: SemanticModelWorkspaceReadSchema,
				verboseParsingErrors: true
			}
		)

		const listTablesTool = tool(
			async (input) => {
				const tables = await this.service.listTables(input.modelId)
				return JSON.stringify({
					message: 'Physical source tables loaded for the semantic model workspace.',
					modelId: input.modelId,
					tables
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_LIST_TABLES_TOOL_NAME,
				description:
					'List physical source tables for a semantic model workspace before authoring dimensions or cubes.',
				schema: SemanticModelListTablesSchema,
				verboseParsingErrors: true
			}
		)

		const describeTableTool = tool(
			async (input) => {
				const table = await this.service.getTableSchema(input.modelId, input.tableName)
				return JSON.stringify({
					message: 'Physical table schema loaded.',
					modelId: input.modelId,
					tableName: input.tableName,
					table
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_DESCRIBE_TABLE_TOOL_NAME,
				description:
					'Read columns and types for one physical source table. Use an exact table name returned by semantic_model_list_tables.',
				schema: SemanticModelDescribeTableSchema,
				verboseParsingErrors: true
			}
		)

		const createWorkspaceTool = tool(
			async (input) => {
				const workspace = await this.service.createWorkspace(input, context.userId)
				return JSON.stringify({
					message:
						'Semantic model workspace created. Read the workspace and inspect its physical source tables before saving a schema draft.',
					modelId: workspace.id,
					name: workspace.name,
					draftVersion: workspace.draftVersion,
					changeSummary: input.changeSummary
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_CREATE_TOOL_NAME,
				description:
					'Create an empty semantic model workspace connected to an existing data source and catalog.',
				schema: SemanticModelWorkspaceCreateSchema,
				verboseParsingErrors: true
			}
		)

		const saveDraftTool = tool(
			async (input) => {
				const result = await this.service.saveDraft(input)
				return JSON.stringify({
					message: 'Semantic model draft schema saved and validated.',
					modelId: result.modelId,
					draftVersion: result.version,
					validationIssueCount: result.checklist.length,
					checklist: result.checklist.slice(0, 20),
					changeSummary: input.changeSummary,
					nextActions: [
						DATA_X_SEMANTIC_MODEL_EXECUTE_QUERY_TOOL_NAME,
						DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME
					]
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_SAVE_DRAFT_TOOL_NAME,
				description:
					'Replace the complete semantic model draft using the baseVersion returned by semantic_model_read_workspace. Preserve every unrelated draft field.',
				schema: SemanticModelSaveDraftSchema,
				verboseParsingErrors: true
			}
		)

		const executeQueryTool = tool(
			async (input) => {
				const result = await this.service.executeQuery(
					input.modelId,
					input.cubeName,
					input.statement,
					input.limit,
					{
						tenantId: context.tenantId,
						organizationId: context.organizationId,
						userId: context.userId
					}
				)
				return JSON.stringify({
					message: `Semantic model validation query completed with ${result.totalRowCount} row(s).`,
					...result
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_EXECUTE_QUERY_TOOL_NAME,
				description:
					'Execute a complete MDX SELECT statement against the current semantic model draft and return real columns and rows before publishing.',
				schema: SemanticModelExecuteQuerySchema,
				verboseParsingErrors: true
			}
		)

		const publishTool = tool(
			async (input) => {
				const result = await this.service.publishWorkspace(input.modelId, input.releaseNotes)
				return JSON.stringify({
					message: 'Semantic model workspace published.',
					modelId: result.modelId,
					publishAt: result.publishAt,
					releaseNotes: result.releaseNotes,
					changeSummary: input.changeSummary
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_PUBLISH_TOOL_NAME,
				description:
					'Publish a semantic model workspace only after the user requests publishing and a representative validation query succeeds.',
				schema: SemanticModelPublishSchema,
				verboseParsingErrors: true
			}
		)

		return {
			name: DATA_X_SEMANTIC_MODELING_MIDDLEWARE_NAME,
			tools: [
				buildOpenSemanticModelingTool(),
				listWorkspacesTool,
				listDataSourcesTool,
				listCatalogsTool,
				listProjectsTool,
				readWorkspaceTool,
				listTablesTool,
				describeTableTool,
				createWorkspaceTool,
				saveDraftTool,
				executeQueryTool,
				publishTool
			],
			wrapModelCall: (request, handler) => {
				const existing = typeof request.systemMessage?.content === 'string' ? request.systemMessage.content : ''
				return handler({
					...request,
					systemMessage: new SystemMessage(`${existing}\n\n${SEMANTIC_MODELING_PROMPT}`)
				})
			}
		}
	}
}

const SEMANTIC_MODELING_PROMPT = `When the user asks to create or change a Data X semantic model:
1. Resolve exact identifiers with ${DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME} and ${DATA_X_SEMANTIC_MODEL_LIST_DATA_SOURCES_TOOL_NAME}; never guess a modelId or dataSourceId.
2. Before creating a workspace, call ${DATA_X_SEMANTIC_MODEL_LIST_CATALOGS_TOOL_NAME} for the selected data source. When governed metrics are required, also call ${DATA_X_SEMANTIC_MODEL_LIST_PROJECTS_TOOL_NAME} and pass one exact accessible projectId to ${DATA_X_SEMANTIC_MODEL_CREATE_TOOL_NAME}.
3. Call ${DATA_X_SEMANTIC_MODEL_READ_WORKSPACE_TOOL_NAME} before every draft change. Treat the returned draft as one complete document, preserve unrelated fields, and pass its draft.version as baseVersion to ${DATA_X_SEMANTIC_MODEL_SAVE_DRAFT_TOOL_NAME}.
4. Inspect physical source metadata with ${DATA_X_SEMANTIC_MODEL_LIST_TABLES_TOOL_NAME} and ${DATA_X_SEMANTIC_MODEL_DESCRIBE_TABLE_TOOL_NAME}; never infer columns from names or sample text.
5. Use ${DATA_X_SEMANTIC_MODEL_EXECUTE_QUERY_TOOL_NAME} with a complete MDX SELECT statement to validate representative results. Read the returned columns and rows instead of inventing values.
6. Call ${DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME} to open the semantic modeling Workbench when visual editing or human review is useful.
7. Call ${DATA_X_SEMANTIC_MODEL_PUBLISH_TOOL_NAME} only when the user explicitly requests publishing and validation issues are understood.
Use the separate Data X Metric Management middleware for governed metrics after the semantic model is ready.`
