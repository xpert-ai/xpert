import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod/v3'
import { TaskControlRunner } from '@xpert-ai/server-core'
import { ExecutionControl } from '../../../execution-control/execution-control.entity'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { controlLedger } from './testing/control-evidence.fixture'
import { DynamicTool } from '@langchain/core/tools'
import { managedPipelineFixture } from './testing/pipeline-managed.fixture'
import { ProjectPipelineOperationEntity, ProjectPipelineRunEntity } from '../persistence/pipeline.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { AgentRuntimeDelivery, AgentRuntimeInbox } from '../../../handoff/runtime-messaging/runtime-message.entity'
import { readRuntimeResultSettlement } from '../../../handoff/runtime-messaging/runtime-result-settlement'

const integration = process.env.XPERT_PIPELINE_TEST_DATABASE_URL ? describe : describe.skip
integration('phase 3.1 execution completion evidence', () => {
    const f = managedPipelineFixture()

    async function completedParent(executionId: string = randomUUID()) {
        const ledger = await controlLedger(f.db),
            invocationId = randomUUID()
        const parent = await ledger.seed(executionId, f.context.actor)
        const child = await ledger.tasks.register({
            ...f.context.actor,
            kind: 'invocation',
            resourceId: invocationId,
            parent: { version: 2, targetId: parent.id }
        })
        await ledger.tasks.receipt(child.id, 'completed')
        await f.db.transaction((manager) => ledger.controls.end(manager, executionId))
        await ledger.tasks.receipt(parent.id, 'completed')
        const delivery = await f.db.getRepository(AgentRuntimeDelivery).save({
            ...f.context.actor,
            ownerId: f.context.actor.userId,
            invocationId,
            messageId: randomUUID(),
            state: 'pending',
            event: { version: 1, invocationId, revision: 1, kind: 'result', status: 'succeeded' }
        })
        return { ledger, parent, delivery, executionId }
    }

    it('settles an already consumed result even before transport acknowledges it', async () => {
        const { ledger, delivery, executionId } = await completedParent()
        await f.db.getRepository(AgentRuntimeInbox).save({
            ...f.context.actor,
            ownerId: f.context.actor.userId,
            invocationId: delivery.invocationId,
            messageId: delivery.messageId,
            consumptionKey: randomUUID(),
            state: 'processed',
            event: delivery.event
        })
        expect(await ledger.evidence.read(executionId, f.context.actor)).toMatchObject({ state: 'settled' })
        expect((await f.db.getRepository(AgentRuntimeDelivery).findOneByOrFail({ id: delivery.id })).state).toBe(
            'pending'
        )
    })

    it('shares consumed result state across delivery revisions of the same invocation', async () => {
        const { ledger, delivery, executionId } = await completedParent()
        await f.db.getRepository(AgentRuntimeInbox).save({
            ...f.context.actor,
            ownerId: f.context.actor.userId,
            invocationId: delivery.invocationId,
            messageId: randomUUID(),
            consumptionKey: randomUUID(),
            state: 'processed',
            event: { ...delivery.event, revision: 2 }
        })
        expect(await ledger.evidence.read(executionId, f.context.actor)).toMatchObject({ state: 'settled' })
    })

    it.each(['blocked', 'failed'] as const)(
        'keeps %s transport visible until repaired or explicitly stopped',
        async (state) => {
            const { ledger, parent, delivery, executionId } = await completedParent()
            await f.db.getRepository(AgentRuntimeDelivery).update(delivery.id, { state })
            expect(await ledger.evidence.read(executionId, f.context.actor)).toMatchObject({
                source: 'platform',
                state: 'unknown',
                executionId,
                reason: `result_delivery_${state}`
            })
            await ledger.tasks.change(parent.id, 'terminated')
            expect(await ledger.evidence.read(executionId, f.context.actor)).toMatchObject({
                state: 'settled',
                desired: 'terminated'
            })
        }
    )

    it.each(['blocked', 'failed'] as const)(
        'does not advance a Pipeline when result consumption is %s',
        async (state) => {
            await f.launchAssistant()
            const operation = (await f.operations())[0]
            await f.request(() => f.runner.run(f.context, operation.id))
            const { ledger, parent, delivery, executionId } = await completedParent(operation.id)
            const next = randomUUID()
            await f.db.transaction((manager) => ledger.tasks.bind(executionId, next, manager))
            await f.db.transaction((manager) =>
                ledger.controls.root(manager, { ...f.context.actor, threadId: parent.threadId }, next)
            )
            await f.db.transaction((manager) => ledger.controls.end(manager, next))
            await ledger.tasks.receipt(parent.id, 'completed')
            await f.db.getRepository(AgentRuntimeDelivery).update(delivery.id, { state: 'received' })
            const inbox = await f.db.getRepository(AgentRuntimeInbox).save({
                ...f.context.actor,
                ownerId: f.context.actor.userId,
                invocationId: delivery.invocationId,
                messageId: delivery.messageId,
                consumptionKey: randomUUID(),
                state,
                event: delivery.event
            })
            f.nativeStatus.mockImplementation(async (input) => ({
                status: 'succeeded',
                executionId: next,
                conversationId: input.conversationId,
                control: await ledger.evidence.read(executionId, f.context.actor)
            }))
            await f.readyAgain(operation.id)
            await f.request(() => f.runner.run(f.context, operation.id))
            const current = await f.db
                .getRepository(ProjectPipelineOperationEntity)
                .findOneByOrFail({ id: operation.id })
            expect(current.state).toBe('unknown')
            expect(current.terminalObservedAt).toBeNull()
            expect(current.receipt.control).toMatchObject({
                source: 'platform',
                state: 'unknown',
                executionId: next,
                reason: `result_delivery_${state}`
            })
            expect(f.nativeStart).toHaveBeenCalledTimes(1)
            await f.db.getRepository(AgentRuntimeInbox).update(inbox.id, { state: 'processed' })
            expect(await ledger.evidence.read(executionId, f.context.actor)).toMatchObject({
                state: 'settled',
                executionId: next
            })
        }
    )

    it('does not infer consumption from a received delivery with no matching inbox', async () => {
        const { ledger, delivery, executionId } = await completedParent()
        await f.db.getRepository(AgentRuntimeDelivery).update(delivery.id, { state: 'received' })
        expect(await ledger.evidence.read(executionId, f.context.actor)).toMatchObject({
            source: 'platform',
            state: 'unknown',
            reason: 'result_delivery_unconfirmed'
        })
    })

    it('ignores other owners, input notifications and unrelated invocation results', async () => {
        const { ledger, delivery, executionId } = await completedParent()
        const other = await completedParent()
        await f.db.getRepository(AgentRuntimeDelivery).update(other.delivery.id, { state: 'failed' })
        await f.db.getRepository(AgentRuntimeInbox).save({
            ...f.context.actor,
            ownerId: randomUUID(),
            invocationId: delivery.invocationId,
            messageId: delivery.messageId,
            consumptionKey: randomUUID(),
            state: 'processed',
            event: delivery.event
        })
        await f.db.getRepository(AgentRuntimeInbox).save({
            ...f.context.actor,
            ownerId: f.context.actor.userId,
            invocationId: delivery.invocationId,
            messageId: randomUUID(),
            consumptionKey: randomUUID(),
            state: 'processed',
            event: {
                version: 1,
                kind: 'input_request',
                invocationId: delivery.invocationId,
                revision: 0,
                interactionId: 'approval'
            }
        })
        expect(await ledger.evidence.read(executionId, f.context.actor)).toMatchObject({ state: 'running' })
        expect(
            await readRuntimeResultSettlement(f.db.manager, f.context.actor, [
                delivery.invocationId,
                other.delivery.invocationId
            ])
        ).toBe('failed')
        expect(
            await readRuntimeResultSettlement(f.db.manager, { ...f.context.actor, tenantId: randomUUID() }, [
                other.delivery.invocationId
            ])
        ).toBe('settled')
        expect(
            await readRuntimeResultSettlement(f.db.manager, { ...f.context.actor, organizationId: randomUUID() }, [
                other.delivery.invocationId
            ])
        ).toBe('settled')
    })

    it('applies settlement lookup indexes idempotently and checks the actual query plan', async () => {
        const { delivery } = await completedParent()
        await f.db.query(
            `INSERT INTO agent_runtime_delivery
            (id, "tenantId", "organizationId", "ownerId", "invocationId", "messageId", event, state)
            SELECT gen_random_uuid(), $1, $2, $3, gen_random_uuid(), 'plan-' || gen_random_uuid(),
                '{"kind":"result"}'::jsonb, 'received' FROM generate_series(1, 12000)`,
            [f.context.actor.tenantId, f.context.actor.organizationId, f.context.actor.userId]
        )
        await f.db.query(`INSERT INTO agent_runtime_inbox
            (id, "tenantId", "organizationId", "ownerId", "invocationId", "messageId", "consumptionKey", event, state)
            SELECT gen_random_uuid(), "tenantId", "organizationId", "ownerId", "invocationId", "messageId", "messageId", event, 'processed'
            FROM agent_runtime_delivery WHERE "messageId" LIKE 'plan-%'`)
        await f.db.query('DROP INDEX IF EXISTS "IDX_runtime_delivery_result_scope"')
        await f.db.query('DROP INDEX IF EXISTS "IDX_runtime_inbox_result_scope"')
        await f.db.query('ANALYZE agent_runtime_delivery')
        await f.db.query('ANALYZE agent_runtime_inbox')
        const queries: Array<{ sql: string; parameters?: unknown[] }> = []
        const capture = jest.spyOn(f.db.logger, 'logQuery').mockImplementation((sql, parameters) => {
            if (sql.startsWith('SELECT DISTINCT CASE')) queries.push({ sql, parameters })
        })
        try {
            expect(await readRuntimeResultSettlement(f.db.manager, f.context.actor, [delivery.invocationId])).toBe(
                'pending'
            )
        } finally {
            capture.mockRestore()
        }
        expect(queries).toHaveLength(1)
        const { sql, parameters } = queries[0]
        const before: unknown = await f.db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, parameters)
        const folder = join(__dirname, '../../../handoff/runtime-messaging/migrations')
        const migration = readFileSync(join(folder, '20261118000100-runtime-result-settlement.sql'), 'utf8')
        const check = readFileSync(join(folder, 'checks/20261118000100-runtime-result-settlement.sql'), 'utf8')
        expect(await f.db.query(check)).toHaveLength(2)
        await f.db.query(migration)
        await f.db.query(migration)
        expect(await f.db.query(check)).toEqual([])
        const after: unknown = await f.db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, parameters)
        expect(JSON.stringify(after)).toContain('IDX_runtime_delivery_result_scope')
        expect(JSON.stringify(after)).toContain('IDX_runtime_inbox_result_scope')
        const timing = z.array(z.object({ 'QUERY PLAN': z.array(z.object({ 'Execution Time': z.number() })) }))
        console.info('RESULT_SETTLEMENT_QUERY_MS', {
            before: timing.parse(before)[0]['QUERY PLAN'][0]['Execution Time'],
            after: timing.parse(after)[0]['QUERY PLAN'][0]['Execution Time']
        })
        expect(await readRuntimeResultSettlement(f.db.manager, f.context.actor, [delivery.invocationId])).toBe(
            'pending'
        )
    })

    it('keeps the parent open between child exit, result consumption and the next graph turn', async () => {
        const ledger = await controlLedger(f.db),
            id = randomUUID(),
            invocationId = randomUUID()
        const parent = await ledger.seed(id, f.context.actor)
        const child = await ledger.tasks.register({
            ...f.context.actor,
            kind: 'invocation',
            resourceId: invocationId,
            parent: { version: 2, targetId: parent.id }
        })
        await ledger.tasks.receipt(child.id, 'completed')
        await f.db.transaction((manager) => ledger.controls.end(manager, id))
        await ledger.tasks.receipt(parent.id, 'completed')
        const delivery = await f.db.getRepository(AgentRuntimeDelivery).save({
            ...f.context.actor,
            ownerId: f.context.actor.userId,
            invocationId,
            messageId: randomUUID(),
            state: 'pending',
            event: { version: 1, invocationId, revision: 1, kind: 'result', status: 'succeeded' }
        })
        expect(await ledger.evidence.read(id, f.context.actor)).toMatchObject({ state: 'running' })
        const inbox = await f.db.getRepository(AgentRuntimeInbox).save({
            ...f.context.actor,
            ownerId: f.context.actor.userId,
            invocationId,
            messageId: delivery.messageId,
            consumptionKey: randomUUID(),
            state: 'processing',
            event: delivery.event
        })
        await f.db.getRepository(AgentRuntimeDelivery).update(delivery.id, { state: 'received' })
        expect(await ledger.evidence.read(id, f.context.actor)).toMatchObject({ state: 'running' })
        const next = randomUUID()
        await f.db.transaction((manager) => ledger.tasks.bind(id, next, manager))
        expect(await ledger.evidence.read(id, f.context.actor)).toMatchObject({ state: 'unknown' })
        await f.db.transaction((manager) =>
            ledger.controls.root(manager, { ...f.context.actor, threadId: parent.threadId }, next)
        )
        expect(await ledger.evidence.read(id, f.context.actor)).toMatchObject({ state: 'running', executionId: next })
        await f.db.transaction((manager) => ledger.controls.end(manager, next))
        await ledger.tasks.receipt(parent.id, 'completed')
        await f.db.getRepository(AgentRuntimeInbox).update(inbox.id, { state: 'processed' })
        expect(await ledger.evidence.read(id, f.context.actor)).toMatchObject({ state: 'settled', executionId: next })
        await f.db.getRepository(AgentRuntimeInbox).update(inbox.id, { state: 'pending' })
        await ledger.tasks.change(parent.id, 'terminated')
        expect(await ledger.evidence.read(id, f.context.actor)).toMatchObject({
            state: 'settled',
            desired: 'terminated'
        })
    })

    it('keeps Pipeline cancellation pending while the accepted cancellation has not stopped its tool', async () => {
        const launched = await f.launchAssistant()
        const operation = (await f.operations())[0]
        const ledger = await controlLedger(f.db)
        const task = await ledger.seed(operation.id, f.context.actor)
        await ledger.controls.admit(operation.id, 'write-1')
        let release!: () => void
        const pending = new Promise<void>((resolve) => {
            release = resolve
        })
        let running = false
        let calls = 0
        const tool = new DynamicTool({
            name: 'controlled_write',
            description: 'A write that finishes after cancellation is accepted',
            func: async () => {
                calls++
                running = true
                await pending
                running = false
                await ledger.controls.settle(operation.id, 'write-1')
                return 'saved'
            }
        })
        const work = tool.invoke('')
        await new Promise<void>((resolve) => setImmediate(resolve))
        f.nativeStatus.mockImplementation(async (input) => ({
            status: 'interrupted',
            executionId: input.executionId,
            conversationId: input.conversationId,
            control: await ledger.evidence.read(operation.id, f.context.actor)
        }))
        f.nativeCancel.mockImplementation(async (input) => {
            await ledger.controls.terminate([operation.id])
            await f.db.transaction((manager) => ledger.controls.end(manager, operation.id))
            await ledger.tasks.receipt(task.id, 'completed') // The graph wrapper ended; the tool did not.
            return { canceledExecutionIds: [input.executionId!] }
        })
        try {
            await f.request(() => f.runner.run(f.context, operation.id))
            await f.lifecycle.cancel(f.context, await f.cancelInput(launched.instanceId))
            await f.readyAgain(operation.id)
            await f.request(() => f.runner.run(f.context, operation.id))
            const current = await f.db
                .getRepository(ProjectPipelineOperationEntity)
                .findOneByOrFail({ id: operation.id })
            const run = await f.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: operation.runId })
            const attempts = await f.db.getRepository(XpertProjectTaskExecution).findBy({ sourceKey: operation.id })
            console.info(
                'CONTROL_31_REPRO',
                JSON.stringify({
                    cancellationAccepted: f.nativeCancel.mock.calls.length === 1,
                    toolRunning: running,
                    toolCalls: calls,
                    operation: current.state,
                    run: run.state,
                    attempts: attempts.map((attempt) => ({ status: attempt.status, completedAt: attempt.completedAt }))
                })
            )
            expect(running).toBe(true)
            expect(calls).toBe(1)
            expect(current.state).toBe('pending')
            expect(current.terminalObservedAt).toBeNull()
            expect(run.state).toBe('cancelling')
            expect(attempts.every((attempt) => !attempt.completedAt)).toBe(true)
            expect(current.receipt).toMatchObject({ control: { state: 'terminating' } })
            release()
            await work
            await f.readyAgain(operation.id)
            await f.request(() => f.runner.run(f.context, operation.id))
            const ended = await f.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: operation.runId })
            const finished = await f.db.getRepository(XpertProjectTaskExecution).findBy({ sourceKey: operation.id })
            console.info(
                'CONTROL_31_SETTLED',
                JSON.stringify({
                    toolRunning: running,
                    toolCalls: calls,
                    run: ended.state,
                    attempts: finished.map((item) => ({ status: item.status, completedAt: item.completedAt }))
                })
            )
            expect(ended.state).toBe('cancelled')
            expect(finished.every((attempt) => attempt.status === 'cancelled' && attempt.completedAt)).toBe(true)
            expect(f.nativeStart).toHaveBeenCalledTimes(1)
            expect(f.nativeCancel).toHaveBeenCalledTimes(1)
            expect(calls).toBe(1)
            await expect(ledger.tasks.change(task.id, 'running')).rejects.toMatchObject({ reason: 'terminated' })
            await expect(ledger.controls.admit(operation.id, 'write-2')).rejects.toThrow()
        } finally {
            release()
            await work
        }
    })
    it('drains a synchronous child during pause, preserves independent work and follows the resumed attempt', async () => {
        const ledger = await controlLedger(f.db),
            id = randomUUID()
        const parent = await ledger.seed(id, f.context.actor)
        const independents = await Promise.all(
            (['detached', 'shared'] as const).map((policy) =>
                ledger.seed(randomUUID(), f.context.actor, parent.id, policy)
            )
        )
        const dependency = await ledger.tasks.register({
            ...f.context.actor,
            kind: 'managed-queue',
            resourceId: randomUUID(),
            parent: { version: 2, targetId: parent.id },
            drainOnPause: true
        })
        const later = await ledger.tasks.register({
            ...f.context.actor,
            kind: 'managed-queue',
            resourceId: randomUUID(),
            parent: { version: 2, targetId: parent.id }
        })
        await ledger.tasks.change(parent.id, 'paused')
        await f.db.transaction((manager) => ledger.controls.end(manager, id))
        await ledger.tasks.receipt(parent.id, 'paused')
        expect(await ledger.evidence.read(id, f.context.actor)).toMatchObject({ state: 'pausing' })
        const runner = new TaskControlRunner(ledger.tasks),
            body = jest.fn(async () => 'saved result')
        try {
            await expect(runner.run({ version: 2, targetId: later.id }, body)).rejects.toMatchObject({
                reason: 'paused'
            })
            // Already admitted parent nodes can complete their synchronous dependencies while paused.
            await runner.run({ version: 2, targetId: dependency.id }, body)
            expect(await ledger.evidence.read(id, f.context.actor)).toMatchObject({ state: 'paused' })
            await ledger.tasks.change(parent.id, 'running')
            const nextId = randomUUID()
            await f.db.transaction((manager) => ledger.tasks.bind(id, nextId, manager))
            const old = await f.db.getRepository(ExecutionControl).findOneByOrFail({ executionId: id })
            await f.db.getRepository(ExecutionControl).save({
                ...old,
                id: randomUUID(),
                executionId: nextId,
                rootExecutionId: nextId,
                ownership: { policy: 'detached', rootExecutionId: nextId },
                ancestors: [nextId],
                graphEnded: false,
                work: []
            })
            expect(await ledger.evidence.read(id, f.context.actor)).toMatchObject({
                subject: { id },
                executionId: nextId,
                state: 'running',
                taskId: parent.id
            })
            await expect(runner.run({ version: 2, targetId: dependency.id }, body)).rejects.toThrow()
            const claims = await Promise.allSettled([
                runner.run({ version: 2, targetId: later.id }, body),
                runner.run({ version: 2, targetId: later.id }, body)
            ])
            expect(claims.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
            expect(body).toHaveBeenCalledTimes(2) // Each distinct node once, including after resume.
            await ledger.controls.terminate([nextId])
            await expect(ledger.tasks.change(parent.id, 'running')).rejects.toMatchObject({ reason: 'terminated' })
            for (const target of independents) {
                expect(await ledger.tasks.desired(target.id)).toBe('running')
                expect((await ledger.tasks.read(target.id)).state).toBe('running')
            }
        } finally {
            runner.onModuleDestroy()
        }
    })

    it('requires receipts for owned child tools even when their graph and task wrappers already ended', async () => {
        const ledger = await controlLedger(f.db),
            parent = await ledger.seed(randomUUID(), f.context.actor)
        const child = await ledger.seed(randomUUID(), f.context.actor, parent.id)
        await ledger.controls.admit(child.currentExecutionId, 'child-write')
        await ledger.controls.terminate([parent.currentExecutionId])
        for (const target of [parent, child]) {
            await f.db.transaction((manager) => ledger.controls.end(manager, target.currentExecutionId))
            await ledger.tasks.receipt(target.id, 'completed')
        }
        expect(await ledger.evidence.read(parent.currentExecutionId, f.context.actor)).toMatchObject({
            state: 'terminating'
        })
        await ledger.controls.settle(child.currentExecutionId, 'child-write')
        expect(await ledger.evidence.read(parent.currentExecutionId, f.context.actor)).toMatchObject({
            state: 'settled',
            desired: 'terminated'
        })
        expect(
            await ledger.evidence.read(parent.currentExecutionId, { ...f.context.actor, organizationId: randomUUID() })
        ).toMatchObject({ state: 'unknown' })
        await f.db.getRepository(ExecutionControl).delete({ executionId: child.currentExecutionId })
        expect(await ledger.evidence.read(parent.currentExecutionId, f.context.actor)).toMatchObject({
            state: 'unknown',
            reason: 'unregistered'
        })
    })

    it('keeps Runtime Pipeline cancellation pending until the original operation has completion evidence', async () => {
        const launched = await f.launchRuntime(),
            operation = (await f.operations())[0]
        await f.request(() => f.runner.run(f.context, operation.id))
        await f.lifecycle.cancel(f.context, await f.cancelInput(launched.instanceId))
        f.runtimeFixture.cancel.mockResolvedValueOnce({ status: 'cancelled' })
        await f.request(() => f.runner.run(f.context, operation.id))
        expect(
            await f.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: operation.runId })
        ).toMatchObject({ state: 'cancelling' })
        expect(
            await f.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
        ).toMatchObject({ state: 'pending', terminalObservedAt: null })
        f.runtimeFixture.inspect.mockImplementationOnce(async (handle, context) => ({
            status: 'cancelled',
            controlEvidence: {
                version: 1,
                source: 'provider',
                subject: { kind: 'invocation', id: context.invocationId },
                scope: 'operation',
                state: 'settled',
                outcome: 'cancelled',
                sessionId: handle.sessionId,
                runId: handle.runId,
                receiptKey: 'actual-runtime-exit',
                observedAt: new Date().toISOString()
            }
        }))
        await f.readyAgain(operation.id)
        await f.request(() => f.runner.run(f.context, operation.id))
        expect(
            await f.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: operation.runId })
        ).toMatchObject({ state: 'cancelled' })
        expect(f.runtimeFixture.start).toHaveBeenCalledTimes(1)
        expect(f.runtimeFixture.cancel).toHaveBeenCalledTimes(1)
    })
})
