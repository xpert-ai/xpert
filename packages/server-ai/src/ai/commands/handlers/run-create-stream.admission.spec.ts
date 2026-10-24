import { AssertXpertAgentExecutionAccessQuery } from '../../../xpert-agent-execution/queries/assert-access.query'
jest.mock('../../../xpert-project/services/conversation-project.service', () => ({
    ConversationProjectService: class {}
}))
jest.mock('../../../desktop-shell/desktop-shell-auth.service', () => ({ DesktopShellAuthService: class {} }))
jest.mock('../../../chat-conversation/conversation-thread.service', () => ({ ChatConversationThreadService: class {} }))
jest.mock('../../../shared/stream/', () => jest.requireActual('../../../shared/stream/run-stream-payload'))

jest.mock('../../../chat-conversation/thread-run-control.service', () => ({
    ThreadRunControlService: class {},
    threadGraphRevision: () => 'graph-v1',
    threadControlConflict: (_key: string, message: string) =>
        new (jest.requireActual('@nestjs/common').ConflictException)(message)
}))

jest.mock('../../../environment', () => {
    const actual = jest.requireActual('../../../environment/utils')

    return {
        EnvironmentService: class EnvironmentService {},
        getContextEnvState: actual.getContextEnvState,
        mergeEnvironmentWithEnvState: actual.mergeEnvironmentWithEnvState,
        mergeRuntimeContextWithEnv: actual.mergeRuntimeContextWithEnv
    }
})

jest.mock('../../../xpert', () => ({
    PublishedXpertAccessService: class PublishedXpertAccessService {},
    XpertPrincipalService: class XpertPrincipalService {}
}))

jest.mock('../../../xpert-project', () => ({
    XpertProjectService: class XpertProjectService {}
}))

jest.mock('@xpert-ai/contracts', () => {
    const actual = jest.requireActual('@xpert-ai/contracts')

    return {
        ...actual,
        RequestScopeLevel: {
            TENANT: 'tenant',
            ORGANIZATION: 'organization'
        }
    }
})

jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')

    return {
        ...actual,
        RequestContext: {
            currentApiKey: jest.fn(),
            currentApiPrincipal: jest.fn(),
            currentRequest: jest.fn(),
            currentUser: jest.fn(),
            currentUserId: jest.fn(),
            isOrganizationScope: jest.fn()
        }
    }
})

import { BadRequestException } from '@nestjs/common'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands/upsert.command'
import { XpertChatCommand } from '../../../xpert/commands/chat.command'
import { RunCreateStreamCommand } from '../run-create-stream.command'
import { RunCreateStreamHandler } from './run-create-stream.handler'

describe('run stream admission failures', () => {
    it.each([true, false])(
        'preserves errors while releasing the run claim (run control: %s)',
        async (withRunControl) => {
            const failure = new BadRequestException('Model unavailable')
            const conversation = { id: 'conversation', threadId: 'thread', xpertId: 'assistant', options: {} }
            const commandBus = {
                execute: jest.fn(async (command: unknown) => {
                    if (command instanceof XpertAgentExecutionUpsertCommand) return { id: 'run' }
                    if (command instanceof XpertChatCommand) throw failure
                    return null
                })
            }
            const threads = {
                requireByThreadId: jest.fn(async () => ({ status: 'idle', conversation })),
                claimForRun: jest.fn(),
                updateRuntimeState: jest.fn()
            }
            const control = { start: jest.fn(), finish: jest.fn() }
            const handler = new RunCreateStreamHandler(
                commandBus as never,
                { execute: jest.fn() } as never,
                {} as never,
                { getAccessiblePublishedXpert: jest.fn(async () => ({ id: 'assistant' })) } as never,
                undefined,
                undefined,
                threads as never,
                withRunControl ? (control as never) : undefined
            )
            await expect(
                handler.execute(
                    new RunCreateStreamCommand('thread', {
                        assistant_id: 'assistant',
                        stream_mode: ['messages'],
                        stream_subgraphs: false,
                        on_disconnect: 'continue',
                        multitask_strategy: 'reject',
                        if_not_exists: 'reject',
                        input: { action: 'send', message: { input: { input: 'Test', model: 'mdl_removed' } } }
                    })
                )
            ).rejects.toBe(failure)
            expect(commandBus.execute).toHaveBeenCalledWith(
                expect.objectContaining({
                    execution: expect.objectContaining({
                        id: 'run',
                        status: XpertAgentExecutionStatusEnum.ERROR,
                        error: failure.message
                    })
                })
            )
            if (withRunControl) {
                expect(control.finish).toHaveBeenCalledWith('thread', 'run', 'error', failure.message)
            } else {
                expect(threads.updateRuntimeState).toHaveBeenCalledWith('thread', 'error', failure.message)
            }
        }
    )
    it.each([true, false])(
        'rejects a retry without an input recovery point before mutation (execution id: %s)',
        async (withExecutionId) => {
            const conversation = { id: 'conversation', threadId: 'thread', xpertId: 'assistant', options: {} }
            const commandBus = { execute: jest.fn() }
            const queryBus = {
                execute: jest.fn(async (query: unknown) =>
                    query instanceof AssertXpertAgentExecutionAccessQuery
                        ? { id: 'old-run', threadId: 'thread', error: 'original failure' }
                        : { graph: {} }
                )
            }
            const threads = {
                requireByThreadId: jest.fn(async () => ({ status: 'error', conversation })),
                findVisibleMessages: jest.fn(async () => ({
                    items: [{ id: 'ai', role: 'ai', executionId: 'old-run' }]
                })),
                claimForRun: jest.fn(),
                updateRuntimeState: jest.fn()
            }
            const handler = new RunCreateStreamHandler(
                commandBus as never,
                queryBus as never,
                {} as never,
                { getAccessiblePublishedXpert: jest.fn(async () => ({ id: 'assistant' })) } as never,
                undefined,
                undefined,
                threads as never
            )
            await expect(
                handler.execute(
                    new RunCreateStreamCommand('thread', {
                        assistant_id: 'assistant',
                        stream_mode: ['messages'],
                        stream_subgraphs: false,
                        on_disconnect: 'continue',
                        multitask_strategy: 'reject',
                        if_not_exists: 'reject',
                        input: {
                            action: 'retry',
                            source: withExecutionId ? { executionId: 'old-run' } : { aiMessageId: 'ai' }
                        }
                    })
                )
            ).rejects.toMatchObject({
                response: { code: 'conversation_recovery_unavailable' },
                cause: { originalError: 'original failure' }
            })
            expect(threads.claimForRun).not.toHaveBeenCalled()
            expect(commandBus.execute).not.toHaveBeenCalled()
        }
    )
})
