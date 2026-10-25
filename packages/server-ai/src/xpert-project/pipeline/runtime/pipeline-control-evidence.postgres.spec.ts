import { randomUUID } from 'node:crypto'
import { TaskControlRunner } from '@xpert-ai/server-core'
import { ExecutionControl } from '../../../execution-control/execution-control.entity'
jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { controlLedger } from './testing/control-evidence.fixture'
import { DynamicTool } from '@langchain/core/tools'
import { managedPipelineFixture } from './testing/pipeline-managed.fixture'
import { ProjectPipelineOperationEntity, ProjectPipelineRunEntity } from '../persistence/pipeline.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'

const integration = process.env.XPERT_PIPELINE_TEST_DATABASE_URL ? describe : describe.skip
integration('phase 3.1 execution completion evidence', () => {
    const f = managedPipelineFixture()

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
            await f.lifecycle.cancel(f.context, await f.commandInput(launched.instanceId))
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
        await f.lifecycle.cancel(f.context, await f.commandInput(launched.instanceId))
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
