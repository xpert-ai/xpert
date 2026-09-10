import {
    evidenceDrivenStrategy,
    FEEDBACK_LEARNING_STRATEGY,
    type EvolutionChange,
    type ReleasePackage
} from '@xpert-ai/contracts'
import { initialStages } from './strategy.service'
import { lifecycleRecord } from './lifecycle.projection'
const definition = evidenceDrivenStrategy({ version: '1', evidenceKinds: ['feedback'], requiredChecks: [] })
const change: EvolutionChange = {
    contractVersion: 3,
    strategy: { riskLevel: 'R1', definition, hash: 'plan', providerKey: 'test', providerVersion: '1' },
    sourceKind: 'business_evidence',
    learningEventIds: [],
    candidateInput: {},
    datasetSnapshotIds: {},
    stages: initialStages(definition),
    changeId: 'c',
    requestId: 'r',
    targetId: 'template',
    scope: { type: 'organization', key: 'o' },
    baseline: { resourceId: 'b', version: '1', hash: 'base' },
    evidence: [],
    evidenceHash: 'proof',
    status: 'published',
    jobId: 'j',
    createdBy: 'u',
    createdAt: '2026-09-08',
    updatedAt: '2026-09-08'
}
it('tracks publication independently from explicit adoption', () => {
    expect(lifecycleRecord(change)).toMatchObject({
        phase: 'publication',
        publicationStatus: 'published',
        effectStatus: 'pending'
    })
    expect(
        lifecycleRecord({
            ...change,
            presentation: { title: 'T', resourceLabel: 'Template', effect: { status: 'active', label: 'Active' } }
        })
    ).toMatchObject({ phase: 'effective', publicationStatus: 'published', effectStatus: 'active' })
})
it('groups a fully activated rollout with published versions while retaining Canary as a deployment stage', () => {
    const runtime = {
        ...change,
        sourceKind: 'manual' as const,
        strategy: { ...change.strategy, definition: FEEDBACK_LEARNING_STRATEGY }
    }
    const release: ReleasePackage = {
        publicationKind: 'staged_rollout',
        releasePackageId: 'PUB-c',
        candidateId: 'c',
        candidateHash: 'hash',
        targetId: 'template',
        targetVersionId: 'v2',
        rollbackVersionId: 'v1',
        evaluationRunId: 'e',
        scope: change.scope,
        status: 'canary',
        approvalIds: ['a'],
        artifactHash: 'hash',
        providerKey: 'test',
        providerVersion: '1',
        shadowMinimumSamples: 1,
        canaryPercent: 50,
        createdAt: '',
        createdBy: 'u'
    }
    expect(lifecycleRecord(runtime, release)).toMatchObject({
        status: 'canary',
        publicationStatus: 'publishing',
        effectStatus: 'partial'
    })
    expect(lifecycleRecord(runtime, { ...release, status: 'active' })).toMatchObject({
        status: 'active',
        publicationStatus: 'published',
        effectStatus: 'active'
    })
})
