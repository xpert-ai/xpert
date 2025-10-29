import { PromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, END } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IWFNTool,
	IWorkflowNode,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { getErrorMessage, isBlank } from '@metad/server-common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { omitBy } from 'lodash'
import { toEnvState } from '../../../environment'
import {
	_BaseToolset,
	AgentStateAnnotation,
	deepTransformValue,
	nextWorkflowNodes,
	stateToParameters,
	TWorkflowGraphNode
} from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { ToolsetGetToolsCommand } from '../../../xpert-toolset'

const WORKFLOW_TOOL_ERROR_CHANNEL = 'error'
const WORKFLOW_TOOL_TEXT_CHANNEL = 'text'
const WORKFLOW_TOOL_JSON_CHANNEL = 'json'
const WORKFLOW_TOOL_FILES_CHANNEL = 'files'

export function createToolNode(
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' },
	params: {
		commandBus: CommandBus
		queryBus: QueryBus
		xpertId: string
		environment: IEnvironment
		conversationId: string
	}
): TWorkflowGraphNode {
	const { commandBus, queryBus, xpertId, environment, conversationId } = params
	const entity = node.entity as IWFNTool

	const toolsetId = entity.toolsetId
	const toolName = entity.toolName

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId, projectId, agentKey } =
					configurable

				const toolsets = await commandBus.execute<ToolsetGetToolsCommand, _BaseToolset[]>(
					new ToolsetGetToolsCommand([toolsetId], {
						projectId,
						conversationId,
						xpertId,
						agentKey,
						signal: config.signal,
						env: toEnvState(environment)
					})
				)

				const stateEnv = stateToParameters(state, environment)

				let parameters = await deepTransformValue(entity.parameters, async (v) => {
					return await PromptTemplate.fromTemplate(v, { templateFormat: 'mustache' }).format(stateEnv)
				})

				if (entity.omitBlankValues) {
					parameters = omitBy(parameters, isBlank)
				}

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.TOOL,
					inputs: parameters,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title
				}
				return await wrapAgentExecution(
					async () => {
						const toolset = toolsets[0]
						await toolset.initTools()
						const tool = toolset.getTool(toolName)
						try {
							let output = await tool.invoke(parameters, config)
							let resultJson = null
							if (typeof output === 'string') {
								try {
									resultJson = JSON.parse(output)
								} catch (e) {
									// ignore JSON parse error
								}
							} else {
								resultJson = output
								output = JSON.stringify(output, null, 2)
							}

							return {
								state: {
									[channelName(node.key)]: {
										[WORKFLOW_TOOL_TEXT_CHANNEL]: output,
										[WORKFLOW_TOOL_JSON_CHANNEL]: resultJson,
										[WORKFLOW_TOOL_FILES_CHANNEL]: [],
										[WORKFLOW_TOOL_ERROR_CHANNEL]: null
									}
								},
								output: output
							}
						} catch (error) {
							if (entity.errorHandling?.type === 'defaultValue') {
								const result = entity.errorHandling.defaultValue?.result
								let resultJson = result
								try {
									resultJson = JSON.parse(result)
								} catch (e) {
									// ignore JSON parse error
								}
								return {
									state: {
										[channelName(node.key)]: {
											[WORKFLOW_TOOL_TEXT_CHANNEL]: result,
											[WORKFLOW_TOOL_JSON_CHANNEL]: resultJson,
											[WORKFLOW_TOOL_FILES_CHANNEL]: [],
											[WORKFLOW_TOOL_ERROR_CHANNEL]: null
										}
									},
									output: result
								}
							} else if (entity.errorHandling?.type === 'failBranch') {
								return {
									state: {
										[channelName(node.key)]: {
											[WORKFLOW_TOOL_TEXT_CHANNEL]: null,
											[WORKFLOW_TOOL_JSON_CHANNEL]: null,
											[WORKFLOW_TOOL_FILES_CHANNEL]: [],
											[WORKFLOW_TOOL_ERROR_CHANNEL]:
												getErrorMessage(error) || 'An error occurred while executing the tool'
										}
									}
								}
							}
							throw error
						}
					},
					{
						commandBus: commandBus,
						queryBus: queryBus,
						subscriber: subscriber,
						execution
					}
				)()
			}),
			ends: []
		},
		...(entity.errorHandling?.type === 'failBranch' ? {
			navigator: async (state: typeof AgentStateAnnotation.State, config) => {
				if (state[channelName(node.key)]?.[WORKFLOW_TOOL_ERROR_CHANNEL]) {
					return (
						graph.connections.find((conn) => conn.type === 'edge' && conn.from === `${node.key}/fail`)?.to ??
						END
					)
				}
				return nextWorkflowNodes(graph, node.key, state)
			},
		} : {})
	}
}

export function toolOutputVariables(entity: IWorkflowNode) {
	return [
		{
			type: XpertParameterTypeEnum.STRING,
			name: WORKFLOW_TOOL_TEXT_CHANNEL,
			title: 'Text',
			description: {
				en_US: 'Text output from tool',
				zh_Hans: '工具的文本输出'
			}
		},
		{
			type: XpertParameterTypeEnum.OBJECT,
			name: WORKFLOW_TOOL_JSON_CHANNEL,
			title: 'JSON',
			description: {
				en_US: 'JSON output from tool',
				zh_Hans: '工具的 JSON 输出'
			}
		},
		{
			type: XpertParameterTypeEnum.ARRAY,
			name: WORKFLOW_TOOL_FILES_CHANNEL,
			title: 'Files',
			description: {
				en_US: 'Files output from tool',
				zh_Hans: '工具的文件输出'
			}
		},
		{
			type: XpertParameterTypeEnum.STRING,
			name: 'error',
			title: 'Error',
			description: {
				en_US: 'Error info',
				zh_Hans: '错误信息'
			}
		}
	]
}
