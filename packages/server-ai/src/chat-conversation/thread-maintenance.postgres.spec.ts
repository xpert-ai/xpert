import { randomUUID } from 'node:crypto'
import { XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { viewFixture } from './control-view/testing/view.test-fixture'
import { ThreadRunControlService } from './thread-run-control.service'
import { ChatConversationThread } from './conversation-thread.entity'
import { RUN_LEASE_KEY } from './thread-run-lease'
import { ExecutionControl } from '../execution-control/execution-control.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
const integration = url ? describe : describe.skip
jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))
jest.setTimeout(30_000)

integration('bounded thread maintenance and terminal tool evidence / PostgreSQL (#1398)', () => {
    let f: Awaited<ReturnType<typeof viewFixture>>, service: ThreadRunControlService
    const replacement = () => new ThreadRunControlService(f.db.getRepository(ChatConversationThread), f.db, f.execution)
    beforeEach(async () => {
        f = await viewFixture(url)
        service = replacement()
        await f.db.manager.update(
            ChatConversationThread,
            { threadId: f.threadId },
            { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }
        )
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        service?.onModuleDestroy()
        await f?.close()
    })
    async function pending(count: number, state: 'settling' | 'terminating', start = 1) {
        const rows: Array<{ id: string; threadId: string; executionId: string; childId: string }> = []
        for (let n = start; n < start + count; n++) {
            const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
                threadId = randomUUID(),
                executionId = randomUUID()
            const task = await f.tasks.register({
                ...f.tenant,
                kind: 'execution',
                resourceId: executionId,
                executionId,
                threadId
            })
            await f.tasks.receipt(task.id, 'running')
            const child = await f.tasks.register({
                ...f.tenant,
                kind: 'handoff',
                resourceId: randomUUID(),
                parent: { version: 2, targetId: task.id }
            })
            await f.db.manager.insert(ChatConversationThread, {
                ...f.tenant,
                id,
                threadId,
                conversationId: f.conversation.id,
                status: 'busy',
                runControl: {
                    executionId,
                    state,
                    ...(state === 'settling' ? { pendingFinish: { status: 'idle' } } : {})
                },
                metadata: { [RUN_LEASE_KEY]: { owner: 'former', executionId, expiresAt: new Date(0).toISOString() } }
            })
            await f.db.manager.insert(ExecutionControl, {
                ...f.tenant,
                executionId,
                threadId,
                rootExecutionId: executionId,
                ancestors: [executionId],
                ownership: { policy: 'attached', rootExecutionId: executionId },
                desired: 'running',
                graphEnded: state === 'settling',
                work: []
            })
            rows.push({ id, threadId, executionId, childId: child.id })
        }
        return rows
    }
    async function cancel(expired: boolean) {
        await f.db.transaction((manager) => f.execution.end(manager, f.executionId))
        await f.control.cancel(f.threadId, [f.executionId])
        await f.db.manager.update(
            ChatConversationThread,
            { threadId: f.threadId },
            {
                metadata: {
                    [RUN_LEASE_KEY]: {
                        owner: 'former',
                        executionId: f.executionId,
                        expiresAt: expired ? new Date(0).toISOString() : '2099-01-01T00:00:00.000Z'
                    }
                }
            }
        )
    }
    async function status() {
        return (await f.db.manager.findOneByOrFail(ChatConversationThread, { threadId: f.threadId })).status
    }

    it('reaches the 89th stopping candidate while 88 earlier families remain unsettled', async () => {
        const rows = await pending(88, 'settling')
        await cancel(false)
        const drained = jest.spyOn(f.execution, 'drainedExecution')
        await service.maintainLeases()
        expect(drained).toHaveBeenCalledTimes(50)
        expect(await status()).toBe('busy')
        await service.maintainLeases()
        expect(drained).toHaveBeenCalledTimes(89)
        expect(await status()).toBe('interrupted')
        for (const row of rows) expect((await f.tasks.read(row.childId)).state).toBe('queued')
    })

    it('rotates expired owners independently across replicas and keeps uncertain children pending', async () => {
        const rows = await pending(88, 'terminating')
        await cancel(true)
        const other = replacement()
        try {
            await Promise.all([service.maintainLeases(), other.maintainLeases()])
            expect(await status()).toBe('busy')
            await Promise.all([service.maintainLeases(), other.maintainLeases()])
            expect(await status()).toBe('error')
            expect((await f.tasks.execution(f.executionId)).state).toBe('completed')
            for (const row of rows) expect((await f.tasks.read(row.childId)).state).toBe('queued')
        } finally {
            other.onModuleDestroy()
        }
    })

    it('isolates candidate failures so later candidates and the expired scan still run', async () => {
        const [bad] = await pending(1, 'terminating')
        await cancel(true)
        const originalDrain = f.execution.drainedExecution.bind(f.execution)
        jest.spyOn(f.execution, 'drainedExecution').mockImplementation((manager, executionId) => {
            if (executionId === bad.executionId) throw new Error('private provider response')
            return originalDrain(manager, executionId)
        })
        const recover = service.recoverExpiredRun.bind(service)
        const visited: string[] = []
        jest.spyOn(service, 'recoverExpiredRun').mockImplementation(async (threadId) => {
            visited.push(threadId)
            if (threadId === bad.threadId) throw new Error('private recovery response')
            return recover(threadId)
        })
        await service.maintainLeases()
        expect(visited).toContain(bad.threadId)
        expect(visited).toContain(f.threadId)
        expect(await status()).toBe('error')
    })

    it('survives candidate deletion, eligibility changes behind the cursor and restart without offset skips', async () => {
        const rows = await pending(55, 'settling')
        await service.maintainLeases()
        await f.db.manager.delete(ChatConversationThread, { id: rows[49].id })
        const [inserted] = await pending(1, 'settling', 100)
        await f.tasks.receipt(inserted.childId, 'completed')
        // An earlier family becomes eligible after this replica has already passed it.
        await f.tasks.receipt(rows[0].childId, 'completed')
        await cancel(false)
        await service.maintainLeases()
        expect(await status()).toBe('interrupted')
        expect((await f.db.manager.findOneByOrFail(ChatConversationThread, { id: inserted.id })).status).toBe('idle')
        await service.maintainLeases()
        expect((await f.db.manager.findOneByOrFail(ChatConversationThread, { id: rows[0].id })).status).toBe('idle')
        service.onModuleDestroy()
        service = replacement()
        await service.maintainLeases()
        await service.maintainLeases()
        expect(await status()).toBe('interrupted')
        expect((await f.tasks.read(rows[1].childId)).state).toBe('queued')
    })

    it('projects a late tool exit after cancellation even when the message already says success', async () => {
        await f.execution.admit(f.executionId, 'tool-run')
        const component = {
            id: 'tool-call',
            type: 'component',
            executionId: f.executionId,
            runId: 'tool-run',
            data: {
                category: 'Tool',
                status: 'running',
                created_date: '2026-11-13T08:00:00.000Z',
                output: 'saved artifact'
            }
        }
        await f.db.manager.save(
            Object.assign(new ChatMessage(), {
                ...f.tenant,
                executionId: f.executionId,
                status: XpertAgentExecutionStatusEnum.SUCCESS,
                content: [component]
            })
        )
        const priorCompletion = new Date('2026-11-13T08:00:10.000Z')
        await f.db.manager.update(
            XpertAgentExecution,
            { id: f.executionId },
            { status: XpertAgentExecutionStatusEnum.INTERRUPTED, completedAt: priorCompletion }
        )
        await cancel(true)
        await service.maintainLeases()
        expect(await status()).toBe('busy')
        expect((await f.db.manager.findOneByOrFail(ChatMessage, { executionId: f.executionId })).content).toEqual([
            component
        ])
        await f.execution.settle(f.executionId, 'tool-run')
        const record = await f.db.manager.findOneByOrFail(ExecutionControl, { executionId: f.executionId })
        const endedAt = record.work[0].settledAt
        expect(endedAt).toEqual(expect.any(String))
        await service.maintainLeases()
        expect(await status()).toBe('error')
        const message = await f.db.manager.findOneByOrFail(ChatMessage, { executionId: f.executionId })
        expect(message.status).toBe('success')
        expect(message.content).toEqual([
            expect.objectContaining({
                data: expect.objectContaining({ status: 'fail', end_date: endedAt, output: 'saved artifact' })
            })
        ])
        expect((await f.db.manager.findOneByOrFail(XpertAgentExecution, { id: f.executionId })).completedAt).toEqual(
            priorCompletion
        )
        const next = replacement()
        await next.maintainLeases()
        next.onModuleDestroy()
        expect((await f.db.manager.findOneByOrFail(ChatMessage, { id: message.id })).content).toEqual(message.content)
        await f.execution.settle(f.executionId, 'tool-run')
        expect(
            (await f.db.manager.findOneByOrFail(ExecutionControl, { executionId: f.executionId })).work[0].settledAt
        ).toBe(endedAt)
    })

    it('projects live cancellation only within the receipt tenant and organization', async () => {
        await f.execution.admit(f.executionId, 'tool-run')
        await f.execution.settle(f.executionId, 'tool-run')
        const content = [
            {
                id: 'tool-call',
                type: 'component',
                executionId: f.executionId,
                runId: 'tool-run',
                data: { category: 'Tool', status: 'success', output: 'completed output' }
            }
        ]
        const scopes = [
            f.tenant,
            { ...f.tenant, tenantId: randomUUID() },
            { ...f.tenant, organizationId: randomUUID() }
        ]
        const messages = await f.db.manager.save(
            scopes.map((scope) =>
                Object.assign(new ChatMessage(), {
                    ...scope,
                    executionId: f.executionId,
                    status: XpertAgentExecutionStatusEnum.SUCCESS,
                    content
                })
            )
        )
        await cancel(false)
        await service.maintainLeases()
        expect(await status()).toBe('interrupted')
        const receipt = await f.db.manager.findOneByOrFail(ExecutionControl, { executionId: f.executionId })
        expect((await f.db.manager.findOneByOrFail(ChatMessage, { id: messages[0].id })).content).toEqual([
            { ...content[0], data: { ...content[0].data, end_date: receipt.work[0].settledAt } }
        ])
        for (const message of messages.slice(1))
            expect((await f.db.manager.findOneByOrFail(ChatMessage, { id: message.id })).content).toEqual(content)
    })

    it('does not invent time for a historical receipt or touch a new run from a late former owner', async () => {
        await f.execution.admit(f.executionId, 'legacy-tool')
        const root = await f.db.manager.findOneByOrFail(ExecutionControl, { executionId: f.executionId })
        root.work[0].settled = true
        await f.db.manager.save(root)
        await f.execution.settle(f.executionId, 'legacy-tool')
        expect(
            (await f.db.manager.findOneByOrFail(ExecutionControl, { executionId: f.executionId })).work[0].settledAt
        ).toBeUndefined()
        await f.db.manager.save(
            Object.assign(new ChatMessage(), {
                ...f.tenant,
                executionId: f.executionId,
                status: XpertAgentExecutionStatusEnum.SUCCESS,
                content: [
                    {
                        id: 'legacy',
                        type: 'component',
                        executionId: f.executionId,
                        runId: 'legacy-tool',
                        data: { category: 'Tool', status: 'running' }
                    }
                ]
            })
        )
        await cancel(true)
        await service.maintainLeases()
        const message = await f.db.manager.findOneByOrFail(ChatMessage, { executionId: f.executionId })
        expect(message.content).toEqual([
            expect.objectContaining({ data: expect.objectContaining({ status: 'fail' }) })
        ])
        expect(JSON.stringify(message.content)).not.toContain('end_date')
        const nextId = randomUUID()
        await service.start(f.threadId, nextId)
        await f.control.finish(f.threadId, f.executionId, 'idle')
        expect(
            (await f.db.manager.findOneByOrFail(ChatConversationThread, { threadId: f.threadId })).runControl
                .executionId
        ).toBe(nextId)
        expect((await f.db.manager.findOneByOrFail(ChatMessage, { id: message.id })).content).toEqual(message.content)
    })
})
