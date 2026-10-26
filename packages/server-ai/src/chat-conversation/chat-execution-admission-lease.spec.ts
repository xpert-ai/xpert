import { DataSource } from 'typeorm'
import { lastValueFrom, of } from 'rxjs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ThreadRunControlService } from './thread-run-control.service'
import { ChatExecutionAdmissionService } from './chat-execution-admission.service'

describe('compatibility run ownership before display capture', () => {
    afterEach(() => jest.restoreAllMocks())
    function fixture(existing = false) {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        const conversation = new ChatConversation({ id: 'conversation', threadId: 'thread' })
        const thread = new ChatConversationThread({
            threadId: 'thread',
            conversationId: 'conversation',
            status: existing ? 'busy' : 'idle',
            runControl: existing ? { executionId: 'run', state: 'running' } : null
        })
        const execution = new XpertAgentExecution({ id: 'run' })
        const update = jest.fn(async (_where, values) => Object.assign(execution, values))
        const repository = {
            createQueryBuilder: () => ({
                insert: () => ({ values: () => ({ orIgnore: () => ({ execute: async () => undefined }) }) })
            }),
            findOne: async () => thread
        }
        const manager = { getRepository: () => repository, save: jest.fn(async () => thread) }
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
        const start = jest.fn(async () => undefined),
            finish = jest.fn(async () => undefined)
        const control = Object.assign(Object.create(ThreadRunControlService.prototype) as ThreadRunControlService, {
            start,
            finish
        })
        return { service: new ChatExecutionAdmissionService(database, control), start, finish, update }
    }
    const request = { action: 'send' as const, conversationId: 'conversation', message: { input: { input: 'hello' } } }

    it.each([false, true])('starts only newly admitted runs before executing (existing: %s)', async (existing) => {
        const f = fixture(existing)
        const context = { env: { sandboxEnvironmentId: 'environment' } }
        const execute = jest.fn(async (id) => {
            expect(id).toBe('run')
            expect(f.start).toHaveBeenCalledTimes(existing ? 0 : 1)
            return of('output')
        })
        const stream = await f.service.run(request, { execution: { id: 'run' }, context }, execute)
        expect(await lastValueFrom(stream)).toBe('output')
        if (!existing) expect(f.start).toHaveBeenCalledWith('thread', 'run', context)
        expect(execute).toHaveBeenCalledTimes(1)
    })
    it('does not execute a graph when ownership could not be established', async () => {
        const f = fixture()
        const error = new Error('Ownership unavailable')
        f.start.mockRejectedValue(error)
        const execute = jest.fn(async () => of('must not run'))
        await expect(f.service.run(request, { execution: { id: 'run' } }, execute)).rejects.toBe(error)
        expect(execute).not.toHaveBeenCalled()
        expect(f.update).toHaveBeenCalledWith(expect.anything(), { status: 'error', error: error.message })
        expect(f.finish).toHaveBeenCalled()
    })
})
