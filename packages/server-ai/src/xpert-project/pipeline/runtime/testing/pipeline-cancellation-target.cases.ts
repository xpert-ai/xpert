import { randomUUID } from 'node:crypto'
import {
    ProjectPipelineEventEntity,
    ProjectPipelineInstanceEntity,
    ProjectPipelineRunEntity
} from '../../persistence/pipeline.entity'
import { managedPipelineFixture } from './pipeline-managed.fixture'

export function registerCancellationTargetCases(fixture: ReturnType<typeof managedPipelineFixture>) {
    it.each(['progress', 'new-round'] as const)(
        'cancels the observed run after %s without requiring the caller to refresh its revision',
        async (change) => {
            const launched = await fixture.launch()
            const observedRevision = (await fixture.commandInput(launched.instanceId)).expectedRevision
            const input = await fixture.cancelInput(launched.instanceId)
            if (change === 'progress') {
                await fixture.runner.run(fixture.context, (await fixture.operations())[0].id)
            } else {
                fixture.subjectVersion = '2'
                const next = await fixture.rounds.next(fixture.context, {
                    ...(await fixture.commandInput(launched.instanceId))
                })
                expect(next.runId).toBe(launched.runId)
                expect(next.roundId).not.toBe(launched.roundId)
            }
            expect((await fixture.commandInput(launched.instanceId)).expectedRevision).toBeGreaterThan(observedRevision)
            const before = await fixture.operations()
            expect(before.filter((row) => row.state === 'accepted')).toHaveLength(change === 'progress' ? 1 : 0)

            const cancelled = await fixture.lifecycle.cancel(fixture.context, input)
            expect(cancelled.runId).toBe(launched.runId)
            expect(
                await fixture.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: launched.runId })
            ).toMatchObject({ state: 'cancelled' })
            const after = await fixture.operations()
            expect(after).toHaveLength(before.length)
            for (const operation of before) {
                const current = after.find((row) => row.id === operation.id)
                if (['accepted', 'superseded'].includes(operation.state)) expect(current).toEqual(operation)
                else expect(current).toMatchObject({ state: 'cancelled', cancelRequestedAt: expect.any(Date) })
            }
            expect(await fixture.lifecycle.cancel(fixture.context, input)).toEqual(cancelled)
            expect(fixture.cancel).not.toHaveBeenCalled()
        }
    )

    it('returns the original terminal run after a new run starts and leaves the new work untouched', async () => {
        const { bindingId } = await fixture.start.configure(fixture.context, {
            requestId: randomUUID(),
            configuration: fixture.configuration
        })
        const startInput = { bindingId, objectKey: 'document', title: 'Cancellation boundary' }
        const first = await fixture.start.start(fixture.context, { ...startInput, triggerKey: 'first' })
        const staleInput = await fixture.cancelInput(first.instanceId)
        const acceptedInput = await fixture.cancelInput(first.instanceId)
        await fixture.lifecycle.cancel(fixture.context, acceptedInput)
        const next = await fixture.start.start(fixture.context, { ...startInput, triggerKey: 'next' })
        expect(next.instanceId).toBe(first.instanceId)
        expect(next.runId).not.toBe(first.runId)
        const instances = fixture.db.getRepository(ProjectPipelineInstanceEntity)
        const before = await instances.findOneByOrFail({ id: next.instanceId })
        const operations = await fixture.operations()
        const events = await fixture.db
            .getRepository(ProjectPipelineEventEntity)
            .countBy({ instanceId: next.instanceId })

        for (const input of [staleInput, acceptedInput]) {
            expect(await fixture.lifecycle.cancel(fixture.context, input)).toMatchObject({
                instanceId: first.instanceId,
                runId: first.runId,
                roundId: first.roundId,
                state: 'cancelled'
            })
        }
        await expect(
            fixture.lifecycle.cancel(fixture.context, { ...acceptedInput, runId: next.runId })
        ).rejects.toMatchObject({ response: { code: 'COMMAND_INPUT_IMMUTABLE' } })
        expect(await instances.findOneByOrFail({ id: next.instanceId })).toEqual(before)
        expect(await fixture.operations()).toEqual(operations)
        expect(
            await fixture.db.getRepository(ProjectPipelineEventEntity).countBy({ instanceId: next.instanceId })
        ).toBe(events)
        expect(
            await fixture.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id: next.runId })
        ).toMatchObject({
            state: 'active'
        })
    })

    it('keeps retry bound to the current revision even when the older revision belongs to the same run', async () => {
        const launched = await fixture.launch()
        const input = await fixture.commandInput(launched.instanceId)
        const [operation] = await fixture.operations()
        fixture.execute.mockResolvedValue({ status: 'failed', receiptKey: 'receipt-1', code: 'TRANSIENT_FAILURE' })
        await fixture.runner.run(fixture.context, operation.id)
        const revision = (await fixture.commandInput(launched.instanceId)).expectedRevision
        expect(revision).toBeGreaterThan(input.expectedRevision)
        const operations = await fixture.operations()

        await expect(
            fixture.lifecycle.retry(fixture.context, {
                ...input,
                operationId: operation.id,
                inputDigest: operation.context.work.inputDigest,
                generation: operation.context.work.generation
            })
        ).rejects.toMatchObject({ response: { code: 'RUN_REVISION_CONFLICT' } })
        expect((await fixture.commandInput(launched.instanceId)).expectedRevision).toBe(revision)
        expect(await fixture.operations()).toEqual(operations)
    })

    it('still rechecks current access before cancelling an observed run at an older revision', async () => {
        const launched = await fixture.launch()
        const input = await fixture.cancelInput(launched.instanceId)
        const observedRevision = (await fixture.commandInput(launched.instanceId)).expectedRevision
        await fixture.runner.run(fixture.context, (await fixture.operations())[0].id)
        const revision = (await fixture.commandInput(launched.instanceId)).expectedRevision
        expect(revision).toBeGreaterThan(observedRevision)
        const operations = await fixture.operations()
        fixture.access.assertEdit.mockRejectedValueOnce(new Error('Access revoked'))

        await expect(fixture.lifecycle.cancel(fixture.context, input)).rejects.toThrow('Access revoked')
        expect((await fixture.commandInput(launched.instanceId)).expectedRevision).toBe(revision)
        expect(await fixture.operations()).toEqual(operations)
    })

    it('rejects a run belonging to another instance without changing either run', async () => {
        const first = await fixture.launch()
        const { bindingId } = await fixture.start.configure(fixture.context, {
            requestId: randomUUID(),
            configuration: fixture.configuration
        })
        const other = await fixture.start.start(fixture.context, {
            bindingId,
            objectKey: 'other-document',
            triggerKey: 'other',
            title: 'Other instance'
        })
        expect(other.instanceId).not.toBe(first.instanceId)
        const before = await fixture.operations()
        await expect(
            fixture.lifecycle.cancel(fixture.context, {
                instanceId: first.instanceId,
                runId: other.runId,
                requestId: randomUUID()
            })
        ).rejects.toThrow()
        expect(await fixture.operations()).toEqual(before)
        for (const id of [first.runId, other.runId]) {
            expect(await fixture.db.getRepository(ProjectPipelineRunEntity).findOneByOrFail({ id })).toMatchObject({
                state: 'active'
            })
        }
    })

    it.each(['tenant', 'organization', 'project'] as const)(
        'rejects a cancellation outside the %s scope',
        async (scope) => {
            const launched = await fixture.launch()
            const input = await fixture.cancelInput(launched.instanceId)
            const context = {
                ...fixture.context,
                actor: { ...fixture.context.actor }
            }
            if (scope === 'project') context.projectId = randomUUID()
            if (scope === 'tenant') context.actor.tenantId = randomUUID()
            if (scope === 'organization') context.actor.organizationId = randomUUID()
            const before = await fixture.operations()
            await expect(fixture.lifecycle.cancel(context, input)).rejects.toThrow()
            expect(await fixture.operations()).toEqual(before)
        }
    )

    it('returns completed work without changing its history and still rechecks access', async () => {
        const launched = await fixture.launch()
        const input = await fixture.cancelInput(launched.instanceId)
        for (const operation of await fixture.operations()) await fixture.runner.run(fixture.context, operation.id)
        const policy = (await fixture.operations()).find((row) => row.kind === 'policy')!
        await fixture.runner.run(fixture.context, policy.id)
        const before = await fixture.operations()
        const revision = (await fixture.commandInput(launched.instanceId)).expectedRevision
        const receipt = await fixture.lifecycle.cancel(fixture.context, input)
        expect(receipt).toMatchObject({ runId: launched.runId, state: 'completed', revision })
        expect(await fixture.lifecycle.cancel(fixture.context, input)).toEqual(receipt)
        expect(await fixture.operations()).toEqual(before)
        expect((await fixture.commandInput(launched.instanceId)).expectedRevision).toBe(revision)
        fixture.access.assertEdit.mockRejectedValueOnce(new Error('Access revoked'))
        await expect(fixture.lifecycle.cancel(fixture.context, input)).rejects.toThrow('Access revoked')
    })

    it('serializes duplicate cancellations without duplicating the intent', async () => {
        const launched = await fixture.launch()
        const input = await fixture.cancelInput(launched.instanceId)
        const receipts = await Promise.all([
            fixture.lifecycle.cancel(fixture.context, input),
            fixture.lifecycle.cancel(fixture.context, input)
        ])
        expect(receipts[0]).toEqual(receipts[1])
        expect(receipts[0]).toMatchObject({ runId: launched.runId, state: 'cancelled' })
        expect(
            await fixture.db.getRepository(ProjectPipelineEventEntity).countBy({
                instanceId: launched.instanceId,
                type: 'run.cancel_requested'
            })
        ).toBe(1)
    })
}
