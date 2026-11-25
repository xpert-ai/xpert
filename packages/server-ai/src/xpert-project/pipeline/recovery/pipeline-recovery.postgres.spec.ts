jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Table } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { ChatConversationThread } from '../../../chat-conversation/conversation-thread.entity'
import { assertRecoveryQuiescent } from './pipeline-recovery-runtime'
import { managedPipelineFixture } from '../runtime/testing/pipeline-managed.fixture'
import { ProjectPipelineRecoveryStore } from './pipeline-recovery.store'
import { recoveryVersion, hasManualRetry } from './pipeline-recovery-record'
import { ProjectPipelineOperationObserverService } from '../runtime/pipeline-operation-observer.service'
import {
    ProjectPipelineEventEntity,
    ProjectPipelineOperationEntity,
    ProjectPipelineNodeEntity,
    ProjectPipelineRunEntity
} from '../persistence/pipeline.entity'

const integration = process.env.XPERT_PIPELINE_TEST_DATABASE_URL ? describe : describe.skip
integration('manual pipeline recovery transactions', () => {
    const f = managedPipelineFixture()
    beforeAll(async () => {
        const runner = f.db.createQueryRunner()
        await runner.createTable(Table.create(f.db.getMetadata(ChatConversationThread), f.db.driver))
        await runner.release()
    })
    let store: ProjectPipelineRecoveryStore
    beforeEach(() => {
        store = new ProjectPipelineRecoveryStore(
            f.db,
            f.coordinator,
            new ProjectPipelineOperationObserverService(f.coordinator)
        )
    })
    async function failed() {
        const started = await f.launch()
        const [op] = await f.operations()
        f.execute.mockResolvedValueOnce({ status: 'failed', receiptKey: op.id, code: 'original_failure' })
        await f.request(() => f.runner.run(f.context, op.id))
        return { started, row: await store.operation(f.context, op.id) }
    }
    const action = (row: ProjectPipelineOperationEntity, key = 'reconcile-result') => ({
        operationId: row.id,
        version: recoveryVersion(row),
        key
    })
    const authorize = async () => undefined
    it('fences concurrent checks, preserves immutable failure history and replays completion', async () => {
        const { row } = await failed()
        const claims = await Promise.allSettled(
            [1, 2].map(() => store.request(f.context, action(row), 'reconcile-result', authorize))
        )
        expect(claims.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
        const claim = claims.find((item) => item.status === 'fulfilled')
        if (claim?.status !== 'fulfilled' || !claim.value) throw Error('Expected a recovery lease')
        await store.complete(
            f.context,
            claim.value,
            { status: 'succeeded', receiptKey: row.id, outputs: {} },
            { status: 'accepted', evidence: [] },
            authorize
        )
        const updated = await store.operation(f.context, row.id)
        expect(updated.state).toBe('accepted')
        expect(updated.terminalObservedAt).toEqual(row.terminalObservedAt)
        expect(
            (await f.db.manager.findOneByOrFail(ProjectPipelineNodeEntity, { id: row.nodeInstanceId })).projection.state
                .lifecycle
        ).toBe('completed')
        const audit = await f.db.manager.findBy(ProjectPipelineEventEntity, {
            instanceId: row.instanceId,
            type: 'operation.recovery_requested'
        })
        expect(audit).toHaveLength(1)
        expect(audit[0].payload.recovery?.previousReceipt).toEqual(row.receipt)
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = 'false'
        await expect(store.request(f.context, action(row), 'reconcile-result', authorize)).resolves.toBeNull()
        expect(f.execute).toHaveBeenCalledTimes(1)
    })
    it('grants only one successor attempt beyond the automatic limit', async () => {
        const { row, started } = await failed()
        let exhausted = row
        for (let i = 2; i <= 3; i++) {
            await f.lifecycle.retry(f.context, {
                ...(await f.commandInput(started.instanceId)),
                operationId: exhausted.id,
                inputDigest: exhausted.context.work.inputDigest,
                generation: exhausted.context.work.generation
            })
            const next = (await f.operations()).find(
                (item) => item.nodeInstanceId === row.nodeInstanceId && item.attempt === i
            )!
            f.execute.mockResolvedValueOnce({ status: 'failed', receiptKey: next.id, code: 'TRANSIENT_FAILURE' })
            await f.request(() => f.runner.run(f.context, next.id))
            exhausted = await store.operation(f.context, next.id)
        }
        await store.request(f.context, action(exhausted, 'retry-once'), 'retry-once', authorize)
        const next = await f.db.manager.findBy(ProjectPipelineOperationEntity, { nodeInstanceId: row.nodeInstanceId })
        expect(next.map((item) => item.attempt).sort()).toEqual([1, 2, 3, 4])
        const retry = next.find((item) => item.attempt === 4)!
        f.execute.mockResolvedValueOnce({ status: 'failed', receiptKey: retry.id, code: 'TRANSIENT_FAILURE' })
        await f.request(() => f.runner.run(f.context, retry.id))
        expect(await hasManualRetry(f.db.manager, f.context, row.nodeInstanceId, 4)).toBe(false)
        await store.request(f.context, action(exhausted, 'retry-once'), 'retry-once', authorize)
        expect(await f.db.manager.countBy(ProjectPipelineOperationEntity, { nodeInstanceId: row.nodeInstanceId })).toBe(
            4
        )
    })
    it.each(['version', 'cancelled', 'timeout', 'unknown'])(
        'rejects %s recovery before auditing intent',
        async (kind) => {
            const { row } = await failed()
            const input = action(row)
            if (kind === 'version') input.version = '0'.repeat(64)
            if (kind === 'cancelled')
                await f.db.manager.update(ProjectPipelineRunEntity, row.runId, { state: 'cancelled' })
            if (kind === 'timeout')
                await f.db.manager.update(ProjectPipelineRunEntity, row.runId, { createdAt: new Date(0) })
            if (kind === 'unknown')
                await f.db.manager.update(ProjectPipelineOperationEntity, row.id, { state: 'unknown' })
            await expect(store.request(f.context, input, 'reconcile-result', authorize)).rejects.toThrow()
            expect(
                await f.db.manager.countBy(ProjectPipelineEventEntity, {
                    type: 'operation.recovery_requested',
                    instanceId: row.instanceId
                })
            ).toBe(0)
        }
    )
    it('cannot commit after cancellation or a replaced lease', async () => {
        const { row } = await failed()
        const claim = await store.request(f.context, action(row), 'reconcile-result', authorize)
        if (!claim) throw Error('Expected claim')
        await store.release(f.context, claim)
        const replacement = await store.request(f.context, action(row), 'reconcile-result', authorize)
        await expect(
            store.complete(
                f.context,
                claim,
                { status: 'succeeded', receiptKey: row.id },
                { status: 'accepted', evidence: [] },
                authorize
            )
        ).rejects.toThrow()
        expect(replacement?.leaseFence).toBeGreaterThan(claim.leaseFence)
        await f.db.manager.update(ProjectPipelineRunEntity, row.runId, { state: 'cancelled' })
        await expect(
            store.complete(
                f.context,
                replacement!,
                { status: 'succeeded', receiptKey: row.id },
                { status: 'accepted', evidence: [] },
                authorize
            )
        ).rejects.toThrow()
        expect((await store.operation(f.context, row.id)).state).toBe('failed')
    })
    it('requires settled conversation turns before recovering terminal native work', async () => {
        const { row } = await failed()
        row.assistantIntent = {
            xpertId: f.assistantId,
            workspaceId: f.workspaceId,
            publishedVersion: '1',
            executionId: randomUUID(),
            conversationId: randomUUID(),
            input: { prompt: 'Work', context: {} }
        }
        await expect(assertRecoveryQuiescent(f.db.manager, f.context, row)).rejects.toThrow()
        const thread = await f.db.manager.save(ChatConversationThread, {
            ...f.context.actor,
            threadId: randomUUID(),
            conversationId: row.assistantIntent.conversationId,
            status: 'busy',
            metadata: {}
        })
        await expect(assertRecoveryQuiescent(f.db.manager, f.context, row)).rejects.toThrow()
        await f.db.manager.update(ChatConversationThread, thread.id, { status: 'idle' })
        await expect(assertRecoveryQuiescent(f.db.manager, f.context, row)).resolves.toBeUndefined()
    })
})
