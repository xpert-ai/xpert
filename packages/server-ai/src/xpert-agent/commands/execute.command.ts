import { tool } from '@langchain/core/tools'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, IXpert, IXpertAgent, IXpertAgentExecution, TChatOptions, TXpertParameter, XpertAgentExecutionStatusEnum, XpertParameterTypeEnum } from '@metad/contracts'
import { convertToUrlPath, getErrorMessage } from '@metad/server-common'
import { CommandBus, ICommand, QueryBus } from '@nestjs/cqrs'
import { lastValueFrom, Observable, reduce, Subscriber, tap } from 'rxjs'
import { z } from 'zod'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands'
import { XpertAgentExecutionOneQuery } from '../../xpert-agent-execution/queries'
import { StoredMessage } from '@langchain/core/messages'

export class XpertAgentExecuteCommand implements ICommand {
	static readonly type = '[Xpert Agent] Execute'

	constructor(
		public readonly input: {
			input?: string
			[key: string]: unknown
		},
		public readonly agentKey: string,
		public readonly xpert: Partial<IXpert>,
		public readonly options: TChatOptions & {
			// The id of root agent execution
			rootExecutionId: string
			// Langgraph thread id
			thread_id?: string
			// Use xpert's draft
			isDraft?: boolean
			// The instance of current agent execution
			execution: IXpertAgentExecution
			// The subscriber response to client
			subscriber: Subscriber<MessageEvent>

			message?: StoredMessage
		}
	) {}
}

/**
 * Create agent of xpert as tool to execute
 *
 * @param commandBus
 * @param config
 * @returns
 */
export function createXpertAgentTool(
	commandBus: CommandBus,
	queryBus: QueryBus,
	config: {
		xpert: Partial<IXpert>
		agent: IXpertAgent
		options: {
			rootExecutionId: string
			isDraft: boolean
			subscriber: Subscriber<MessageEvent>
		}
	}
) {
	const { agent, xpert, options } = config
	const { subscriber } = options

	return tool(
		async (args, config: LangGraphRunnableConfig) => {
			/**
			 * @todo should record runId in execution
			 */
			const runId = config.runId

			// Record start time
			const timeStart = Date.now()

			const execution = await commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					xpert: { id: xpert.id } as IXpert,
					agentKey: agent.key,
					inputs: args,
					parentId: options.rootExecutionId,
					parent_thread_id: config.configurable.thread_id,
					status: XpertAgentExecutionStatusEnum.RUNNING
				})
			)

			// Start agent execution event
			subscriber.next(
				({
					data: {
						type: ChatMessageTypeEnum.EVENT,
						event: ChatMessageEventTypeEnum.ON_AGENT_START,
						data: execution
					}
				}) as MessageEvent
			)

			let status = XpertAgentExecutionStatusEnum.SUCCESS
			let error = null
			let result = ''
			const finalize = async () => {
				const timeEnd = Date.now()
				// Record End time
				const newExecution = await commandBus.execute(
					new XpertAgentExecutionUpsertCommand({
						id: execution.id,
						elapsedTime: timeEnd - timeStart,
						status,
						error,
						tokens: execution.tokens,
						outputs: {
							output: result
						}
					})
				)

				const fullExecution = await queryBus.execute(
					new XpertAgentExecutionOneQuery(newExecution.id)
				)

				// End agent execution event
				subscriber.next(
					({
						data: {
							type: ChatMessageTypeEnum.EVENT,
							event: ChatMessageEventTypeEnum.ON_AGENT_END,
							data: fullExecution
						}
					}) as MessageEvent
				)
			}
			try {
				const obs = await commandBus.execute<XpertAgentExecuteCommand, Observable<string>>(
					new XpertAgentExecuteCommand(args, agent.key, xpert, { ...options, thread_id: execution.threadId, execution })
				)
				
				await lastValueFrom(obs.pipe(
					reduce((acc, val) => acc + val, ''),
					tap({
						next: (text: string) => {
							result = text
						},
						error: (err) => {
							status = XpertAgentExecutionStatusEnum.ERROR
							error = getErrorMessage(err)
						},
						finalize: async () => {
							try {
								await finalize()
							} catch(err) {
								//
							}
						}
					}
				)))

				return result
			} catch(err) {
				// Catch the error before generated obs
				try {
					status = XpertAgentExecutionStatusEnum.ERROR
					error = getErrorMessage(err)
					await finalize()
				} catch(err) {
					//
				}
				throw err
			}
		},
		{
			name: convertToUrlPath(agent.name) || agent.key,
			description: agent.description,
			schema: z.object({
				...(createParameters(agent.parameters) ?? {}),
				input: z.string().describe('Ask me some question or give me task to complete')
			})
		}
	)
}

/**
 * Create zod schema for custom parameters of agent
 * 
 * @param parameters 
 * @returns 
 */
function createParameters(parameters: TXpertParameter[]) {
	return parameters?.reduce((schema, parameter) => {
		let value = null
		switch(parameter.type) {
			case XpertParameterTypeEnum.TEXT:
			case XpertParameterTypeEnum.PARAGRAPH: {
				value = z.string()
				break
			}
			case XpertParameterTypeEnum.NUMBER: {
				value = z.number()
				break
			}
			case XpertParameterTypeEnum.SELECT: {
				value = z.enum(parameter.options as any)
			}
		}

		if (value) {
			if (parameter.optional) {
				schema[parameter.name] = value.optional().describe(parameter.description)
			} else {
				schema[parameter.name] = value.describe(parameter.description)
			}
		}
		
		return schema
	}, {})
}