import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { ModelInvocation } from './model-invocation.entity'
import { ModelInvocationReconciliationService } from './model-invocation-reconciliation.service'

describe('ModelInvocationReconciliationService', () => {
    it('blocks stale starts as acceptance unknown instead of resubmitting them', async () => {
        const invocation = invocationRow()
        invocation.providerState = 'started'
        invocation.providerRequestId = null
        const { service, invocationRepository, queue, createModelClient } = createService(invocation)

        await expect(service.markStaleUnboundInvocations(25)).resolves.toBe(1)

        expect(invocationRepository.save).toHaveBeenCalledWith([invocation])
        expect(invocation).toEqual(
            expect.objectContaining({
                providerState: 'acceptance_unknown',
                usageAvailability: 'unknown',
                reconciliationState: 'blocked',
                errorCode: 'provider_acceptance_unknown'
            })
        )
        expect(queue.enqueue).not.toHaveBeenCalled()
        expect(createModelClient).not.toHaveBeenCalled()
    })

    it('enqueues due database records without calling the Provider from the repair sweep', async () => {
        const invocation = invocationRow()
        const { service, queue, createModelClient } = createService(invocation)

        await expect(service.enqueueDueBatch(25)).resolves.toBe(1)

        expect(queue.enqueue).toHaveBeenCalledWith(invocation)
        expect(createModelClient).not.toHaveBeenCalled()
    })

    it('creates an observation client and persists one Provider query', async () => {
        const invocation = invocationRow()
        const query = jest.fn().mockResolvedValue({
            data: { status: 'succeeded' },
            observation: {
                state: 'succeeded',
                usageAvailability: 'available',
                metrics: [{ unit: 'generation', quantity: 1, authority: 'provider' }]
            }
        })
        const { service, invocationService, createModelClient } = createService(invocation, query)

        await service.reconcileOne(invocation.id)

        expect(createModelClient).toHaveBeenCalledWith(
            expect.objectContaining({
                copilotId: 'copilot-1',
                model: 'kling-v3',
                modelType: AiModelTypeEnum.VIDEO
            }),
            expect.objectContaining({ purpose: 'observe', skipTokenRecord: true }),
            expect.objectContaining({ providerScopeId: 'provider-scope-1' })
        )
        expect(query).toHaveBeenCalledWith('provider-task-1', expect.objectContaining({ operation: 'text_to_video' }))
        expect(invocationService.observePersisted).toHaveBeenCalledWith(
            invocation,
            expect.objectContaining({ state: 'succeeded', providerRequestId: 'provider-task-1' })
        )
    })

    it('records retry state and lets Managed Queue apply backoff when Provider query fails', async () => {
        const invocation = invocationRow()
        const { service } = createService(invocation, jest.fn().mockRejectedValue(new Error('provider unavailable')))

        await expect(service.reconcileOne(invocation.id)).rejects.toThrow('provider unavailable')

        expect(invocation).toEqual(
            expect.objectContaining({
                reconciliationState: 'retry_wait',
                reconciliationErrorCode: 'provider_query_failed',
                reconcileAttempts: 1
            })
        )
        expect(invocation.nextReconcileAt).toBeInstanceOf(Date)
    })

    it('requeries a succeeded invocation when authoritative usage is still pending', async () => {
        const invocation = invocationRow()
        invocation.providerState = 'succeeded'
        invocation.usageAvailability = 'unknown'
        invocation.reconciliationState = 'ready'
        const query = jest.fn().mockResolvedValue({
            data: { status: 'succeeded' },
            observation: {
                state: 'succeeded',
                usageAvailability: 'available',
                metrics: [{ unit: 'second', quantity: 5, authority: 'request' }]
            }
        })
        const { service, invocationService } = createService(invocation, query)

        await service.reconcileOne(invocation.id)

        expect(query).toHaveBeenCalledTimes(1)
        expect(invocationService.observePersisted).toHaveBeenCalledWith(
            invocation,
            expect.objectContaining({ usageAvailability: 'available' })
        )
    })

    it('does not save a terminal observation again outside the invocation transaction', async () => {
        const invocation = invocationRow()
        const observed = invocationRow()
        observed.providerState = 'succeeded'
        observed.reconciliationState = 'finished'
        const query = jest.fn().mockResolvedValue({
            data: { status: 'succeeded' },
            observation: {
                state: 'succeeded',
                usageAvailability: 'available',
                metrics: [{ unit: 'generation', quantity: 1, authority: 'provider' }]
            }
        })
        const { service, invocationRepository, invocationService } = createService(invocation, query)
        invocationService.observePersisted.mockResolvedValue(observed)

        await service.reconcileOne(invocation.id)

        expect(invocationRepository.save).not.toHaveBeenCalledWith(observed)
    })

    it('does not overwrite a terminal state when observation persistence has already committed', async () => {
        const invocation = invocationRow()
        const persisted = invocationRow()
        persisted.providerState = 'succeeded'
        persisted.reconciliationState = 'finished'
        const { service, invocationRepository, invocationService } = createService(invocation)
        invocationRepository.findOne.mockResolvedValueOnce(invocation).mockResolvedValueOnce(persisted)
        invocationService.observePersisted.mockRejectedValue(new Error('commit acknowledgement failed'))

        await expect(service.reconcileOne(invocation.id)).resolves.toBeUndefined()

        expect(invocationRepository.save).not.toHaveBeenCalledWith(
            expect.objectContaining({ reconciliationState: 'retry_wait' })
        )
    })
})

function createService(invocation: ModelInvocation, query = jest.fn()) {
    const invocationRepository = {
        find: jest.fn().mockResolvedValue([invocation]),
        findOne: jest.fn().mockResolvedValue(invocation),
        save: jest.fn(async (entity: ModelInvocation | ModelInvocation[]) => entity)
    }
    const invocationService = { observePersisted: jest.fn().mockResolvedValue(invocation) }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const createModelClient = jest.fn().mockResolvedValue({ query })
    const service = new ModelInvocationReconciliationService(
        invocationRepository as never,
        invocationService as never,
        queue as never,
        { createModelClient } as never
    )
    return { service, invocationRepository, invocationService, queue, createModelClient }
}

function invocationRow(): ModelInvocation {
    return Object.assign(new ModelInvocation(), {
        id: 'invocation-1',
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        userId: 'user-1',
        invocationKey: 'tool-call-1',
        originType: 'execution',
        originId: 'execution-1',
        originExecutionId: 'execution-1',
        agentKey: 'agent-1',
        toolsetId: 'toolset-1',
        providerScopeId: 'provider-scope-1',
        copilotId: 'copilot-1',
        provider: 'kling',
        modelType: AiModelTypeEnum.VIDEO,
        model: 'kling-v3',
        toolName: 'kling_text_to_video',
        operation: 'text_to_video',
        modality: 'video',
        providerRequestId: 'provider-task-1',
        providerState: 'processing',
        usageAvailability: 'pending',
        metrics: null,
        pricingDimensions: null,
        rawUsage: null,
        artifactState: 'pending',
        artifactErrorCode: null,
        reconciliationState: 'ready',
        nextReconcileAt: new Date('2026-08-14T00:00:00.000Z'),
        reconcileAttempts: 0,
        reconciliationErrorCode: null,
        startedAt: new Date('2026-08-14T00:00:00.000Z'),
        completedAt: null,
        lastObservedAt: null,
        errorCode: null
    })
}
