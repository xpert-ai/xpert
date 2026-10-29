import { DataSource, EntityManager, FindOperator } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { of } from 'rxjs'
import { ChatExecutionAdmissionService } from './chat-execution-admission.service'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ThreadRunControlService } from './thread-run-control.service'
import { TChatRequest } from '@xpert-ai/contracts'

describe('resume admission identity', () => {
    afterEach(() => jest.restoreAllMocks())
    function fixture() {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        const scope = { tenantId: 'tenant', organizationId: 'org', createdById: 'user' }
        const conversation = new ChatConversation({
            ...scope,
            id: 'conversation',
            threadId: 'thread',
            xpertId: 'assistant'
        })
        const message = new ChatMessage({
            ...scope,
            id: 'message',
            conversationId: 'conversation',
            role: 'ai',
            executionId: 'run',
            createdInThreadId: 'thread'
        })
        const execution = new XpertAgentExecution({ ...scope, id: 'run', threadId: 'thread' })
        const thread = new ChatConversationThread({
            ...scope,
            threadId: 'thread',
            conversationId: 'conversation',
            status: 'interrupted',
            runControl: { executionId: 'run', state: 'input_wait' }
        })
        const insert = jest.fn(async () => undefined)
        const rows = new Map<unknown, object>([
            [ChatConversation, conversation],
            [ChatMessage, message],
            [XpertAgentExecution, execution],
            [ChatConversationThread, thread]
        ])
        const getRepository = (entity: unknown) => {
            const find = async (where: object) => {
                const row = rows.get(entity)
                return row &&
                    Object.entries(where).every(
                        ([key, value]) =>
                            value === undefined ||
                            (value instanceof FindOperator
                                ? Reflect.get(row, key) == null
                                : Reflect.get(row, key) === value)
                    )
                    ? row
                    : null
            }
            return {
                findOneBy: find,
                findOne: ({ where }: { where: object }) => find(where),
                createQueryBuilder: () => ({
                    insert: () => ({ values: () => ({ orIgnore: () => ({ execute: insert }) }) })
                })
            }
        }
        const manager = Object.assign(Object.create(EntityManager.prototype) as EntityManager, {
            getRepository,
            save: jest.fn()
        })
        const database = Object.assign(Object.create(DataSource.prototype) as DataSource, {
            getRepository,
            transaction: async (work: (manager: EntityManager) => Promise<unknown>) => work(manager)
        })
        const start = jest.fn(async () => undefined)
        const control = Object.assign(Object.create(ThreadRunControlService.prototype) as ThreadRunControlService, {
            start
        })
        const execute = jest.fn(async () => of('resumed'))
        const request: Extract<TChatRequest, { action: 'resume' }> = {
            action: 'resume',
            conversationId: 'conversation',
            target: { aiMessageId: 'message' },
            decision: { type: 'confirm' }
        }
        return {
            service: new ChatExecutionAdmissionService(database, control),
            conversation,
            message,
            execution,
            thread,
            start,
            execute,
            request
        }
    }
    it.each(['confirm', 'reject'] as const)(
        'resolves message-only %s without allocating a new execution',
        async (type) => {
            const f = fixture()
            f.request.decision = { type }
            await f.service.run(f.request, {}, f.execute)
            expect(f.execute).toHaveBeenCalledWith(
                'run',
                expect.objectContaining({ target: { aiMessageId: 'message', executionId: 'run' } })
            )
            expect(f.start).toHaveBeenCalledWith('thread', 'run', undefined, true)
            expect(f.thread.runControl.executionId).toBe('run')
        }
    )
    it('resolves a raw explicit execution target to its exact AI message', async () => {
        const f = fixture()
        f.request.target = { executionId: 'run' }
        await f.service.run(f.request, {}, f.execute)
        expect(f.execute).toHaveBeenCalledWith(
            'run',
            expect.objectContaining({ target: { executionId: 'run', aiMessageId: 'message' } })
        )
        expect(f.start).toHaveBeenCalledWith('thread', 'run', undefined, true)
    })
    it('retains a server-assigned execution for checkpoint-based pause recovery', async () => {
        const f = fixture()
        f.thread.runControl = { executionId: 'resumed-run', state: 'running' }
        await f.service.run(
            f.request,
            {
                execution: { id: 'resumed-run' },
                resumeCheckpoint: { threadId: 'thread', checkpointId: 'checkpoint', checkpointNs: '' }
            },
            f.execute
        )
        expect(f.execute).toHaveBeenCalledWith(
            'resumed-run',
            expect.objectContaining({ target: { executionId: 'run', aiMessageId: 'message' } })
        )
        expect(f.start).not.toHaveBeenCalled()
    })
    it('accepts an explicit execution target and a trusted preadmitted execution', async () => {
        const f = fixture()
        f.request.target = { executionId: 'run' }
        await f.service.run(f.request, { execution: { id: 'run' } }, f.execute)
        expect(f.execute).toHaveBeenCalledWith(
            'run',
            expect.objectContaining({ target: { aiMessageId: 'message', executionId: 'run' } })
        )
        expect(f.start).not.toHaveBeenCalled()
    })
    it.each(['tenantId', 'organizationId', 'createdById'] as const)(
        'rejects cross-scope conversation %s before executing',
        async (key) => {
            const f = fixture()
            f.conversation[key] = 'other'
            await expect(f.service.run(f.request, {}, f.execute)).rejects.toThrow()
            expect(f.execute).not.toHaveBeenCalled()
            expect(f.start).not.toHaveBeenCalled()
        }
    )
    it.each(['tenantId', 'organizationId', 'conversationId', 'role', 'createdInThreadId'] as const)(
        'rejects a mismatched message %s',
        async (key) => {
            const f = fixture()
            Object.assign(f.message, { [key]: 'other' })
            await expect(f.service.run(f.request, {}, f.execute)).rejects.toThrow()
            expect(f.execute).not.toHaveBeenCalled()
            expect(f.start).not.toHaveBeenCalled()
        }
    )
    it.each(['tenantId', 'organizationId', 'createdById', 'threadId'] as const)(
        'rejects a mismatched execution %s',
        async (key) => {
            const f = fixture()
            f.execution[key] = 'other'
            await expect(f.service.run(f.request, {}, f.execute)).rejects.toThrow()
            expect(f.execute).not.toHaveBeenCalled()
        }
    )
    it('rejects inconsistent message/execution targets', async () => {
        const f = fixture()
        f.request.target.executionId = 'other'
        await expect(f.service.run(f.request, {}, f.execute)).rejects.toThrow()
        await expect(
            f.service.run(
                { ...f.request, target: { aiMessageId: 'message' } },
                { execution: { id: 'other' } },
                f.execute
            )
        ).rejects.toThrow()
        expect(f.execute).not.toHaveBeenCalled()
    })
    it('keeps concurrent new tasks blocked', async () => {
        const f = fixture()
        await expect(
            f.service.run(
                { action: 'send', conversationId: 'conversation', message: { input: { input: 'new' } } },
                {},
                f.execute
            )
        ).rejects.toThrow()
        expect(f.execute).not.toHaveBeenCalled()
    })
})
