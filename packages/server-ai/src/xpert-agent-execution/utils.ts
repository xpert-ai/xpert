import { ChatMessageEventTypeEnum, IXpertAgentExecution, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Subscriber } from 'rxjs'
import { messageEvent } from '../xpert-agent/agent'
import { XpertAgentExecutionUpsertCommand } from './commands'
import { XpertAgentExecutionDTO } from './dto'
import { getErrorMessage } from '@metad/server-common'
import { XpertAgentExecutionOneQuery } from './queries'
import { AgentStateAnnotation } from '../xpert-agent/commands/handlers/types'

export function wrapAgentExecution(
	fuc: (execution: Partial<IXpertAgentExecution>) => Promise<{output?: string; state: Partial<typeof AgentStateAnnotation.State>}>,
	params: {
		commandBus: CommandBus,
		queryBus: QueryBus,
		subscriber: Subscriber<MessageEvent>
		execution: Partial<IXpertAgentExecution>
	}
) {
	const { commandBus, queryBus, subscriber, execution } = params
	return async () => {
		// Record start time
		const timeStart = Date.now()
		let subexecution = await commandBus.execute(
			new XpertAgentExecutionUpsertCommand({
				...execution,
				status: XpertAgentExecutionStatusEnum.RUNNING
			})
		)
		// Start agent execution event
		subscriber.next(messageEvent(ChatMessageEventTypeEnum.ON_AGENT_START, new XpertAgentExecutionDTO(subexecution)))

		let status = XpertAgentExecutionStatusEnum.SUCCESS
		let error = null
		let output = null
		try {
			const results = await fuc(execution)
			output = results?.output

			return results?.state
		} catch(err) {
			status = XpertAgentExecutionStatusEnum.ERROR
			error = getErrorMessage(err)
			throw err
		} finally {
			const timeEnd = Date.now()
			// Record End time
			subexecution = await commandBus.execute(
				new XpertAgentExecutionUpsertCommand({
					...subexecution,
					elapsedTime: timeEnd - timeStart,
					status,
					error,
					outputs: {
						output
					}
				})
			)

			subexecution = await queryBus.execute(
				new XpertAgentExecutionOneQuery(subexecution.id)
			)

			// End agent execution event
			subscriber.next(
				messageEvent(
					ChatMessageEventTypeEnum.ON_AGENT_END,
					new XpertAgentExecutionDTO(subexecution)
				)
			)
		}
	}
}
