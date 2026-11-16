import { randomUUID } from 'node:crypto'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { finalize, of } from 'rxjs'
import { RequestContext, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { XpertAgentExecutionStatusEnum as RunStatus } from '@xpert-ai/contracts'
import { viewFixture } from '../chat-conversation/control-view/testing/view.test-fixture'
import { ChatExecutionAdmissionService } from '../chat-conversation/chat-execution-admission.service'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { FollowUpThreadBusy } from './follow-up-timer.constants'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { principal } from '../mcp-publication/testing/fixtures'
import { SchedulerAgentMiddleware } from '../xpert-task/plugins/scheduler.middleware'
import { MonitorTargets } from '../xpert-task/monitor-targets'
import { ScheduleDifferenceReports } from '../xpert-task/schedule-difference-reports'
import { AutoTask } from '../xpert-task/auto-task.entity'
import { reconcileDetachedAutoTasks, runOneOffAutoTask } from '../xpert-task/auto-task-once'
import { ScheduledTaskExecution } from '../xpert-task/scheduled-task-execution.entity'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertChatCommand } from '../xpert/commands/chat.command'
import { AGENT_EVENT_ENTITIES, AgentEventBinding } from './agent-event.entity'
import { AgentEventBindingService } from './agent-event-binding.service'
import { AgentEventStore } from './agent-event.store'
import { eventOriginForRun } from './agent-event-run-context'
import { AgentEventWakeService } from './agent-event-wake.service'
import { sourceContext } from './agent-event.runtime'
import { FollowUpTimerSource } from './follow-up-timer.source'
import { FollowUpTimer } from './follow-up-timer.entity'

const url = process.env.XPERT_PAUSE_TEST_DATABASE_URL
;(url ? describe : describe.skip)('durable one-shot follow-ups on independent PostgreSQL connections', () => {
    let f: Awaited<ReturnType<typeof viewFixture>>, replica: DataSource
    const userId = principal().userId
    beforeEach(async () => {
        f = await viewFixture(url, [...AGENT_EVENT_ENTITIES, FollowUpTimer, AutoTask, ScheduledTaskExecution])
        replica = await new DataSource(f.db.options).initialize()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(f.tenant.tenantId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(userId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(f.tenant.organizationId)
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await replica?.destroy()
        await f?.close()
    })

    it('sets, cancels, publishes after downtime and admits a single new run on the original thread', async () => {
        await f.control.finish(f.threadId, f.executionId, 'idle')
        await f.db.manager.update(ChatConversation, f.conversation.id, { createdById: userId })
        const context = {
            ...f.tenant,
            userId,
            agentKey: 'buyer',
            xpertId: f.conversation.xpertId,
            workspaceId: randomUUID(),
            threadId: f.threadId,
            conversationId: f.conversation.id
        } as IAgentMiddlewareContext
        const published: PublishedXpertAccessService = Object.create(PublishedXpertAccessService.prototype)
        const publishAt = new Date()
        published.getAccessiblePublishedXpert = jest
            .fn()
            .mockResolvedValue({ ...context, publishAt, agent: { key: 'leader' }, agents: [{ key: 'buyer' }] })
        published.getAccessiblePublishedXpertFamilyIds = jest.fn().mockResolvedValue([context.xpertId])
        const sources = [f.db, replica].map((db) => new FollowUpTimerSource(db, f.bus, published))
        const input = { purpose: 'Check the supplier reply', dueAt: new Date(Date.now() + 3600000).toISOString() }
        const schedulerFor = (db: DataSource, source: FollowUpTimerSource, scope = context) =>
            new SchedulerAgentMiddleware(
                Object.create(CommandBus.prototype),
                new ScheduleDifferenceReports(db.getRepository(ScheduledTaskExecution)),
                new MonitorTargets(db.getRepository(ChatConversation), f.bus),
                source
            ).createMiddleware({}, scope)
        const [
            {
                tools: [create, list, remove]
            },
            {
                tools: [replicaCreate]
            }
        ] = await Promise.all([schedulerFor(f.db, sources[0]), schedulerFor(replica, sources[1])])
        const mode = 'follow_up'
        const request = { mode, ...input }
        const call = { metadata: { tool_call_id: 'call-1' } }
        const [first, second] = await Promise.all([create.invoke(request, call), replicaCreate.invoke(request, call)])
        expect(JSON.parse(second)).toEqual(JSON.parse(first))
        const { taskId } = JSON.parse(first)
        expect(JSON.parse(await list.invoke({ mode }))).toEqual([{ mode, taskId, ...input, state: 'waiting' }])
        const cancel = { mode, taskId }
        const {
            tools: [, otherList, otherDelete]
        } = await schedulerFor(f.db, sources[0], { ...context, threadId: randomUUID() })
        expect(JSON.parse(await otherList.invoke({ mode }))).toEqual([])
        await expect(otherDelete.invoke(cancel)).rejects.toThrow('timer_not_active')
        const {
            tools: [, foreignList, foreignDelete]
        } = await schedulerFor(f.db, sources[0], { ...context, userId: randomUUID() })
        expect(JSON.parse(await foreignList.invoke({ mode }))).toEqual([])
        await expect(foreignDelete.invoke(cancel)).rejects.toThrow()
        f.permissions.contribute = false
        await expect(list.invoke({ mode })).rejects.toThrow()
        await expect(remove.invoke(cancel)).rejects.toThrow()
        f.permissions.contribute = true
        const {
            tools: [unscoped]
        } = await schedulerFor(f.db, sources[0], { ...context, threadId: undefined })
        await expect(unscoped.invoke(request, call)).rejects.toThrow()
        await expect(sources[0].set({ ...context, agentKey: 'leader' }, input, 'call-1')).rejects.toThrow()
        const binding = await f.db.manager.findOneByOrFail(AgentEventBinding, { sourceBindingRef: f.conversation.id })
        const ctx = sourceContext(binding, new AbortController().signal)
        const store = new AgentEventStore(f.db)
        const publisher = { publish: (event) => store.publish(binding, sources[0], event) }
        const bindings = new AgentEventBindingService(f.db.getRepository(AgentEventBinding))
        expect(await bindings.reserveDue()).toHaveLength(0)
        await sources[0].drain(ctx, publisher, 8)
        expect(await store.claim(binding)).toBeUndefined()
        expect(JSON.parse(await remove.invoke(cancel))).toEqual({ mode, taskId, state: 'cancelled' })
        expect(JSON.parse(await list.invoke({ mode }))).toEqual([])
        const next = JSON.parse(await create.invoke(request, { metadata: { tool_call_id: 'call-2' } }))
        await f.db.manager.update(FollowUpTimer, next.taskId, { dueAt: new Date(Date.now() - 5000) })
        expect(await bindings.reserveDue()).toHaveLength(1)
        await Promise.all(sources.map((s) => s.drain(ctx, publisher, 8)))
        let receipt = await store.claim(binding)
        expect(receipt?.event.sourceEventId).toBe(next.taskId)
        expect(
            (await sources[0].describe(ctx, receipt.event, null, { includeConversation: true })).conversation
        ).toEqual({ conversationId: f.conversation.id, threadId: f.threadId })
        const toolsByAgent = { leader: jest.fn(), buyer: jest.fn() }
        const model = jest.fn(async () => of('checked'))
        const completions: Promise<void>[] = []
        const workers = [f.db, replica].map((db) => {
            const admission = new ChatExecutionAdmissionService(db, f.control)
            const commands: CommandBus = Object.create(CommandBus.prototype)
            commands.execute = jest.fn().mockImplementation(async (cmd: XpertChatCommand) => {
                const stream = await admission.run(cmd.request, cmd.options, async () => {
                    expect(
                        eventOriginForRun(cmd.options, {
                            ...ctx,
                            conversationId: f.conversation.id,
                            threadId: f.threadId
                        })?.receiptId
                    ).toBe(receipt.receiptId)
                    toolsByAgent[cmd.options.agentKey === 'buyer' ? 'buyer' : 'leader']()
                    return model()
                })
                let finished: () => void
                completions.push(
                    new Promise<void>((resolve) => {
                        finished = resolve
                    })
                )
                return stream.pipe(finalize(() => finished()))
            })
            return new AgentEventWakeService(
                commands,
                f.bus,
                published,
                new AgentEventBindingService(db.getRepository(AgentEventBinding))
            )
        })
        const deliver = (i: number) =>
            sources[i].handle(ctx, receipt, {
                wake: (input) => workers[i].start(binding, receipt, input, ctx.signal)
            })
        await expect(
            workers[0].start(
                binding,
                receipt,
                {
                    conversationId: f.conversation.id,
                    agentKey: 'removed-agent',
                    prompt: 'check'
                },
                ctx.signal
            )
        ).rejects.toThrow('event_agent_changed')
        f.permissions.contribute = false
        await expect(deliver(0)).rejects.toThrow()
        expect(model).not.toHaveBeenCalled()
        f.permissions.contribute = true
        await f.db.manager.update(ChatConversationThread, { threadId: f.threadId }, { status: 'busy' })
        await expect(deliver(0)).rejects.toBeInstanceOf(FollowUpThreadBusy)
        expect(await store.complete(receipt, undefined, true)).toBe(true)
        const [deferred] = await f.db.query('SELECT state,error,attempt FROM agent_event_inbox WHERE id=$1', [
            receipt.receiptId
        ])
        expect(deferred).toEqual({ state: 'retry_wait', error: 'thread_busy', attempt: 0 })
        await f.db.manager.update(ChatConversationThread, { threadId: f.threadId }, { status: 'idle' })
        await f.db.query('UPDATE agent_event_inbox SET due=now() WHERE id=$1', [receipt.receiptId])
        const stale = receipt
        receipt = await store.claim(binding)
        await expect(
            workers[0].start(
                binding,
                stale,
                {
                    conversationId: f.conversation.id,
                    threadId: f.threadId,
                    prompt: 'stale worker'
                },
                ctx.signal
            )
        ).rejects.toThrow('event_claim_expired')
        expect(model).not.toHaveBeenCalled()
        const results = await Promise.all([deliver(0), deliver(1)])
        await Promise.all(completions)
        expect(results[1]).toEqual(results[0])
        await expect(
            workers[1].start(
                binding,
                receipt,
                {
                    conversationId: f.conversation.id,
                    agentKey: 'leader',
                    prompt: 'changed role'
                },
                ctx.signal
            )
        ).rejects.toThrow()
        expect(model).toHaveBeenCalledTimes(1)
        expect(toolsByAgent.buyer).toHaveBeenCalledTimes(1)
        expect(toolsByAgent.leader).not.toHaveBeenCalled()
        expect(await f.db.manager.findOneByOrFail(XpertAgentExecution, { id: receipt.receiptId })).toMatchObject({
            threadId: f.threadId,
            createdById: userId,
            agentKey: 'buyer'
        })
        await expect(remove.invoke({ mode, taskId: next.taskId })).rejects.toThrow('timer_not_active')
        expect(await store.complete(receipt, results[0])).toBe(true)
        expect(await store.claim(binding)).toBeUndefined()
    })

    it('recovers legacy AutoTask across reservation and admission crashes with one conversation and run', async () => {
        const repo = f.db.getRepository(AutoTask)
        const due = new Date(Date.now() - 2000)
        const task = await repo.save({
            ...f.tenant,
            createdById: userId,
            frequency: 'once',
            enabled: true,
            title: 'One shot',
            repo: 'demo',
            branch: 'test',
            prompt: 'Check delivery',
            schedule: 'once',
            runAt: due,
            nextRunAt: due
        })
        const attempt = (db: DataSource, start: Parameters<typeof runOneOffAutoTask>[2]) =>
            runOneOffAutoTask(db.getRepository(AutoTask), task, start)
        await expect(
            attempt(f.db, async () => {
                throw new Error('crash before admission')
            })
        ).rejects.toThrow('before admission')
        const occurrence = await f.db.manager.findOneByOrFail(ScheduledTaskExecution, { taskId: task.id })
        const starts = jest.fn(async (_task, conversationId: string, executionId: string) => {
            expect([conversationId, executionId]).toEqual([occurrence.conversationId, occurrence.executionId])
            await replica.manager.insert(XpertAgentExecution, {
                ...f.tenant,
                id: executionId,
                threadId: conversationId,
                status: RunStatus.RUNNING
            })
            throw new Error('crash after admission')
        })
        const workers = await Promise.allSettled([attempt(f.db, starts), attempt(replica, starts)])
        expect(workers.filter((r) => r.status === 'rejected')).toHaveLength(1)
        expect(starts).toHaveBeenCalledTimes(1)
        await replica.manager.update(XpertAgentExecution, occurrence.executionId, { status: RunStatus.SUCCESS })
        await Promise.all([attempt(f.db, starts), attempt(replica, starts)])
        expect(starts).toHaveBeenCalledTimes(1)
        expect(await repo.findOneByOrFail({ id: task.id })).toMatchObject({ enabled: false, nextRunAt: null })
        expect(await f.db.manager.findOneByOrFail(ScheduledTaskExecution, { taskId: task.id })).toMatchObject({
            status: 'succeeded',
            taskSource: 'auto_task'
        })
        await repo.update(task.id, { enabled: true, nextRunAt: new Date(Date.now() + 3600000) })
        await attempt(f.db, starts)
        expect(starts).toHaveBeenCalledTimes(1)
    })
    it.each(['edit', 'delete'])('reconciles a detached AutoTask after %s during its active run', async (action) => {
        const repo = f.db.getRepository(AutoTask)
        const nextRunAt = new Date(Date.now() - 1000)
        const task = await repo.save({
            ...f.tenant,
            createdById: userId,
            enabled: true,
            frequency: 'once',
            title: 'one shot',
            repo: 'demo',
            branch: 'test',
            prompt: 'check',
            schedule: 'once',
            runAt: nextRunAt,
            nextRunAt
        })
        await expect(
            runOneOffAutoTask(repo, task, async (_task, threadId, id) => {
                await replica.manager.insert(XpertAgentExecution, {
                    ...f.tenant,
                    id,
                    threadId,
                    status: RunStatus.RUNNING
                })
                throw new Error('worker exited after admission')
            })
        ).rejects.toThrow('after admission')
        const row = await f.db.manager.findOneByOrFail(ScheduledTaskExecution, { taskId: task.id })
        const newDeadline = new Date(Date.now() + 3600000)
        if (action === 'delete') await repo.delete(task.id)
        else await repo.update(task.id, { nextRunAt: newDeadline })
        await replica.manager.update(XpertAgentExecution, row.executionId, { status: RunStatus.SUCCESS })
        await Promise.all([f.db, replica].map((db) => reconcileDetachedAutoTasks(db.getRepository(AutoTask))))
        expect(await f.db.manager.findOneByOrFail(ScheduledTaskExecution, { id: row.id })).toMatchObject({
            status: 'succeeded',
            completedAt: expect.any(Date)
        })
        if (action === 'edit')
            expect(await repo.findOneByOrFail({ id: task.id })).toMatchObject({ enabled: true, nextRunAt: newDeadline })
        else expect(await repo.findOneBy({ id: task.id })).toBeNull()
    })
})
