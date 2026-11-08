import { FEEDBACK_LEARNING_STRATEGY, type EvolutionChangeOperation, type EvaluationRun } from '@xpert-ai/contracts'
import { Test } from '@nestjs/testing'
import { EntityManager } from 'typeorm'
import { ConformanceFieldMappingProvider } from '../providers'
import { AgentEvolutionStore } from '../application/agent-evolution.store'
import { AgentEvolutionQualityGovernanceService } from '../application/agent-evolution-quality-governance.service'
import { EvolutionChangeStore } from './change.store'
import { EvolutionEvaluationExecutor } from './evaluation-executor.service'

it('retains per-case provider metrics and rejects a domain regression despite improved aggregate accuracy', async () => {
    const provider = new ConformanceFieldMappingProvider()
    const scope = { type: 'project' as const, key: 'A' }
    const cases = Array.from({ length: 50 }, (_, i) => ({ caseId: String(i), slice: 'affected', risk: 'high' }))
    const store = {
        findDataset: async () => ({
            value: {
                targetId: provider.descriptor.targetId,
                scope,
                cases,
                snapshotId: 'ds',
                snapshotHash: 'ds-hash',
                evaluatorVersion: 'eval-1',
                metricDefinitionVersion: 'metric-1'
            }
        }),
        findVersion: async () => ({ value: { artifact: { hash: 'base' } } }),
        saveBundle: jest.fn(),
        saveEvaluation: jest.fn()
    }
    const module = await Test.createTestingModule({
        providers: [
            EvolutionEvaluationExecutor,
            AgentEvolutionQualityGovernanceService,
            { provide: AgentEvolutionStore, useValue: store },
            { provide: EvolutionChangeStore, useValue: {} }
        ]
    }).compile()
    jest.spyOn(provider, 'runReplayCase').mockImplementation(async ({ caseRevision }) => ({
        caseId: caseRevision.caseId,
        baselinePassed: false,
        candidatePassed: true,
        severeError: false,
        latencyMs: 1,
        cost: 0,
        expectedOutput: {},
        baselineOutput: {},
        candidateOutput: {},
        traceRef: 'probe'
    }))
    const metric = { metricKey: 'regression', value: 1, unit: 'count' as const, slice: 'affected', blocking: true }
    const evaluator = jest.spyOn(provider, 'evaluateResult').mockResolvedValue([metric])
    const step = FEEDBACK_LEARNING_STRATEGY.evaluations[0]
    const operation: EvolutionChangeOperation = {
        context: {
            tenantId: 'tenant',
            organizationId: 'org',
            targetId: provider.descriptor.targetId,
            scope,
            actor: { actorId: 'worker', actorType: 'system' },
            correlationId: 'change'
        },
        change: {
            contractVersion: 3,
            sourceKind: 'learning_events',
            strategy: {
                definition: FEEDBACK_LEARNING_STRATEGY,
                riskLevel: 'R2',
                providerKey: 'provider',
                providerVersion: '1',
                hash: 'strategy'
            },
            learningEventIds: [],
            candidateInput: {},
            datasetSnapshotIds: { [step.key]: 'ds' },
            stages: [],
            changeId: 'change',
            targetId: provider.descriptor.targetId,
            requestId: 'request',
            scope,
            baseline: { hash: 'base', resourceId: 'v1', version: '1' },
            evidence: [],
            evidenceHash: 'evidence',
            status: 'testing',
            jobId: 'job',
            createdBy: 'worker',
            createdAt: '',
            updatedAt: '',
            candidate: {
                baseline: { hash: 'base', resourceId: 'v1', version: '1' },
                artifact: { hash: 'candidate', uri: 'candidate', mediaType: 'application/json', schemaVersion: '1' },
                changes: [],
                summary: 'candidate',
                warnings: []
            }
        }
    }
    const result = await module.get(EvolutionEvaluationExecutor).run(operation, provider, new EntityManager(null))
    const raw: EvaluationRun = store.saveEvaluation.mock.calls[0][1]
    expect(evaluator).toHaveBeenCalledTimes(50)
    expect(evaluator.mock.calls[0][0]).toMatchObject({
        metricDefinitionVersion: 'metric-1',
        evaluatorVersion: 'eval-1'
    })
    expect(raw.metrics.accuracyDelta).toBe(1)
    expect(raw.caseResults[0].observations).toEqual([metric])
    expect(raw.gate.blockingReasons).toEqual(['provider_metric:regression'])
    expect(result.passed).toBe(false)
    evaluator.mockResolvedValueOnce([{ ...metric, value: Number.NaN }])
    await expect(
        module.get(EvolutionEvaluationExecutor).run(operation, provider, new EntityManager(null))
    ).rejects.toThrow()
    await module.close()
})
