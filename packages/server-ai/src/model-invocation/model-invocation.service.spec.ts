import type { ModelInvocationEvent } from '@xpert-ai/contracts'
import type { Repository } from 'typeorm'
import { ModelInvocation } from './model-invocation.entity'
import { ModelInvocationService } from './model-invocation.service'

describe('ModelInvocationService', () => {
    it('creates one started record for repeated starts from the same tool call', async () => {
        const { service, rows } = createService()
        const record = service.createRecorder(scope())
        const event: ModelInvocationEvent = {
            phase: 'start',
            invocationKey: 'tool-call-1',
            provider: 'kling',
            model: 'kling-v3',
            toolName: 'kling_text_to_video',
            operation: 'text_to_video',
            modality: 'video',
            pricingDimensions: { durationSeconds: 8, resolution: '1080p', audio: true }
        }

        const first = await record(event)
        const second = await record(event)

        expect(first).toEqual(
            expect.objectContaining({ invocationId: expect.any(String), created: true, providerState: 'started' })
        )
        expect(second).toEqual(
            expect.objectContaining({ invocationId: first.invocationId, created: false, providerState: 'started' })
        )
        expect(rows).toHaveLength(1)
        expect(rows[0]).toEqual(
            expect.objectContaining({
                originExecutionId: 'execution-1',
                toolsetId: 'toolset-1',
                providerScopeId: 'toolset-1',
                providerState: 'started',
                usageAvailability: 'pending'
            })
        )
    })

    it('binds and observes one Provider task without allowing terminal regression', async () => {
        const { service, rows } = createService()
        const record = service.createRecorder(scope())
        const { invocationId } = await record(startEvent())

        await record({ phase: 'bind', invocationId, providerRequestId: 'task-1' })
        await record({
            phase: 'observe',
            providerRequestId: 'task-1',
            state: 'succeeded',
            usageAvailability: 'available',
            metrics: [{ unit: 'second', quantity: 8, authority: 'provider' }]
        })
        await record({
            phase: 'observe',
            providerRequestId: 'task-1',
            state: 'processing',
            usageAvailability: 'pending'
        })

        expect(rows[0]).toEqual(
            expect.objectContaining({
                providerRequestId: 'task-1',
                providerState: 'succeeded',
                usageAvailability: 'available',
                metrics: [{ unit: 'second', quantity: 8, authority: 'provider' }],
                reconciliationState: 'finished'
            })
        )
    })

    it('keeps Provider success when local artifact processing fails', async () => {
        const { service, rows } = createService()
        const record = service.createRecorder(scope())
        const { invocationId } = await record(startEvent())
        await record({ phase: 'bind', invocationId, providerRequestId: 'task-1' })
        await record({
            phase: 'observe',
            invocationId,
            state: 'succeeded',
            usageAvailability: 'available',
            metrics: [{ unit: 'generation', quantity: 1, authority: 'contract' }],
            artifactState: 'failed',
            artifactErrorCode: 'workspace_upload_failed'
        })

        expect(rows[0]).toEqual(
            expect.objectContaining({
                providerState: 'succeeded',
                artifactState: 'failed',
                artifactErrorCode: 'workspace_upload_failed'
            })
        )
    })

    it('recovers an acceptance-unknown invocation when a Provider task ID arrives late', async () => {
        const { service, rows } = createService()
        const record = service.createRecorder(scope())
        const { invocationId } = await record(startEvent())
        Object.assign(rows[0], {
            providerState: 'acceptance_unknown',
            usageAvailability: 'unknown',
            artifactState: 'not_requested',
            artifactErrorCode: 'provider_acceptance_unknown',
            reconciliationState: 'blocked',
            completedAt: new Date('2026-08-14T00:01:00.000Z'),
            errorCode: 'provider_acceptance_unknown',
            reconciliationErrorCode: 'provider_request_id_missing'
        })

        await record({ phase: 'bind', invocationId, providerRequestId: 'task-1' })

        expect(rows[0]).toEqual(
            expect.objectContaining({
                providerRequestId: 'task-1',
                providerState: 'submitted',
                usageAvailability: 'pending',
                artifactState: 'pending',
                artifactErrorCode: null,
                reconciliationState: 'ready',
                completedAt: null,
                errorCode: null,
                reconciliationErrorCode: null
            })
        )
    })

    it('recovers synchronous image usage from a late deterministic observation', async () => {
        const { service, rows } = createService()
        const record = service.createRecorder(scope())
        const { invocationId } = await record(startEvent())
        const unknownCompletedAt = new Date('2026-08-14T00:01:00.000Z')
        Object.assign(rows[0], {
            providerState: 'acceptance_unknown',
            usageAvailability: 'unknown',
            reconciliationState: 'blocked',
            completedAt: unknownCompletedAt,
            errorCode: 'provider_acceptance_unknown',
            reconciliationErrorCode: 'provider_request_id_missing'
        })

        await record({
            phase: 'observe',
            invocationId,
            state: 'succeeded',
            usageAvailability: 'available',
            metrics: [{ unit: 'token', totalTokens: 128, authority: 'provider' }],
            artifactState: 'ready'
        })

        expect(rows[0]).toEqual(
            expect.objectContaining({
                providerState: 'succeeded',
                usageAvailability: 'available',
                metrics: [{ unit: 'token', totalTokens: 128, authority: 'provider' }],
                artifactState: 'ready',
                reconciliationState: 'finished',
                errorCode: null,
                reconciliationErrorCode: null
            })
        )
        expect(rows[0].completedAt).not.toBe(unknownCompletedAt)
    })

    it('keeps a successful invocation reconcilable when request fallback is still needed', async () => {
        const { service, rows } = createService()
        const record = service.createRecorder(scope())
        const { invocationId } = await record(startEvent())
        await record({ phase: 'bind', invocationId, providerRequestId: 'task-1' })

        await record({
            phase: 'observe',
            invocationId,
            state: 'succeeded',
            usageAvailability: 'unknown',
            reconciliation: 'continue'
        })

        expect(rows[0]).toEqual(
            expect.objectContaining({
                providerState: 'succeeded',
                usageAvailability: 'unknown',
                reconciliationState: 'ready',
                completedAt: expect.any(Date)
            })
        )
    })

    it('resets reconciliation failures in the same observation transaction', async () => {
        const { service, rows } = createService()
        const record = service.createRecorder(scope())
        const { invocationId } = await record(startEvent())
        await record({ phase: 'bind', invocationId, providerRequestId: 'task-1' })
        rows[0].reconcileAttempts = 3
        rows[0].reconciliationErrorCode = 'provider_query_failed'

        await service.observePersisted(rows[0], {
            phase: 'observe',
            invocationId,
            providerRequestId: 'task-1',
            state: 'processing',
            usageAvailability: 'pending'
        })

        expect(rows[0]).toEqual(
            expect.objectContaining({
                reconcileAttempts: 0,
                reconciliationErrorCode: null
            })
        )
    })

    it('returns direct per-execution summaries from durable invocation rows', async () => {
        const { service, rows } = createService()
        rows.push(
            invocationRow({
                id: 'invocation-1',
                originExecutionId: 'execution-1',
                metrics: [{ unit: 'generation', quantity: 1, authority: 'provider' }]
            }),
            invocationRow({
                id: 'invocation-2',
                originExecutionId: 'execution-2',
                providerState: 'processing',
                usageAvailability: 'pending',
                metrics: null,
                completedAt: null,
                reconciliationState: 'ready'
            })
        )

        const summaries = await service.getUsageSummaries(['execution-1', 'execution-2'], 'tenant-1')

        expect(summaries.get('execution-1')).toEqual(expect.objectContaining({ videoGenerations: 1 }))
        expect(summaries.get('execution-2')).toEqual(expect.objectContaining({ pendingVideoInvocations: 1 }))
    })
})

function scope() {
    return {
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        userId: 'user-1',
        agentKey: 'agent-1',
        toolsetId: 'toolset-1',
        providerScopeId: 'toolset-1',
        copilotId: 'copilot-1',
        resolveOrigin: () => ({ type: 'execution' as const, id: 'execution-1', executionId: 'execution-1' })
    }
}

function startEvent(): ModelInvocationEvent {
    return {
        phase: 'start',
        invocationKey: 'tool-call-1',
        provider: 'kling',
        model: 'kling-v3',
        toolName: 'kling_text_to_video',
        operation: 'text_to_video',
        modality: 'video'
    }
}

function invocationRow(overrides: Partial<ModelInvocation> = {}): ModelInvocation {
    return Object.assign(new ModelInvocation(), {
        id: 'invocation-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        invocationKey: 'tool-call-1',
        originType: 'execution',
        originId: 'execution-1',
        originExecutionId: 'execution-1',
        userId: 'user-1',
        agentKey: 'agent-1',
        toolsetId: 'toolset-1',
        providerScopeId: 'toolset-1',
        copilotId: 'copilot-1',
        provider: 'kling',
        modelType: 'video',
        model: 'kling-v3',
        toolName: 'kling_text_to_video',
        operation: 'text_to_video',
        modality: 'video',
        providerRequestId: 'task-1',
        providerState: 'succeeded',
        usageAvailability: 'available',
        metrics: [],
        pricingDimensions: null,
        rawUsage: null,
        artifactState: 'pending',
        artifactErrorCode: null,
        reconciliationState: 'finished',
        nextReconcileAt: null,
        reconcileAttempts: 0,
        startedAt: new Date('2026-08-14T00:00:00.000Z'),
        completedAt: new Date('2026-08-14T00:01:00.000Z'),
        errorCode: null,
        ...overrides
    })
}

function createService() {
    const rows: ModelInvocation[] = []
    const findOne = jest.fn(async ({ where }: { where: Partial<ModelInvocation> }) => {
        return rows.find((row) => matches(row, where)) ?? null
    })
    const save = jest.fn(async (row: ModelInvocation) => {
        const index = rows.findIndex((item) => item.id === row.id)
        if (index >= 0) {
            rows[index] = row
        } else {
            rows.push(row)
        }
        return row
    })
    const builder = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockImplementation((value: ModelInvocation) => {
            builder.pending = value
            return builder
        }),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn(async () => {
            const pending = builder.pending
            if (
                pending &&
                !rows.some(
                    (row) =>
                        row.tenantId === pending.tenantId &&
                        row.originType === pending.originType &&
                        row.originId === pending.originId &&
                        row.invocationKey === pending.invocationKey
                )
            ) {
                rows.push(pending)
            }
            return { identifiers: [], generatedMaps: [], raw: [] }
        }),
        pending: null as ModelInvocation | null
    }
    const repository = {
        create: jest.fn((value: Partial<ModelInvocation>) => Object.assign(new ModelInvocation(), value)),
        createQueryBuilder: jest.fn(() => builder),
        findOne,
        find: jest.fn(async ({ where }: { where: { originExecutionId: { _value: string[] } } }) =>
            rows.filter((row) => where.originExecutionId._value.includes(row.originExecutionId))
        ),
        save,
        manager: {
            transaction: jest.fn(
                async (
                    work: (manager: {
                        findOne: (
                            entity: typeof ModelInvocation,
                            options: { where: Partial<ModelInvocation> }
                        ) => Promise<ModelInvocation | null>
                        save: typeof save
                        find: jest.Mock
                    }) => unknown
                ) =>
                    work({
                        findOne: async (_entity, options) => findOne(options),
                        save,
                        find: jest.fn().mockResolvedValue([])
                    })
            )
        }
    }
    return {
        rows,
        service: new ModelInvocationService(
            repository as unknown as Repository<ModelInvocation>,
            { recordInvocation: jest.fn().mockResolvedValue([]) } as never,
            { recordInvocation: jest.fn().mockResolvedValue(undefined) } as never,
            { enqueue: jest.fn().mockResolvedValue(undefined) } as never
        )
    }
}

function matches(row: ModelInvocation, where: Partial<ModelInvocation>): boolean {
    return Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value)
}
