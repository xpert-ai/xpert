import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessageChunk, HumanMessage, MessageContent, SystemMessage } from '@langchain/core/messages'
import { SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { StateGraphArgs } from '@langchain/langgraph'
import { ICopilot } from '@metad/contracts'
import { AgentRecursionLimit } from '@metad/copilot'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { uniqueId } from 'lodash'
import { filter, from, map, Observable } from 'rxjs'
import { AIModelGetOneQuery } from '../../../ai-model'
import { AgentState, CopilotGetOneQuery, createCopilotAgentState, createReactAgent } from '../../../copilot'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { BaseToolset, ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { XpertAgentService } from '../../xpert-agent.service'
import { XpertAgentExecuteCommand } from '../execute.command'
import { GetXpertAgentQuery } from '../../../xpert/queries'

export type ChatAgentState = AgentState
export const chatAgentState: StateGraphArgs<ChatAgentState>['channels'] = {
	...createCopilotAgentState()
}

@CommandHandler(XpertAgentExecuteCommand)
export class XpertAgentExecuteHandler implements ICommandHandler<XpertAgentExecuteCommand> {
	readonly #logger = new Logger(XpertAgentExecuteHandler.name)

	constructor(
		private readonly agentService: XpertAgentService,
		private readonly copilotCheckpointSaver: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: XpertAgentExecuteCommand): Promise<Observable<MessageContent>> {
		const { input, agent: _agent, xpert } = command
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const user = RequestContext.currentUser()

		const agent = await this.queryBus.execute(new GetXpertAgentQuery(xpert.id, _agent.key,))

		let copilot: ICopilot = null
		const copilotId = agent.copilotModel?.copilotId ?? xpert.copilotModel?.copilotId
		const copilotModel = agent.copilotModel ?? xpert.copilotModel
		if (copilotId) {
			copilot = await this.queryBus.execute(new CopilotGetOneQuery(copilotId))
		}

		const chatModel = await this.queryBus.execute<AIModelGetOneQuery, BaseChatModel>(
			new AIModelGetOneQuery(copilot)
		)

		const toolsets = await this.commandBus.execute<ToolsetGetToolsCommand, BaseToolset[]>(
			new ToolsetGetToolsCommand(agent.toolsetIds)
		)
		const tools = []
		toolsets.forEach((toolset) => {
			tools.push(...toolset.getTools())
		})

		const graph = createReactAgent({
			state: chatAgentState,
			llm: chatModel,
			checkpointSaver: this.copilotCheckpointSaver,
			tools: [...tools],
			messageModifier: async (state) => {
				const systemTemplate = `{{role}}
{{language}}
References documents:
{{context}}
${agent.prompt}
`
				const system = await SystemMessagePromptTemplate.fromTemplate(systemTemplate, {
					templateFormat: 'mustache'
				}).format({ ...state })
				return [new SystemMessage(system), ...state.messages]
			}
		})

		const threadId = uniqueId()
		const abortController = new AbortController()

		return from(
			graph.streamEvents(
				{
					input,
					messages: [new HumanMessage(input)]
				},
				{
					version: 'v2',
					configurable: {
						thread_id: threadId,
						checkpoint_ns: '',
						tenantId: tenantId,
						organizationId: organizationId,
						userId: user.id
					},
					recursionLimit: AgentRecursionLimit,
					signal: abortController.signal
					// debug: true
				}
			)
		).pipe(
			map(({ event, data, ...rest }: any) => {
				switch (event) {
					case 'on_chat_model_stream': {
						const msg = data.chunk as AIMessageChunk
						if (!msg.tool_call_chunks?.length) {
							if (msg.content) {
								return msg.content
							}
						}
						break
					}
					default: {
						return null
					}
				}
			}),
			filter((content) => !!content)
		)
	}

}
