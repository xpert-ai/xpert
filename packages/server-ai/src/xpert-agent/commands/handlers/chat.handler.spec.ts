import { IXpertAgentExecution, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { lastValueFrom, of, toArray } from 'rxjs'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { XpertAgentChatCommand } from '../chat.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentChatHandler } from './chat.handler'

describe('XpertAgentChatHandler', () => {
    it('does not overwrite persisted usage when finalizing the root execution', async () => {
        const execution = {
            id: 'execution-1',
            threadId: 'thread-1',
            tokens: 0,
            inputTokens: 0,
            outputTokens: 0
        } as IXpertAgentExecution
        const upserts: Array<Partial<IXpertAgentExecution>> = []
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                if (command instanceof XpertAgentExecutionUpsertCommand) {
                    upserts.push(command.execution)
                    return { ...execution, ...command.execution }
                }
                if (command instanceof XpertAgentInvokeCommand) {
                    return of('Hello')
                }
                throw new Error('Unexpected command')
            })
        }
        const queryBus = {
            execute: jest.fn(async (query: unknown) => {
                if (query instanceof XpertAgentExecutionOneQuery) {
                    return {
                        ...execution,
                        tokens: 13_458,
                        inputTokens: 13_363,
                        outputTokens: 95
                    }
                }
                throw new Error('Unexpected query')
            })
        }
        const handler = new XpertAgentChatHandler(commandBus as unknown as CommandBus, queryBus as unknown as QueryBus)
        const stream = await handler.execute(
            new XpertAgentChatCommand(
                { human: { input: 'hi' } } as ConstructorParameters<typeof XpertAgentChatCommand>[0],
                'agent-1',
                { id: 'xpert-1' } as ConstructorParameters<typeof XpertAgentChatCommand>[2],
                {
                    isDraft: true,
                    store: null,
                    execution
                } as ConstructorParameters<typeof XpertAgentChatCommand>[3]
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const finalUpdate = upserts.at(-1)
        expect(finalUpdate).toEqual(
            expect.objectContaining({
                id: 'execution-1',
                status: XpertAgentExecutionStatusEnum.SUCCESS,
                outputs: { output: 'Hello' }
            })
        )
        expect(finalUpdate).not.toHaveProperty('tokens')
        expect(finalUpdate).not.toHaveProperty('inputTokens')
        expect(finalUpdate).not.toHaveProperty('outputTokens')
    })
})
