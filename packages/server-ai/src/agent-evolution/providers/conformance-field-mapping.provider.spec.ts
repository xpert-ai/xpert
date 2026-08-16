import type { BuildEvolutionCandidateRequest, CapabilityVersionBundle, ReplayCaseRequest } from '@xpert-ai/contracts'
import { ConformanceFieldMappingProvider } from './conformance-field-mapping.provider'

describe('ConformanceFieldMappingProvider', () => {
    const provider = new ConformanceFieldMappingProvider()
    const buildRequest: BuildEvolutionCandidateRequest = {
        targetId: provider.descriptor.targetId,
        scope: { type: 'organization', key: 'org-1' },
        proposalId: 'proposal-1',
        proposalRevision: 1,
        baseVersionId: 'v1',
        changeSet: { aliases: ['金额'] },
        evidenceEventIds: ['event-2', 'event-1'],
        dependencyVersionIds: [],
        actorId: 'user-1',
        idempotencyKey: 'proposal-1:1'
    }

    it('returns the same artifact and build-input hashes for identical inputs', async () => {
        const first = await provider.buildCandidate(buildRequest)
        const second = await provider.buildCandidate(buildRequest)

        expect(first.artifact.hash).toBe(second.artifact.hash)
        expect(first.buildInputsHash).toBe(second.buildInputsHash)
        expect(first.artifact.uri).toBe(second.artifact.uri)
    })

    it('replays baseline and candidate against the exact same golden case', async () => {
        const bundle = (
            mode: CapabilityVersionBundle['executionMode'],
            versionId: string
        ): CapabilityVersionBundle => ({
            bundleId: `bundle-${versionId}`,
            bundleHash: `hash-${versionId}`,
            executionMode: mode,
            items: [
                {
                    targetId: provider.descriptor.targetId,
                    versionId,
                    artifactHash: `hash-${versionId}`,
                    providerKey: provider.descriptor.providerKey,
                    providerVersion: provider.descriptor.providerVersion
                }
            ],
            createdAt: '2026-08-13T00:00:00.000Z'
        })
        const request: ReplayCaseRequest = {
            evaluationRunId: 'run-1',
            candidateId: 'candidate-1',
            datasetSnapshotId: 'snapshot-1',
            caseRevision: {
                caseId: 'case-1',
                revision: 1,
                input: { sourceField: '金额', value: '1234.56' },
                expected: { field: 'amount', value: '1234.56' },
                slice: 'localized',
                risk: 'low',
                evidenceRef: 'fixture://case-1'
            },
            baselineBundle: bundle('production', 'v1'),
            candidateBundle: bundle('replay', 'candidate-1'),
            randomSeed: 42,
            repeatIndex: 0
        }

        const result = await provider.runReplayCase(request)

        expect(result.baselinePassed).toBe(false)
        expect(result.candidatePassed).toBe(true)
        expect(result.expectedOutput).toEqual(request.caseRevision.expected)
    })
})
