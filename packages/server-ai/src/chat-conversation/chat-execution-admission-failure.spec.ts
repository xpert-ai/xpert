import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ThreadRunControlService } from './thread-run-control.service'
import { ChatExecutionAdmissionService } from './chat-execution-admission.service'

describe('rejected run admission', () => {
    afterEach(() => jest.restoreAllMocks())
    it('persists the admission error before finishing the reserved run', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        const thread = new ChatConversationThread({
            threadId: 'thread',
            conversationId: 'conversation',
            status: 'busy',
            runControl: { executionId: 'run', state: 'running' }
        })
        const execution = new XpertAgentExecution({ id: 'run', status: XpertAgentExecutionStatusEnum.RUNNING })
        const conversation = new ChatConversation({ id: 'conversation', threadId: 'thread' })
        const update = jest.fn(async (_where: unknown, changes: Partial<XpertAgentExecution>) =>
            Object.assign(execution, changes)
        )
        const repo = {
            createQueryBuilder: () => ({
                insert: () => ({ values: () => ({ orIgnore: () => ({ execute: async () => undefined }) }) })
            }),
            findOne: async () => thread
        }
        const manager = { getRepository: () => repo }
        const database = Object.assign(Object.create(DataSource.prototype) as DataSource, {
            getRepository: (entity: unknown) => ({
                findOneBy: async () =>
                    entity === ChatConversationThread
                        ? thread
                        : entity === XpertAgentExecution
                          ? execution
                          : conversation,
                update
            }),
            transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager)
        })
        const finish = jest.fn()
        const control = Object.assign(Object.create(ThreadRunControlService.prototype) as ThreadRunControlService, {
            finish
        })
        const service = new ChatExecutionAdmissionService(database, control)
        const failure = new Error('Model is unavailable')
        await expect(
            service.run(
                {
                    action: 'send',
                    conversationId: 'conversation',
                    message: { input: { input: 'text' } }
                },
                { execution: { id: 'run' } },
                async () => {
                    throw failure
                }
            )
        ).rejects.toBe(failure)
        expect(update).toHaveBeenCalledWith(
            { id: 'run', status: XpertAgentExecutionStatusEnum.RUNNING },
            { status: XpertAgentExecutionStatusEnum.ERROR, error: failure.message }
        )
        expect(finish).toHaveBeenCalledWith('thread', 'run', 'error', failure.message, undefined)
    })
})
