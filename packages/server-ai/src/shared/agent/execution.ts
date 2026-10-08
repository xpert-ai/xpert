import { isGraphInterrupt } from '@langchain/langgraph'
import {
    ChatMessageEventTypeEnum,
    ChatMessageTypeEnum,
    IXpertAgentExecution,
    JSONValue,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { instanceToPlain } from 'class-transformer'
import { Subscriber } from 'rxjs'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands'
import { XpertAgentExecutionDTO } from '../../xpert-agent-execution/dto'
import { XpertAgentExecutionOneQuery } from '../../xpert-agent-execution/queries'
import { ExecutionCancelledError } from '../execution/execution-cancelled.error'

function createAgentMessageEvent(event: ChatMessageEventTypeEnum, data: any) {
    return {
        data: {
            type: ChatMessageTypeEnum.EVENT,
            event,
            data: instanceToPlain(data)
        }
    } as MessageEvent
}

/**
 * Wraps the agent execution in a try-catch block and handles the execution lifecycle.
 *
 * @param fuc return {output: string; state: State}
 * @param params
 * @returns
 */
export function wrapAgentExecution<T>(
    fuc: (execution: Partial<IXpertAgentExecution>) => Promise<{ output?: string | JSONValue; state: T }>,
    params: {
        commandBus: CommandBus
        queryBus: QueryBus
        execution: Partial<IXpertAgentExecution>
        subscriber?: Subscriber<MessageEvent>
        catchError?: (error) => Promise<void>
    }
) {
    const { commandBus, queryBus, subscriber, execution, catchError } = params
    return async () => {
        // Record start time
        const timeStart = Date.now()
        execution.status = XpertAgentExecutionStatusEnum.RUNNING
        let subexecution = await commandBus.execute(
            new XpertAgentExecutionUpsertCommand({
                ...execution
            })
        )
        execution.id = subexecution.id
        // Start agent execution event
        subscriber?.next(
            createAgentMessageEvent(ChatMessageEventTypeEnum.ON_AGENT_START, new XpertAgentExecutionDTO(subexecution))
        )

        let status = XpertAgentExecutionStatusEnum.SUCCESS
        let error = null
        let output = null
        try {
            const results = await fuc(execution)
            output = results?.output

            return results?.state
        } catch (err) {
            status =
                isGraphInterrupt(err) || err instanceof ExecutionCancelledError
                    ? XpertAgentExecutionStatusEnum.INTERRUPTED
                    : XpertAgentExecutionStatusEnum.ERROR
            error = isGraphInterrupt(err) ? null : getErrorMessage(err)
            if (catchError) {
                catchError(err).catch(() => {
                    // ignore
                })
            }
            throw err
        } finally {
            const timeEnd = Date.now()
            execution.status = status
            execution.error = error
            // Record End time
            subexecution = await commandBus.execute(
                new XpertAgentExecutionUpsertCommand({
                    // Persist runtime changes, not the initial row's timestamps or usage counters.
                    ...execution,
                    elapsedTime: timeEnd - timeStart,
                    outputs: {
                        output
                    }
                })
            )

            subexecution = await queryBus.execute(new XpertAgentExecutionOneQuery(subexecution.id))

            // End agent execution event
            subscriber?.next(
                createAgentMessageEvent(ChatMessageEventTypeEnum.ON_AGENT_END, new XpertAgentExecutionDTO(subexecution))
            )
        }
    }
}
