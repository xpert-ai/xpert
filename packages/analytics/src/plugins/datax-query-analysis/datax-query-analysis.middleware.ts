import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
	AgentMiddleware,
	AgentMiddlewareStrategy,
	IAgentMiddlewareContext,
	IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'
import {
	DATA_X_QUERY_ANALYSIS_CONTEXT_TOOL_NAME,
	DATA_X_QUERY_ANALYSIS_EXECUTE_TOOL_NAME,
	DATA_X_QUERY_ANALYSIS_FEATURE,
	DATA_X_QUERY_ANALYSIS_ICON,
	DATA_X_QUERY_ANALYSIS_MIDDLEWARE_NAME,
	DATA_X_QUERY_VISUALIZATION_META_KEY
} from './constants'
import { DataXQueryAnalysisService } from './datax-query-analysis.service'
import { DataXQueryExecuteSchema, DataXQueryModelContextSchema } from './schemas'
import { buildOpenDataXQueryTool, createQueryVisualization } from './tool'

const QUERY_ANALYSIS_PROMPT = `Use datax_query_model_context to resolve an exact semantic model id and cube before querying.
Use datax_query_execute only with a complete MDX SELECT statement. Read the returned columns and rows before answering.
When a query fails, inspect the selected model/cube context and correct the statement instead of inventing values.`

@Injectable()
@AgentMiddlewareStrategy(DATA_X_QUERY_ANALYSIS_MIDDLEWARE_NAME)
export class DataXQueryAnalysisMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
	readonly meta: TAgentMiddlewareMeta = {
		name: DATA_X_QUERY_ANALYSIS_MIDDLEWARE_NAME,
		label: {
			en_US: 'Data X Query Analysis',
			zh_Hans: 'Data X 查询分析'
		},
		description: {
			en_US: 'Executes MDX against governed semantic models and opens tabular query results in Workbench.',
			zh_Hans: '针对受治理语义模型执行 MDX，并在 Workbench 中展示表格查询结果。'
		},
		icon: {
			type: 'svg',
			value: DATA_X_QUERY_ANALYSIS_ICON,
			color: '#0f766e'
		},
		features: [DATA_X_QUERY_ANALYSIS_FEATURE],
		configSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}

	constructor(private readonly service: DataXQueryAnalysisService) {}

	createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): AgentMiddleware {
		const modelContextTool = tool(
			async (input) => {
				if (input.modelId) {
					const model = await this.service.getModel(input.modelId)
					return JSON.stringify({
						message: 'Semantic model query context loaded.',
						model
					})
				}
				const models = await this.service.listModels(input.search)
				return JSON.stringify({
					message: models.length
						? 'Selectable semantic models were found. Choose one modelId and cube name before executing a query.'
						: 'No semantic models matched.',
					count: models.length,
					models
				})
			},
			{
				name: DATA_X_QUERY_ANALYSIS_CONTEXT_TOOL_NAME,
				description:
					'List semantic models and cubes available for governed data queries, or load one exact model by id.',
				schema: DataXQueryModelContextSchema,
				verboseParsingErrors: true
			}
		)

		const executeQueryTool = tool(
			async (input) => {
				const result = await this.service.execute(input, {
					tenantId: context.tenantId,
					organizationId: context.organizationId,
					userId: context.userId
				})
				return JSON.stringify({
					message: `Query completed with ${result.totalRowCount} row(s).`,
					modelId: result.modelId,
					cubeName: result.cubeName,
					columns: result.columns,
					rows: result.rows,
					rowCount: result.rowCount,
					totalRowCount: result.totalRowCount,
					truncated: result.truncated,
					mdx: result.mdx,
					sql: result.sql,
					audit: result.audit,
					...(input.openWorkbench
						? {
								_meta: {
									[DATA_X_QUERY_VISUALIZATION_META_KEY]: createQueryVisualization({
										modelId: input.modelId,
										cubeName: input.cubeName,
										statement: input.statement,
										autoRun: true
									})
								}
							}
						: {})
				})
			},
			{
				name: DATA_X_QUERY_ANALYSIS_EXECUTE_TOOL_NAME,
				description:
					'Execute a complete MDX SELECT statement against a semantic model and return real query columns and rows. Call datax_query_model_context first when the exact modelId or cubeName is unknown.',
				schema: DataXQueryExecuteSchema,
				verboseParsingErrors: true
			}
		)

		return {
			name: DATA_X_QUERY_ANALYSIS_MIDDLEWARE_NAME,
			stateSchema: z.object({
				datax_query_analysis_prompt: z.string().default(QUERY_ANALYSIS_PROMPT)
			}),
			tools: [buildOpenDataXQueryTool(), modelContextTool, executeQueryTool],
			beforeAgent: (state) => ({
				datax_query_analysis_prompt: state.datax_query_analysis_prompt ?? QUERY_ANALYSIS_PROMPT
			})
		}
	}
}
