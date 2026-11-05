// A replacement owner must converge using durable evidence, with no callback from the vanished graph.
import { randomUUID } from 'node:crypto'
import { lastValueFrom, of } from 'rxjs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ExecutionTaskControl } from '@xpert-ai/server-core'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { viewFixture } from './control-view/testing/view.test-fixture'
import { ThreadRunControlService } from './thread-run-control.service'
import { ChatConversationThread } from './conversation-thread.entity'
import { ChatConversation } from './conversation.entity'
import { ChatExecutionAdmissionService } from './chat-execution-admission.service'
import { RUN_LEASE_KEY, readRunLease } from './thread-run-lease'
import { ExecutionControl } from '../execution-control/execution-control.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { AgentInvocationWaitEntity } from '../agent-invocation/invocation.entity'
import { seedExecutionControlScope } from '../execution-control/testing/scope.fixture'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip

integration('orphan finalization / PostgreSQL (#1337)', () => {
    let f: Awaited<ReturnType<typeof viewFixture>>
    let replacement: ThreadRunControlService
    const content = 'Saved work and artifact references must survive recovery.'

    beforeEach(async () => {
        f = await viewFixture(url)
        replacement = new ThreadRunControlService(f.db.getRepository(ChatConversationThread), f.db, f.execution)
        await f.db.manager.insert(ChatMessage, {
            ...f.tenant,
            executionId: f.executionId,
            status: 'thinking',
            content
        })
        await f.db.manager.insert(AgentInvocationWaitEntity, {
            ...f.tenant,
            threadId: f.threadId,
            state: 'ready',
            leaseToken: randomUUID(),
            leaseUntil: new Date()
        })
    })

    afterEach(async () => {
        jest.restoreAllMocks()
        replacement?.onModuleDestroy()
        await f?.close()
    })

    async function expire() {
        await f.db.manager.update(
            ChatConversationThread,
            { threadId: f.threadId },
            {
                metadata: {
                    [RUN_LEASE_KEY]: {
                        owner: 'vanished-process',
                        executionId: f.executionId,
                        expiresAt: new Date(0).toISOString()
                    }
                }
            }
        )
    }

    async function expectWaiting() {
        const thread = await f.db.manager.findOneByOrFail(ChatConversationThread, { threadId: f.threadId })
        expect(thread).toMatchObject({ status: 'busy', runControl: { state: 'terminating' } })
        expect((await f.db.manager.findOneByOrFail(ExecutionControl, { executionId: f.executionId })).graphEnded).toBe(
            false
        )
        expect((await f.tasks.execution(f.executionId)).state).toBe('running')
        expect((await f.makeView().read(f.threadId)).controlView).toMatchObject({
            state: 'stopping',
            actions: { canSend: false }
        })
    }

    async function expectFinalized() {
        const thread = await f.db.manager.findOneByOrFail(ChatConversationThread, { threadId: f.threadId })
        expect(thread).toMatchObject({ status: 'error', runControl: null, operation: null })
        expect(thread.runtimeContinuationBlockedAt).toBeInstanceOf(Date)
        expect(readRunLease(thread.metadata)).toBeNull()
        expect(await f.db.manager.findOneByOrFail(ExecutionControl, { executionId: f.executionId })).toMatchObject({
            desired: 'terminated',
            graphEnded: true
        })
        expect(await f.tasks.execution(f.executionId)).toMatchObject({ desired: 'terminated', state: 'completed' })
        expect(await f.db.manager.findOneByOrFail(XpertAgentExecution, { id: f.executionId })).toMatchObject({
            status: XpertAgentExecutionStatusEnum.INTERRUPTED,
            completedAt: expect.any(Date)
        })
        expect(await f.db.manager.findOneByOrFail(ChatMessage, { executionId: f.executionId })).toMatchObject({
            status: 'aborted',
            content
        })
        expect(await f.db.manager.findOneByOrFail(AgentInvocationWaitEntity, { threadId: f.threadId })).toMatchObject({
            state: 'stale',
            leaseToken: null,
            leaseUntil: null,
            lastError: 'parent_owner_lost'
        })
        expect(await f.db.manager.findOneByOrFail(ChatConversation, { id: f.conversation.id })).toMatchObject({
            status: 'error',
            operation: null
        })
        expect((await f.makeView().read(f.threadId)).controlView).toMatchObject({
            state: 'stopped',
            actions: { canSend: true, canResume: false, canRetry: false }
        })
    }

    it.each(['running', 'terminating', 'pausing'] as const)(
        'finalizes an expired %s run with settled work without the original owner',
        async (state) => {
            for (let i = 0; i < 8; i++) {
                await f.execution.admit(f.executionId, `tool-${i}`)
                await f.execution.settle(f.executionId, `tool-${i}`)
            }
            if (state === 'terminating') await f.control.cancel(f.threadId, [f.executionId])
            if (state === 'pausing') await f.control.requestPause(f.threadId, f.executionId)
            await expire()
            f.control.onModuleDestroy()
            await replacement.maintainLeases()
            await expectFinalized()
            const ended = await f.db.manager.findOneByOrFail(XpertAgentExecution, { id: f.executionId })
            await replacement.maintainLeases()
            expect(await replacement.recoverExpiredRun(f.threadId)).toBe(false)
            expect(
                (await f.db.manager.findOneByOrFail(XpertAgentExecution, { id: f.executionId })).completedAt
            ).toEqual(ended.completedAt)
            expect(
                (await f.db.manager.findOneByOrFail(ExecutionControl, { executionId: f.executionId })).work
            ).toHaveLength(8)
        }
    )

    it('waits for a real tool receipt and then recovers an already-terminating run', async () => {
        await f.execution.admit(f.executionId, 'unfinished-tool')
        await expire()
        await replacement.maintainLeases()
        await expectWaiting()
        await replacement.maintainLeases()
        await expectWaiting()
        await f.execution.settle(f.executionId, 'unfinished-tool')
        await replacement.maintainLeases()
        await expectFinalized()
    })

    it.each(['queued', 'running', 'paused', 'unknown'] as const)('preserves a %s attached child', async (state) => {
        const parent = await f.tasks.execution(f.executionId)
        const child = await f.tasks.register({
            ...f.tenant,
            kind: 'mcp-operation',
            resourceId: randomUUID(),
            parent: { version: 2, targetId: parent.id }
        })
        await f.tasks.receipt(child.id, state)
        await expire()
        await replacement.maintainLeases()
        await expectWaiting()
        expect((await f.tasks.read(child.id)).state).toBe(state)
        await f.tasks.receipt(child.id, 'completed')
        await replacement.maintainLeases()
        await expectFinalized()
    })

    it('requires attached child graph evidence even after its task receipt is completed', async () => {
        const childId = randomUUID()
        await f.execution.attach(childId, f.executionId, 'attached')
        const child = await f.tasks.execution(childId)
        await f.tasks.receipt(child.id, 'completed')
        await expire()
        await replacement.maintainLeases()
        await expectWaiting()
        expect(await f.control.finish(f.threadId, f.executionId, 'idle')).toBe('busy')
        await expectWaiting()
        await f.db.transaction((manager) => f.execution.end(manager, childId))
        await replacement.maintainLeases()
        await expectFinalized()
    })

    it.each(['missing-task', 'missing-control'] as const)(
        'retains uncertainty for a child with %s',
        async (missing) => {
            const childId = randomUUID()
            await f.execution.attach(childId, f.executionId, 'attached')
            const child = await f.tasks.execution(childId)
            await f.tasks.receipt(child.id, 'completed')
            await f.db.transaction((manager) => f.execution.end(manager, childId))
            if (missing === 'missing-task') await f.db.manager.delete(ExecutionTaskControl, { id: child.id })
            else await f.db.manager.delete(ExecutionControl, { executionId: childId })
            await expire()
            await replacement.maintainLeases()
            await expectWaiting()
        }
    )

    it('leaves independent and shared work running outside the orphan subtree', async () => {
        const ids = [randomUUID(), randomUUID()]
        await f.execution.attach(ids[0], f.executionId, 'detached')
        await f.execution.attach(ids[1], f.executionId, 'shared')
        await expire()
        await replacement.maintainLeases()
        await expectFinalized()
        for (const id of ids) {
            expect(await f.tasks.desired((await f.tasks.execution(id)).id)).toBe('running')
            expect((await f.db.manager.findOneByOrFail(ExecutionControl, { executionId: id })).graphEnded).toBe(false)
        }
    })

    it('serializes competing reconcilers and fences a late former owner after a new run starts', async () => {
        await expire()
        await Promise.all([
            replacement.recoverExpiredRun(f.threadId),
            f.control.finish(f.threadId, f.executionId, 'idle')
        ])
        await expectFinalized()
        const next = randomUUID()
        await replacement.start(f.threadId, next)
        await f.control.finish(f.threadId, f.executionId, 'idle')
        await expect(f.execution.admit(f.executionId, 'late-tool')).rejects.toThrow()
        await expect(f.execution.attach(randomUUID(), f.executionId, 'attached')).rejects.toThrow()
        await expect(f.control.start(f.threadId, f.executionId)).rejects.toThrow()
        expect(await f.db.manager.findOneByOrFail(ChatConversationThread, { threadId: f.threadId })).toMatchObject({
            status: 'busy',
            runControl: { executionId: next, state: 'running' }
        })
        expect(await replacement.recoverExpiredRun(f.threadId)).toBe(false)
    })

    it('preserves a live owner and confirmed pause', async () => {
        expect(await replacement.recoverExpiredRun(f.threadId)).toBe(false)
        await f.pause()
        await replacement.maintainLeases()
        expect((await f.db.manager.findOneByOrFail(ChatConversationThread, { threadId: f.threadId })).status).toBe(
            'paused'
        )
    })

    it.each(['tenant', 'organization', 'thread', 'attempt', 'lease'] as const)(
        'rejects mismatched %s identity',
        async (field) => {
            await expire()
            const parent = await f.tasks.execution(f.executionId)
            if (field === 'tenant' || field === 'organization') {
                const foreign = { tenantId: randomUUID(), organizationId: randomUUID() }
                await seedExecutionControlScope(f.db, foreign)
                await f.db.manager.update(
                    ExecutionControl,
                    { executionId: f.executionId },
                    field === 'tenant' ? { tenantId: foreign.tenantId } : { organizationId: foreign.organizationId }
                )
            } else if (field === 'thread') {
                await f.db.manager.update(ExecutionTaskControl, { id: parent.id }, { threadId: randomUUID() })
            } else if (field === 'attempt') {
                await f.db.manager.update(ExecutionTaskControl, { id: parent.id }, { currentExecutionId: randomUUID() })
            } else {
                await f.db.manager.update(
                    ChatConversationThread,
                    { threadId: f.threadId },
                    {
                        runControl: { state: 'running', executionId: randomUUID() }
                    }
                )
            }
            if (field === 'lease') expect(await replacement.recoverExpiredRun(f.threadId)).toBe(false)
            else await expect(replacement.recoverExpiredRun(f.threadId)).rejects.toThrow()
            expect((await f.tasks.read(parent.id)).desired).toBe('running')
            expect(
                (await f.db.manager.findOneByOrFail(ExecutionControl, { executionId: f.executionId })).graphEnded
            ).toBe(false)
        }
    )

    it('rolls back all terminal writes if message persistence fails, then succeeds on retry', async () => {
        await expire()
        await f.db.query(`CREATE FUNCTION reject_message_update() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'injected message persistence failure'; END $$`)
        await f.db.query(`CREATE TRIGGER reject_message_update BEFORE UPDATE ON chat_message
            FOR EACH ROW EXECUTE FUNCTION reject_message_update()`)
        await expect(replacement.recoverExpiredRun(f.threadId)).rejects.toThrow('injected message persistence failure')
        expect((await f.tasks.execution(f.executionId)).state).toBe('running')
        expect((await f.db.manager.findOneByOrFail(ExecutionControl, { executionId: f.executionId })).graphEnded).toBe(
            false
        )
        expect((await f.db.manager.findOneByOrFail(XpertAgentExecution, { id: f.executionId })).status).toBe('running')
        await f.db.query('DROP TRIGGER reject_message_update ON chat_message')
        await replacement.maintainLeases()
        await expectFinalized()
    })

    it('permits the next user message through real admission after publishing a sendable control view', async () => {
        const userId = randomUUID()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(userId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(f.tenant.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(f.tenant.organizationId)
        await f.db.manager.update(ChatConversation, { id: f.conversation.id }, { createdById: userId })
        const admission = new ChatExecutionAdmissionService(f.db, replacement)
        const request = {
            action: 'send' as const,
            conversationId: f.conversation.id,
            message: { input: { input: 'continue' } }
        }
        const execute = jest.fn(async () => of('next reply'))
        await expect(admission.run(request, {}, execute)).rejects.toThrow('running or paused')
        expect(execute).not.toHaveBeenCalled()
        await expire()
        await replacement.maintainLeases()
        await expectFinalized()
        expect(await lastValueFrom(await admission.run(request, {}, execute))).toBe('next reply')
        expect(execute).toHaveBeenCalledTimes(1)
    })
})
