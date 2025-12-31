import { get_lc_unique_name, Serializable } from '@langchain/core/load/serializable'
import { isAIMessageChunk, isBaseMessageChunk } from '@langchain/core/messages'
import { DynamicStructuredTool } from '@langchain/core/tools'
import {
	agentUniqueName,
	IXpertAgent,
	IXpertToolset,
	STATE_VARIABLE_INPUT,
	TSensitiveOperation,
	TToolCall,
	TToolCallType,
	XpertParameterTypeEnum
} from '@metad/contracts'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { _BaseToolset, BuiltinToolset, findChannelByTool, identifyAgent } from '../../../shared'
import { ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { GetXpertAgentQuery } from '../../../xpert/queries'
import { CompleteToolCallsQuery } from '../complete-tool-calls.query'

@QueryHandler(CompleteToolCallsQuery)
export class CompleteToolCallsHandler implements IQueryHandler<CompleteToolCallsQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: CompleteToolCallsQuery): Promise<TSensitiveOperation> {
		const { xpertId, tasks, values, isDraft } = command

		const _tasks = await Promise.all(
			tasks.map(async (task) => {
				const [channelName, channel] = findChannelByTool(values, task.name)
				if (!channel) {
					return task
				}
				const lastMessage = channel?.messages?.[channel.messages.length - 1]
				let aiMessage = null
				if (isBaseMessageChunk(lastMessage) && isAIMessageChunk(lastMessage)) {
					aiMessage = lastMessage
				} else {
					throw new Error(`Message with ID ${task.id} is not an AI message.`)
				}
				const toolCall = aiMessage.tool_calls?.find((call) => call.name === task.name)

				if (!xpertId) {
					return task
				}

				const agentKey = channelName.replace('_channel', '')
				const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
					new GetXpertAgentQuery(xpertId, agentKey, isDraft)
				)
				const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, _BaseToolset[]>(
					new ToolsetGetToolsCommand(agent.toolsetIds)
				)
				const subAgents: Record<string, IXpertAgent> = {}
				if (agent.collaborators) {
					for await (const collaborator of agent.collaborators) {
						const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
							new GetXpertAgentQuery(collaborator.id)
						)
						const uniqueName = agentUniqueName(agent)
						subAgents[uniqueName] = agent
					}
				}

				if (agent.followers) {
					for (const follower of agent.followers) {
						const uniqueName = agentUniqueName(follower)
						subAgents[uniqueName] = follower
					}
				}

				const tools = []
				for await (const toolset of toolsets) {
					const items = await toolset.initTools()
					tools.push(
						...items.map((tool) => {
							const lc_name =
								tool instanceof DynamicStructuredTool
									? tool.name
									: get_lc_unique_name(tool.constructor as typeof Serializable)
							let toolsetDefinition: IXpertToolset = null
							if (toolset instanceof BuiltinToolset) {
								toolsetDefinition = toolset.getToolset()
							}
							return {
								tool,
								definition: toolsetDefinition?.tools.find((_) => _.name === lc_name)
							}
						})
					)
				}

				// Find in agents
				if (subAgents[toolCall.name]) {
					const parameters = [
						{
							name: STATE_VARIABLE_INPUT,
							title: 'Input',
							description: 'Input content',
							type: XpertParameterTypeEnum.TEXT
						}
					]
					subAgents[toolCall.name].parameters?.forEach((param) =>
						parameters.push({
							name: param.name,
							title: param.title,
							description: param.description as string,
							type: param.type
						})
					)
					return {
						...task,
						call: toolCall as TToolCall,
						type: 'agent' as TToolCallType,
						info: {
							name: subAgents[toolCall.name].name,
							title: subAgents[toolCall.name].title,
							description: subAgents[toolCall.name].description
						},
						parameters,
						agent: identifyAgent(agent)
					}
				} else {
					const tool = tools.find((_) => _.tool.name === toolCall.name)
					if (tool) {
						return {
							...task,
							call: toolCall,
							type: 'tool' as TToolCallType,
							info: {
								name: tool.tool.name,
								description: tool.tool.description
							},
							parameters: tool.definition?.schema?.parameters?.map((param) => ({
								name: param.name,
								title: param.label,
								description: param.human_description,
								placeholder: param.placeholder,
								type: param.type
							})),
							agent: identifyAgent(agent)
						}
					}
					
					return task
				}
			})
		)

		return {
			tasks: _tasks
		}
	}
}
