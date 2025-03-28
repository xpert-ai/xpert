import { isAIMessage } from '@langchain/core/messages'
import { RunnableLambda } from '@langchain/core/runnables'
import { Annotation, CompiledStateGraph, isCommand, isParentCommand } from '@langchain/langgraph'
import { createHandoffTool, createSwarm } from '@langchain/langgraph-swarm'
import {
	agentLabel,
	ChatMessageEventTypeEnum,
	IXpert,
	IXpertAgent,
	IXpertAgentExecution,
	TXpertGraph,
	TXpertTeamNode,
	XpertAgentExecutionStatusEnum
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { CopilotCheckpointSaver } from '../../../copilot-checkpoint'
import { XpertAgentExecutionOneQuery, XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution'
import { GetXpertWorkflowQuery } from '../../../xpert/queries'
import { messageEvent } from '../../agent'
import { XpertAgentSwarmCommand } from '../create-swarm.command'
import { XpertAgentSubgraphCommand } from '../subgraph.command'
import { AgentStateAnnotation } from './types'

@CommandHandler(XpertAgentSwarmCommand)
export class XpertAgentSwarmHandler implements ICommandHandler<XpertAgentSwarmCommand> {
	readonly #logger = new Logger(XpertAgentSwarmHandler.name)

	constructor(
		private readonly checkpointer: CopilotCheckpointSaver,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly i18nService: I18nService
	) {}

	public async execute(command: XpertAgentSwarmCommand): Promise<{
		agent: IXpertAgent
		graph: CompiledStateGraph<unknown, unknown, any>
	}> {
		const { agentKeyOrName, xpert, options } = command
		const { isDraft, execution, summarizeTitle, subscriber, rootController, signal, partners } = options

		// Signal controller in this subgraph
		const abortController = new AbortController()
		signal?.addEventListener('abort', () => abortController.abort())

		const { agent, graph: xpertGraph } = await this.queryBus.execute<
			GetXpertWorkflowQuery,
			{ agent: IXpertAgent; graph: TXpertGraph; next: TXpertTeamNode[]; fail: TXpertTeamNode[] }
		>(new GetXpertWorkflowQuery(xpert.id, agentKeyOrName, command.options?.isDraft))
		if (!agent) {
			throw new NotFoundException(
				`Xpert agent not found for '${xpert.name}' and key or name '${agentKeyOrName}', draft is ${command.options?.isDraft}`
			)
		}

		// The xpert (agent team)
		const thread_id = command.options.thread_id

		// Create swarm
		const agents = []
		for await (const member of partners) {
			// Handoff tool
			const handoffTools = partners
				.filter((p) =>
					xpertGraph.connections.some(
						(conn) => conn.type === 'agent' && conn.from === member && conn.to === p
					)
				)
				.map((partner) => {
					const agent = xpertGraph.nodes.find((_) => _.key === partner).entity as IXpertAgent
					return createHandoffTool({
						agentName: partner,
						description: `Transfer user to the ${agentLabel(agent)} assistant, that can ${agent.description}`
					})
				})

			// Object reference for recording model information and token usage
			const _execution: IXpertAgentExecution = {}
			const { name, graph } = await this.commandBus.execute<
				XpertAgentSubgraphCommand,
				{
					name: string
					graph: CompiledStateGraph<unknown, unknown>
				}
			>(
				new XpertAgentSubgraphCommand(member, xpert, {
					thread_id,
					rootController,
					signal,
					isStart: true,
					leaderKey: null,
					rootExecutionId: options.rootExecutionId,
					isDraft,
					subscriber,
					execution: _execution,
					channel: null,
					partners,
					handoffTools
				})
			)

			const runnable = new RunnableLambda({
				func: async (state: typeof AgentStateAnnotation.spec, config) => {
					// Record start time
					const timeStart = Date.now()
					const __execution = await this.commandBus.execute(
						new XpertAgentExecutionUpsertCommand({
							..._execution,
							threadId: config.configurable.thread_id,
							checkpointNs: config.configurable.checkpoint_ns,
							xpert: { id: xpert.id } as IXpert,
							agentKey: member,
							inputs: { input: state.input },
							parentId: options.rootExecutionId,
							status: XpertAgentExecutionStatusEnum.RUNNING
						})
					)

					// Start agent execution event
					subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_START, __execution))

					// Exec
					let status = XpertAgentExecutionStatusEnum.SUCCESS
					let error = null
					let result = ''
					const finalize = async () => {
						const _state = await graph.getState(config)

						const timeEnd = Date.now()
						// Record End time
						const ___execution = await this.commandBus.execute(
							new XpertAgentExecutionUpsertCommand({
								..._execution,
								id: __execution.id,
								checkpointId: _state.config.configurable.checkpoint_id,
								elapsedTime: timeEnd - timeStart,
								status,
								error,
								outputs: {
									output: result
								}
							})
						)

						const fullExecution = await this.queryBus.execute(
							new XpertAgentExecutionOneQuery(___execution.id)
						)

						// End agent execution event
						subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_END, fullExecution))
					}
					try {
						const output = await graph.invoke(state, config)

						const lastMessage = output.messages[output.messages.length - 1]
						if (lastMessage && isAIMessage(lastMessage)) {
							result = lastMessage.content as string
						}

						return output
					} catch (err) {
						if (!isParentCommand(err) && !isCommand(err)) {
							error = getErrorMessage(err)
							status = XpertAgentExecutionStatusEnum.ERROR
						}
						throw err
					} finally {
						// End agent execution event
						await finalize()
					}
				}
			})
			runnable.name = member
			agents.push(runnable)
		}

		/**
		 * State schema for the multi-agent swarm.
		 */
		const SwarmState = Annotation.Root({
			...AgentStateAnnotation.spec,
			activeAgent: Annotation<string>
		})
		const builder = createSwarm({
			agents,
			defaultActiveAgent: agentKeyOrName,
			stateSchema: SwarmState
		})

		return {
			agent,
			graph: builder.compile({
				checkpointer: this.checkpointer
			})
		}
	}
}
