import { AIMessage, BaseMessage } from '@langchain/core/messages'
import { AIMessagePromptTemplate } from '@langchain/core/prompts'
import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation } from '@langchain/langgraph'
import {
	channelName,
	IEnvironment,
	IWFNAnswer,
	IWorkflowNode,
	IXpertAgentExecution,
	TAgentRunnableConfigurable,
	TXpertGraph,
	TXpertTeamNode,
	WorkflowNodeTypeEnum,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { AgentStateAnnotation, stateToParameters } from '../../../shared'
import { wrapAgentExecution } from '../../../shared/agent/execution'
import { FakeStreamingChatModel } from '../../agent'

export const WORKFLOW_ANSWER_MESSAGE_CHANNEL = 'message'
export const WORKFLOW_ANSWER_MESSAGES_CHANNEL = 'messages'

export function answerOutputVariables(entity: IWorkflowNode) {
	return [
		{
			type: XpertParameterTypeEnum.STRING,
			name: WORKFLOW_ANSWER_MESSAGE_CHANNEL,
			title: 'Message',
			description: {
				en_US: 'Latest Message',
				zh_Hans: '最新消息'
			}
		},
		{
			type: XpertParameterTypeEnum.ARRAY,
			name: WORKFLOW_ANSWER_MESSAGES_CHANNEL,
			title: 'Messages',
			description: {
				en_US: 'AI Messages',
				zh_Hans: 'AI 消息列表'
			}
		}
	]
}

export function createAnswerNode(
	graph: TXpertGraph,
	node: TXpertTeamNode & { type: 'workflow' },
	params: {
		leaderKey: string
		commandBus: CommandBus
		queryBus: QueryBus
		xpertId: string
		environment: IEnvironment
		conversationId: string
	}
) {
	const { commandBus, queryBus, leaderKey, xpertId, environment, conversationId } = params
	const entity = node.entity as IWFNAnswer

	return {
		workflowNode: {
			graph: RunnableLambda.from(async (state: typeof AgentStateAnnotation.State, config) => {
				const configurable: TAgentRunnableConfigurable = config.configurable
				const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId } = configurable

				// Convert state to parameters for template rendering
				const parameters = stateToParameters(state, environment)
				
				// Extract variables used in template
				const templateVars = new Set<string>()
				const template = entity.promptTemplate ?? ''
				// Match Mustache variables: {{variable}} or {{object.property}}
				// Note: This regex handles simple cases and does not support nested braces or escaped braces
				const varRegex = /\{\{([^}]+)\}\}/g
				let match: RegExpExecArray | null
				while ((match = varRegex.exec(template)) !== null) {
					const varPath = match[1].trim()
					templateVars.add(varPath)
				}
				
				// Build inputs with only used variables
				const inputs: Record<string, any> = {}
				templateVars.forEach(varPath => {
					// Support nested paths like "agent_xxx_channel.rules"
					// Note: This implementation uses simple dot notation and doesn't support array indices
					// or special characters in property names. For complex paths like "items[0].name",
					// the template variable should be pre-processed or use a different approach.
					const parts = varPath.split('.')
					let value = parameters
					for (const part of parts) {
						value = value?.[part]
						if (value === undefined) break
					}
					if (value !== undefined) {
						inputs[varPath] = value
					}
				})
				
				const aiMessage = await AIMessagePromptTemplate.fromTemplate(template, {
					templateFormat: 'mustache'
				}).format(parameters)

				const execution: IXpertAgentExecution = {
					category: 'workflow',
					type: WorkflowNodeTypeEnum.ANSWER,
					parentId: executionId,
					threadId: thread_id,
					checkpointNs: checkpoint_ns,
					checkpointId: checkpoint_id,
					agentKey: node.key,
					title: entity.title,
					inputs
				}
				return await wrapAgentExecution(
					async () => {
						if (!entity.mute) {
							await new FakeStreamingChatModel({ responses: [aiMessage] }).invoke([], config)
						}
						return {
							state: {
								[channelName(node.key)]: {
									[WORKFLOW_ANSWER_MESSAGES_CHANNEL]: [aiMessage],
									[WORKFLOW_ANSWER_MESSAGE_CHANNEL]: aiMessage.content
								},
								// Append to main message channel
								messages: [
									new AIMessage({
										content: aiMessage.content
									})
								]
							},
							output: aiMessage.content as string
						}
					},
					{
						commandBus,
						queryBus,
						subscriber,
						execution
					}
				)()
			}),
			ends: [],
			channel: {
				name: channelName(node.key),
				annotation: Annotation<{ [WORKFLOW_ANSWER_MESSAGES_CHANNEL]: BaseMessage[] } & Record<string, unknown>>(
					{
						reducer: (a, b) => {
							return b
								? {
									...a,
									...b
									// messages: b.messages ? messagesStateReducer(a.messages, b.messages) : a.messages
								}
								: a
						},
						default: () => ({
							[WORKFLOW_ANSWER_MESSAGES_CHANNEL]: []
						})
					}
				)
			}
		},
	}
}
