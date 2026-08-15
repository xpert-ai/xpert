import { AiModelTypeEnum, type IModelInvocation, type ModelUsageMetric } from '@xpert-ai/contracts'
import {
    canAdvanceModelInvocationState,
    normalizeModelInvocationMetrics,
    summarizeModelInvocations
} from './model-invocation.utils'

describe('model invocation usage', () => {
    it('preserves partial Provider token usage without inventing a total', () => {
        const metrics = normalizeModelInvocationMetrics(
            [{ unit: 'token', completionTokens: 17, authority: 'provider' }],
            'available',
            'succeeded'
        )

        expect(metrics).toEqual([{ unit: 'token', completionTokens: 17, authority: 'provider' }])
        expect(summarizeModelInvocations([invocation({ metrics })])).toEqual(
            expect.objectContaining({
                videoPromptTokens: 0,
                videoCompletionTokens: 17,
                videoTokens: 0,
                unknownVideoUsage: 0
            })
        )
    })

    it('rejects request-authority seconds before Provider success', () => {
        expect(() =>
            normalizeModelInvocationMetrics(
                [{ unit: 'second', quantity: 8, authority: 'request' }],
                'available',
                'processing'
            )
        ).toThrow('Request or contract usage requires Provider success')
    })

    it('rejects invalid generation and second quantities', () => {
        expect(() =>
            normalizeModelInvocationMetrics(
                [{ unit: 'generation', quantity: 0, authority: 'provider' }],
                'available',
                'succeeded'
            )
        ).toThrow('Generation quantity must be a positive integer')
        expect(() =>
            normalizeModelInvocationMetrics(
                [{ unit: 'second', quantity: Number.NaN, authority: 'provider' }],
                'available',
                'succeeded'
            )
        ).toThrow('Second quantity must be a positive finite number')
    })

    it('does not allow a terminal Provider state to regress', () => {
        expect(canAdvanceModelInvocationState('succeeded', 'processing')).toBe(false)
        expect(canAdvanceModelInvocationState('failed', 'failed')).toBe(true)
        expect(canAdvanceModelInvocationState('submitted', 'processing')).toBe(true)
    })

    it('allows deterministic Provider evidence to correct acceptance unknown', () => {
        expect(canAdvanceModelInvocationState('acceptance_unknown', 'submitted')).toBe(true)
        expect(canAdvanceModelInvocationState('acceptance_unknown', 'processing')).toBe(true)
        expect(canAdvanceModelInvocationState('acceptance_unknown', 'succeeded')).toBe(true)
        expect(canAdvanceModelInvocationState('acceptance_unknown', 'failed')).toBe(true)
        expect(canAdvanceModelInvocationState('acceptance_unknown', 'started')).toBe(false)
    })

    it('deduplicates invocation rows while aggregating mixed units', () => {
        const metrics: ModelUsageMetric[] = [
            { unit: 'generation', quantity: 1, authority: 'provider' },
            { unit: 'second', quantity: 8, authority: 'provider' }
        ]
        const completed = invocation({ id: 'invocation-1', metrics })
        const pending = invocation({
            id: 'invocation-2',
            providerState: 'processing',
            usageAvailability: 'pending',
            metrics: null
        })
        const unknown = invocation({
            id: 'invocation-3',
            providerState: 'failed',
            usageAvailability: 'unknown',
            metrics: null
        })

        expect(summarizeModelInvocations([completed, completed, pending, unknown])).toEqual({
            videoPromptTokens: 0,
            videoCompletionTokens: 0,
            videoTokens: 0,
            videoGenerations: 1,
            generatedSeconds: 8,
            pendingVideoInvocations: 1,
            unknownVideoUsage: 1
        })
    })
})

function invocation(overrides: Partial<IModelInvocation> = {}): IModelInvocation {
    return {
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
        provider: 'provider-1',
        modelType: AiModelTypeEnum.VIDEO,
        model: 'video-model',
        toolName: 'video_submit',
        operation: 'text_to_video',
        modality: 'video',
        providerRequestId: 'provider-request-1',
        providerState: 'succeeded',
        usageAvailability: 'available',
        metrics: [],
        pricingDimensions: null,
        artifactState: 'pending',
        reconciliationState: 'finished',
        nextReconcileAt: null,
        reconcileAttempts: 0,
        startedAt: new Date('2026-08-14T00:00:00.000Z'),
        completedAt: new Date('2026-08-14T00:01:00.000Z'),
        ...overrides
    }
}
