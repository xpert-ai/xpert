import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { IXpertToolset, TAgentMiddlewareMeta, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import {
	AgentMiddleware,
	AgentMiddlewareStrategy,
	IAgentMiddlewareContext,
	IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { BIVariableEnum } from '../../ai/toolset/builtin/bi-toolset'
import { SemanticModelToolset } from '../../ai/toolset/builtin/semantic-model/semantic-model'
import { SemanticModelVariableEnum } from '../../ai/toolset/builtin/semantic-model/types'
import { TOOL_MODEL_PROMPTS_DEFAULT } from '../../ai/toolset/builtin/semantic-model/prompts'
import {
	DATA_X_SEMANTIC_MODEL_CREATE_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_PUBLISH_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_SAVE_DRAFT_TOOL_NAME,
	DATA_X_SEMANTIC_MODELING_FEATURE,
	DATA_X_SEMANTIC_MODELING_ICON,
	DATA_X_SEMANTIC_MODELING_MIDDLEWARE_NAME
} from './constants'
import { DataXSemanticModelingService } from './datax-semantic-modeling.service'
import {
	SemanticModelPublishSchema,
	SemanticModelSaveDraftSchema,
	SemanticModelWorkspaceCreateSchema,
	SemanticModelWorkspaceListSchema
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
			en_US: 'Adds conversational semantic model workspace selection, table discovery, cube modeling, preview, validation, and publishing tools.',
			zh_Hans: '提供语义模型空间选择、数据表发现、Cube 建模、预览、验证和发布的对话式工具。'
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

	constructor(
		private readonly service: DataXSemanticModelingService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	async createMiddleware(
		_options: Record<string, never>,
		context: IAgentMiddlewareContext
	): Promise<AgentMiddleware> {
		const toolsetConfig: IXpertToolset = {
			name: 'Data X Semantic Modeling',
			type: SemanticModelToolset.provider,
			category: XpertToolsetCategoryEnum.BUILTIN,
			credentials: {
				project: context.projectId ?? ''
			}
		}
		const toolset = new SemanticModelToolset(toolsetConfig, {
			tenantId: context.tenantId,
			organizationId: context.organizationId ?? undefined,
			userId: context.userId,
			projectId: context.projectId,
			xpertId: context.xpertId,
			conversationId: context.conversationId,
			agentKey: context.agentKey,
			env: {},
			store: context.store,
			commandBus: this.commandBus,
			queryBus: this.queryBus
		})
		const modelingTools = await toolset.initTools()

		const listWorkspacesTool = tool(
			async (input) => {
				const workspaces = await this.service.listWorkspaces(input.search, input.limit)
				return JSON.stringify({
					message: workspaces.length
						? 'Selectable semantic model workspaces were found. Call switch_model_workspace with the exact modelId before other modeling tools.'
						: 'No semantic model workspace matched.',
					count: workspaces.length,
					workspaces
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME,
				description:
					'List semantic model workspaces that the current user can model. Call this before switch_model_workspace when the model id is unknown.',
				schema: SemanticModelWorkspaceListSchema,
				verboseParsingErrors: true
			}
		)

		const createWorkspaceTool = tool(
			async (input) => {
				const workspace = await this.service.createWorkspace(input, context.userId)
				return JSON.stringify({
					message:
						'Semantic model workspace was created. Next call switch_model_workspace with modelId, then inspect tables before creating dimensions and cubes.',
					modelId: workspace.id,
					name: workspace.name,
					draftVersion: workspace.draftVersion,
					changeSummary: input.changeSummary
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_CREATE_TOOL_NAME,
				description:
					'Create an empty semantic model workspace connected to an existing data source and catalog. After creation call switch_model_workspace with the returned modelId.',
				schema: SemanticModelWorkspaceCreateSchema,
				verboseParsingErrors: true
			}
		)

		const saveDraftTool = tool(
			async (input) => {
				const result = await this.service.saveDraft(input)
				return JSON.stringify({
					message: 'Semantic model draft schema was saved and validated.',
					modelId: result.modelId,
					draftVersion: result.version,
					validationIssueCount: result.checklist.length,
					checklist: result.checklist.slice(0, 20),
					changeSummary: input.changeSummary
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_SAVE_DRAFT_TOOL_NAME,
				description:
					'Replace the complete semantic model draft schema. Prefer the focused edit_dimension/edit_hierarchy/edit_cube/edit_measure tools for small changes; use this tool for an intentional full-schema update.',
				schema: SemanticModelSaveDraftSchema,
				verboseParsingErrors: true
			}
		)

		const publishTool = tool(
			async (input) => {
				const result = await this.service.publishWorkspace(input.modelId, input.releaseNotes)
				return JSON.stringify({
					message: 'Semantic model workspace was published.',
					modelId: result.modelId,
					publishAt: result.publishAt,
					releaseNotes: result.releaseNotes,
					changeSummary: input.changeSummary
				})
			},
			{
				name: DATA_X_SEMANTIC_MODEL_PUBLISH_TOOL_NAME,
				description:
					'Publish the current semantic model draft after preview_cube or a query test succeeds and validation issues are understood.',
				schema: SemanticModelPublishSchema,
				verboseParsingErrors: true
			}
		)

		const stateSchema = z.object({
			tool_model_prompts_default: z
				.string()
				.default(
					`${TOOL_MODEL_PROMPTS_DEFAULT}\nBefore switch_model_workspace, call ${DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME} when the exact modelId is unknown. Use ${DATA_X_SEMANTIC_MODEL_CREATE_TOOL_NAME} only when the user requests a new workspace.`
				),
			tool_indicators_prompts_pro: z
				.string()
				.default(
					'Use the metric management Agentic App when the semantic model is ready for governed metrics.'
				),
			[BIVariableEnum.CurrentCubeContext]: z
				.string()
				.default(
					'No cube runtime context has been selected. Call get_cube_runtime_context before preview operations.'
				),
			[SemanticModelVariableEnum.LatestState]: z.string().default('')
		})

		return {
			name: DATA_X_SEMANTIC_MODELING_MIDDLEWARE_NAME,
			stateSchema,
			tools: [
				buildOpenSemanticModelingTool(),
				listWorkspacesTool,
				createWorkspaceTool,
				saveDraftTool,
				publishTool,
				...modelingTools
			],
			beforeAgent: (state) => ({
				tool_model_prompts_default:
					state.tool_model_prompts_default ??
					`${TOOL_MODEL_PROMPTS_DEFAULT}\nCall ${DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME} when the modelId is unknown.`,
				tool_indicators_prompts_pro:
					state.tool_indicators_prompts_pro ??
					'Use the metric management Agentic App when the semantic model is ready for governed metrics.',
				[BIVariableEnum.CurrentCubeContext]:
					state[BIVariableEnum.CurrentCubeContext] ??
					'No cube runtime context has been selected. Call get_cube_runtime_context before preview operations.',
				[SemanticModelVariableEnum.LatestState]: state[SemanticModelVariableEnum.LatestState] ?? ''
			})
		}
	}
}
