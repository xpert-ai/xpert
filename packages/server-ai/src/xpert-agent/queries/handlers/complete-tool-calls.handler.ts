import { get_lc_unique_name, Serializable } from '@langchain/core/load/serializable'
import { agentUniqueName, IXpertAgent, TSensitiveOperation, TToolCallType, XpertParameterTypeEnum } from '@metad/contracts'
import { CommandBus, IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { GetXpertAgentQuery } from '../../../xpert/queries'
import { CompleteToolCallsQuery } from '../complete-tool-calls.query'
import { identifyAgent, STATE_VARIABLE_INPUT } from '../../commands/handlers/types'

@QueryHandler(CompleteToolCallsQuery)
export class CompleteToolCallsHandler implements IQueryHandler<CompleteToolCallsQuery> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: CompleteToolCallsQuery): Promise<TSensitiveOperation> {
		const { xpertId, agentKey, aiMessage, isDraft } = command

		const agent = await this.queryBus.execute<GetXpertAgentQuery, IXpertAgent>(
			new GetXpertAgentQuery(xpertId, agentKey, isDraft)
		)
		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
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
					const lc_name = get_lc_unique_name(tool.constructor as typeof Serializable)
					return {
						tool,
						definition: toolset.getToolset().tools.find((_) => _.name === lc_name)
					}
				})
			)
		}

		const toolCalls = aiMessage.tool_calls?.map((toolCall) => {
			toolCall.name
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
				subAgents[toolCall.name].parameters?.forEach((param) => parameters.push({
					name: param.name,
					title: param.title,
					description: param.description,
					type: param.type
				}))
				return {
					call: toolCall,
					type: 'agent' as TToolCallType,
					
					info: {
						name: subAgents[toolCall.name].name,
						title: subAgents[toolCall.name].title,
						description: subAgents[toolCall.name].description
					},
					parameters
				}
			} else {
				const tool = tools.find((_) => _.tool.name === toolCall.name)
				if (tool) {
					return {
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
						}))
					}
				}
				return null
			}
		})

		return {
			messageId: aiMessage.id,
			agent: identifyAgent(agent),
			toolCalls
		}
	}
}
