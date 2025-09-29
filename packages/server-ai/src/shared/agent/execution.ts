import { ChatMessageEventTypeEnum, IXpertAgentExecution, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands'
import { XpertAgentExecutionDTO } from '../../xpert-agent-execution/dto'
import { XpertAgentExecutionOneQuery } from '../../xpert-agent-execution/queries'
import { messageEvent } from '../../xpert-agent/agent'

/**
 * Wraps the agent execution in a try-catch block and handles the execution lifecycle.
 * 
 * @param fuc return {output: string; state: State}
 * @param params 
 * @returns 
 */
export function wrapAgentExecution<T>(
	fuc: (execution: Partial<IXpertAgentExecution>) => Promise<{ output?: string; state: T }>,
	params: {
		commandBus: CommandBus
		queryBus: QueryBus
		subscriber: Subscriber<MessageEvent>
		execution: Partial<IXpertAgentExecution>
	}
) {
	const { commandBus, queryBus, subscriber, execution } = params
	return async () => {
		// Record start time
		const timeStart = Date.now()
		execution.status = XpertAgentExecutionStatusEnum.RUNNING
		let subexecution = await commandBus.execute(
			new XpertAgentExecutionUpsertCommand({
				...execution,
				// status: XpertAgentExecutionStatusEnum.RUNNING
			})
		)
		execution.id = subexecution.id
		// Start agent execution event
		subscriber?.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_START, new XpertAgentExecutionDTO(subexecution)))

		let status = XpertAgentExecutionStatusEnum.SUCCESS
		let error = null
		let output = null
		try {
			const results = await fuc(execution)
			output = results?.output

			return results?.state
		} catch (err) {
			status = XpertAgentExecutionStatusEnum.ERROR
			error = getErrorMessage(err)
			throw err
		} finally {
			const timeEnd = Date.now()
			execution.status = status
			execution.error = error
			// Record End time
			subexecution = await commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					...subexecution,
					...execution,
					elapsedTime: timeEnd - timeStart,
					// status,
					// error,
					outputs: {
						output
					}
				})
			)

			subexecution = await queryBus.execute(new XpertAgentExecutionOneQuery(subexecution.id))

			// End agent execution event
			subscriber?.next(
				messageEvent(ChatMessageEventTypeEnum.ON_AGENT_END, new XpertAgentExecutionDTO(subexecution))
			)
		}
	}
}
