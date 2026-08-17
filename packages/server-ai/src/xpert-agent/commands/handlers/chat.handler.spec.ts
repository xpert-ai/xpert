import { IXpertAgentExecution, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { lastValueFrom, Observable, of, toArray } from 'rxjs'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries'
import { XpertAgentChatCommand } from '../chat.command'
import { XpertAgentInvokeCommand } from '../invoke.command'
import { XpertAgentChatHandler } from './chat.handler'

function createChatCommand(execution: IXpertAgentExecution) {
    return new XpertAgentChatCommand(
        { human: { input: 'hi' } } as ConstructorParameters<typeof XpertAgentChatCommand>[0],
        'agent-1',
        { id: 'xpert-1' } as ConstructorParameters<typeof XpertAgentChatCommand>[2],
        {
            isDraft: true,
            store: null,
            execution
        } as ConstructorParameters<typeof XpertAgentChatCommand>[3]
    )
}

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
        const stream = await handler.execute(createChatCommand(execution))

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

    it('persists runtime-derived execution fields when finalizing successfully', async () => {
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
                    command.options.execution.checkpointNs = 'agent-1'
                    command.options.execution.checkpointId = 'checkpoint-1'
                    command.options.execution.title = 'Generated title'
                    command.options.execution.metadata = { provider: 'volcengine', model: 'doubao-seed' }
                    return of('Hello')
                }
                throw new Error('Unexpected command')
            })
        }
        const queryBus = {
            execute: jest.fn(async (query: unknown) => {
                if (query instanceof XpertAgentExecutionOneQuery) {
                    return execution
                }
                throw new Error('Unexpected query')
            })
        }
        const handler = new XpertAgentChatHandler(commandBus as unknown as CommandBus, queryBus as unknown as QueryBus)
        const stream = await handler.execute(createChatCommand(execution))

        await lastValueFrom(stream.pipe(toArray()))

        expect(upserts.at(-1)).toEqual(
            expect.objectContaining({
                checkpointNs: 'agent-1',
                checkpointId: 'checkpoint-1',
                title: 'Generated title',
                metadata: { provider: 'volcengine', model: 'doubao-seed' }
            })
        )
    })

    it('preserves runtime fields without overwriting the latest checkpoint when canceled', async () => {
        const execution = {
            id: 'execution-1',
            threadId: 'thread-1',
            tokens: 0,
            inputTokens: 0,
            outputTokens: 0
        } as IXpertAgentExecution
        let resolveInvokeStarted!: () => void
        const invokeStarted = new Promise<void>((resolve) => {
            resolveInvokeStarted = resolve
        })
        let resolveAbortedUpdate!: (update: Partial<IXpertAgentExecution>) => void
        const abortedUpdate = new Promise<Partial<IXpertAgentExecution>>((resolve) => {
            resolveAbortedUpdate = resolve
        })
        const commandBus = {
            execute: jest.fn(async (command: unknown) => {
                if (command instanceof XpertAgentExecutionUpsertCommand) {
                    if (command.execution.error === 'Aborted!') {
                        resolveAbortedUpdate(command.execution)
                    }
                    return { ...execution, ...command.execution }
                }
                if (command instanceof XpertAgentInvokeCommand) {
                    command.options.execution.checkpointNs = 'agent-1'
                    command.options.execution.checkpointId = 'stale-checkpoint'
                    command.options.execution.title = 'Generated title'
                    command.options.execution.metadata = { provider: 'volcengine', model: 'doubao-seed' }
                    return new Observable<string>(() => {
                        resolveInvokeStarted()
                    })
                }
                throw new Error('Unexpected command')
            })
        }
        const handler = new XpertAgentChatHandler(commandBus as unknown as CommandBus, {} as QueryBus)
        const stream = await handler.execute(createChatCommand(execution))
        const subscription = stream.subscribe()

        await invokeStarted
        subscription.unsubscribe()

        const finalUpdate = await abortedUpdate
        expect(finalUpdate).toEqual(
            expect.objectContaining({
                checkpointNs: 'agent-1',
                title: 'Generated title',
                metadata: { provider: 'volcengine', model: 'doubao-seed' }
            })
        )
        expect(finalUpdate).not.toHaveProperty('checkpointId')
        expect(finalUpdate).not.toHaveProperty('tokens')
        expect(finalUpdate).not.toHaveProperty('inputTokens')
        expect(finalUpdate).not.toHaveProperty('outputTokens')
    })
})
