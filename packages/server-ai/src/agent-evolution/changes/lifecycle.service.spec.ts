import { EvolutionLifecycleService } from './lifecycle.service'
import type { DataSource } from 'typeorm'
import type { EvolutionChangeService } from './change.service'
import { HUMAN_PROPOSAL_STRATEGY, type EvolutionChange } from '@xpert-ai/contracts'

jest.mock('@xpert-ai/plugin-sdk', () => ({
    EvolutionChangeRuntimeCapability: 'changes',
    EvolutionTargetProviderRegistry: class {},
    MANAGED_QUEUE_SERVICE_TOKEN: 'queue'
}))
jest.mock('@xpert-ai/server-core', () => ({ RequestContext: {} }))
jest.mock('../../shared/runtime', () => ({ RuntimeCapabilityProvider: () => () => undefined }))
jest.mock('../application/agent-evolution.store', () => ({ AgentEvolutionStore: class {} }))
jest.mock('../entities/evolution.entities', () => ({ ReleasePackageEntity: class {} }))

it('does not send command actor fields to the release entity query after a decision', async () => {
    const change: EvolutionChange = {
        contractVersion: 3,
        changeId: 'CHANGE',
        requestId: 'REQ',
        targetId: 'template',
        strategy: {
            definition: HUMAN_PROPOSAL_STRATEGY,
            riskLevel: 'R1',
            hash: 'plan',
            providerKey: 'template',
            providerVersion: '1'
        },
        scope: { type: 'organization', key: 'org' },
        baseline: { resourceId: 'base', version: '1', hash: 'base' },
        sourceKind: 'manual',
        evidence: [],
        evidenceHash: 'evidence',
        candidateInput: {},
        datasetSnapshotIds: {},
        learningEventIds: [],
        stages: [],
        status: 'approved',
        jobId: 'job',
        createdBy: 'reviewer',
        createdAt: '',
        updatedAt: ''
    }
    const findOneBy = jest.fn(async (where) => {
        expect(Object.keys(where).sort()).toEqual(['organizationId', 'releasePackageId', 'tenantId'])
        return null
    })
    const db = { getRepository: () => ({ findOneBy }) } as unknown as DataSource
    const changes = { decide: jest.fn(), get: jest.fn(async () => change) } as unknown as EvolutionChangeService
    const service = new EvolutionLifecycleService(db, changes)
    const result = await service.decide(
        { tenantId: 'tenant', organizationId: 'org', actorId: 'reviewer', actorType: 'human', actorRole: 'admin' },
        'CHANGE',
        { candidateHash: 'hash', evaluationRunId: 'run', decision: 'approved', reason: 'Reviewed' }
    )
    expect(result.publicationStatus).toBe('publishing')
    expect(findOneBy).toHaveBeenCalledTimes(1)
})
