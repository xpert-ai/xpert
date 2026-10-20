import { ProjectPipelineOperationEntity } from '../../persistence/pipeline.entity'
import { AgentInvocationEntity } from '../../../../agent-invocation/invocation.entity'
import type { ProjectPipelineOperationReceipt } from '@xpert-ai/contracts'
import { managedPipelineFixture } from './pipeline-managed.fixture'
import { randomUUID } from 'node:crypto'

/** Exercise failure boundaries with real SQL and the host Invocation bridge, without business adapters. */
export function registerCoordinationReviewCases(fixture: ReturnType<typeof managedPipelineFixture>) {
    it('scans beyond an unchanged due page and retries it on a later sweep', async () => {
        await fixture.launch()
        await fixture.db
            .getRepository(ProjectPipelineOperationEntity)
            .createQueryBuilder()
            .update()
            .set({ nextCheckAt: new Date(Date.now() + 60_000) })
            .where('"projectId" != :projectId', { projectId: fixture.context.projectId })
            .execute()
        const expected = (await fixture.operations()).map((row) => row.id).sort()
        expect(expected).toHaveLength(2)
        const first = await fixture.store.due(1)
        expect(first.map((row) => row.id)).toEqual(expected.slice(0, 1))
        const second = await fixture.store.due(1, first[0].id)
        expect(second.map((row) => row.id)).toEqual(expected.slice(1))
        expect(await fixture.store.due(1, second[0].id)).toEqual([])
        expect((await fixture.store.due(1)).map((row) => row.id)).toEqual(expected.slice(0, 1))
    })

    it('does not turn an inspection lease into first-dispatch authority after a worker crash', async () => {
        await fixture.launch()
        const [operation] = await fixture.operations(),
            firstWorker = randomUUID(),
            observer = randomUUID()
        await fixture.store.claim(fixture.context, operation.id, firstWorker)
        await fixture.db.getRepository(ProjectPipelineOperationEntity).update(operation.id, {
            leaseExpiresAt: new Date(0),
            nextCheckAt: new Date(0)
        })
        const recovered = await fixture.store.claim(fixture.context, operation.id, observer)
        expect(recovered.mode).toBe('inspect')
        expect(await fixture.store.beginDispatch(fixture.context, operation.id, observer, recovered.fence)).toBe(false)
    })

    it.each(['assistant', 'runtime'] as const)(
        'rejects %s intent writes after preparation outlives its lease',
        async (kind) => {
            if (kind === 'assistant') await fixture.launchAssistant()
            else await fixture.launchRuntime()
            const [operation] = await fixture.operations()
            const prepare = kind === 'assistant' ? fixture.prepare : fixture.runtimeFixture.prepare
            prepare.mockImplementationOnce(async () => {
                await fixture.db
                    .getRepository(ProjectPipelineOperationEntity)
                    .update(operation.id, { leaseExpiresAt: new Date(0) })
                return { prompt: 'Prepared too late' }
            })
            await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
            const saved = await fixture.db
                .getRepository(ProjectPipelineOperationEntity)
                .createQueryBuilder('operation')
                .addSelect(['operation.assistantIntent', 'operation.runtimeIntent'])
                .where({ id: operation.id })
                .getOneOrFail()
            expect(saved).toMatchObject({ assistantIntent: null, runtimeIntent: null, dispatchStartedAt: null })
            expect(fixture.nativeStart).not.toHaveBeenCalled()
            expect(fixture.runtimeFixture.start).not.toHaveBeenCalled()
        }
    )

    it.each(['pending', 'unknown', 'succeeded', 'failed', 'cancelled'] as const)(
        'preserves recovery identity when a %s observation omits its required receipt key',
        async (status) => {
            await fixture.launch()
            const [operation] = await fixture.operations(),
                worker = randomUUID()
            const first = await fixture.store.claim(fixture.context, operation.id, worker)
            await fixture.store.settle(
                fixture.context,
                operation.id,
                worker,
                first.fence,
                { receipt: { status: 'unknown', receiptKey: 'original-effect' } },
                async () => undefined
            )
            await fixture.readyAgain(operation.id)
            const next = await fixture.store.claim(fixture.context, operation.id, worker)
            expect(next.mode).toBe('inspect')
            const receipt: ProjectPipelineOperationReceipt = { status }
            const observation = fixture.store.settle(
                fixture.context,
                operation.id,
                worker,
                next.fence,
                { receipt },
                async () => undefined
            )
            if (status === 'unknown') await observation
            else await expect(observation).rejects.toThrow()
            expect(
                await fixture.db.getRepository(ProjectPipelineOperationEntity).findOneByOrFail({ id: operation.id })
            ).toMatchObject({ receipt: { status: 'unknown', receiptKey: 'original-effect' } })
        }
    )

    it('rejects a Runtime request changed after the Pipeline persisted its intent', async () => {
        await fixture.launchRuntime()
        const [operation] = await fixture.operations(),
            factory = fixture.runtimeFixture.factory
        const original = factory.createCapturedApi.bind(factory)
        const capture = jest.spyOn(factory, 'createCapturedApi').mockImplementation((scope) => {
            const api = original(scope)
            return {
                ...api,
                start: (request) => api.start({ ...request, input: { ...request.input, prompt: 'Replaced request' } })
            }
        })
        try {
            await fixture.request(() => fixture.runner.run(fixture.context, operation.id))
            expect(fixture.runtimeFixture.start).not.toHaveBeenCalled()
            expect(
                await fixture.db.getRepository(AgentInvocationEntity).countBy({ ownerId: fixture.context.actor.userId })
            ).toBe(0)
        } finally {
            capture.mockRestore()
        }
    })
}
