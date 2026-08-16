import type {
    ActiveCapabilityPointer,
    CapabilityVersion,
    EvolutionAuditEvent,
    EvolutionCandidate,
    EvolutionCandidateStatus,
    EvolutionPersistenceTable,
    EvolutionReleaseStatus,
    EvolutionTargetDescriptor,
    ReleaseDeployment,
    ReleasePackage
} from '@xpert-ai/contracts'
import { Test } from '@nestjs/testing'
import { EvolutionTargetProviderRegistry } from '@xpert-ai/plugin-sdk'
import { AgentEvolutionService } from './agent-evolution.service'
import { AgentEvolutionStore } from './agent-evolution.store'
import { ConformanceFieldMappingProvider, ConformanceIntentRoutingProvider } from '../providers'
import { assertCandidateTransition, assertReleaseTransition } from '../domain/evolution-state'

describe('AgentEvolutionService end-to-end conformance simulation', () => {
    it('moves immutable evidence through replay, governance, Shadow, Canary, and CAS activation', async () => {
        const fieldProvider = new ConformanceFieldMappingProvider()
        const routingProvider = new ConformanceIntentRoutingProvider()
        const state = createStoreState()
        const store = createStoreFixture(state)
        const registry = {
            listDescriptors: () => [fieldProvider.descriptor, routingProvider.descriptor],
            get: (targetId: string) => {
                if (targetId === fieldProvider.descriptor.targetId) return fieldProvider
                if (targetId === routingProvider.descriptor.targetId) return routingProvider
                throw new Error(`Unknown target ${targetId}`)
            }
        }
        const moduleRef = await Test.createTestingModule({
            providers: [
                AgentEvolutionService,
                { provide: AgentEvolutionStore, useValue: store },
                { provide: EvolutionTargetProviderRegistry, useValue: registry }
            ]
        }).compile()
        const service = moduleRef.get(AgentEvolutionService)

        const result = await service.runConformanceSimulation({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            actorId: 'reviewer-1',
            actorRole: 'governance_reviewer'
        })

        expect(result.gatePassed).toBe(true)
        expect(result.eventIds).toHaveLength(4)
        expect(result.deploymentIds).toHaveLength(2)
        expect(state.targets).toHaveLength(2)
        expect(state.events).toHaveLength(4)
        expect(state.proposals).toHaveLength(1)
        expect(state.candidates[0].status).toBe('packaged')
        expect(state.evaluations[0].metrics).toMatchObject({
            baselineAccuracy: 2 / 6,
            candidateAccuracy: 1,
            severeErrors: 0,
            totalCases: 6,
            passedCases: 6
        })
        expect(state.releases[0].status).toBe('active')
        expect(state.deployments.map((item) => item.channel)).toEqual(['shadow', 'canary'])
        expect(state.deployments.every((item) => item.dataSource === 'deterministic_replay')).toBe(true)
        expect(state.deployments.map((item) => item.observations.length)).toEqual([5, 5])
        expect(result.persistence).toMatchObject({ verified: true, rowCount: 23 })
        expect(result.persistence.tables).toHaveLength(13)
        expect(state.pointer).toMatchObject({
            activeVersionId: result.activeVersionId,
            rollbackVersionId: result.previousVersionId,
            revision: 2
        })
        expect(state.audits.map((item) => item.action)).toEqual(expect.arrayContaining(result.auditActions))
    })

    it('does not accept an Agent identity as the approval actor', async () => {
        const fieldProvider = new ConformanceFieldMappingProvider()
        const state = createStoreState()
        const moduleRef = await Test.createTestingModule({
            providers: [
                AgentEvolutionService,
                { provide: AgentEvolutionStore, useValue: createStoreFixture(state) },
                {
                    provide: EvolutionTargetProviderRegistry,
                    useValue: {
                        listDescriptors: () => [fieldProvider.descriptor],
                        get: () => fieldProvider
                    }
                }
            ]
        }).compile()
        const service = moduleRef.get(AgentEvolutionService)

        await expect(
            service.runConformanceSimulation({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                actorId: 'agent-1',
                actorRole: 'agent'
            })
        ).rejects.toThrow('Agent identity cannot satisfy a human approval decision')
        expect(state.releases).toHaveLength(0)
    })
})

function createStoreState() {
    return {
        targets: [] as EvolutionTargetDescriptor[],
        versions: new Map<string, CapabilityVersion>(),
        events: [] as Array<{ eventId: string }>,
        proposals: [] as Array<{ proposalId: string }>,
        candidates: [] as EvolutionCandidate[],
        datasets: [] as Array<{ snapshotId: string }>,
        evaluations: [] as Array<{
            runId: string
            metrics: {
                baselineAccuracy: number
                candidateAccuracy: number
                severeErrors: number
                totalCases: number
                passedCases: number
            }
            status: string
        }>,
        approvals: [] as Array<{ approvalId: string }>,
        releases: [] as ReleasePackage[],
        deployments: [] as ReleaseDeployment[],
        audits: [] as EvolutionAuditEvent[],
        pointer: null as ActiveCapabilityPointer | null
    }
}

function createStoreFixture(state: ReturnType<typeof createStoreState>) {
    return {
        upsertTarget: async (_tenant: object, descriptor: EvolutionTargetDescriptor) => {
            state.targets.push(descriptor)
            return { descriptor }
        },
        findVersion: async (_tenant: object, versionId: string) => {
            const value = state.versions.get(versionId)
            return value ? { value } : null
        },
        saveVersion: async (_tenant: object, value: CapabilityVersion) => {
            state.versions.set(value.versionId, value)
            return { value }
        },
        saveBundle: async (_tenant: object, value: object) => ({ value }),
        findPointer: async () => (state.pointer ? { ...state.pointer, value: state.pointer } : null),
        savePointer: async (_tenant: object, value: ActiveCapabilityPointer) => {
            state.pointer = value
            return { value }
        },
        saveLearningEvent: async (_tenant: object, value: { eventId: string }) => {
            state.events.push(value)
            return { value }
        },
        saveProposal: async (_tenant: object, value: { proposalId: string }) => {
            state.proposals.push(value)
            return { value }
        },
        saveCandidate: async (_tenant: object, value: EvolutionCandidate) => {
            state.candidates.push(value)
            return { value }
        },
        transitionCandidate: async (_tenant: object, candidateId: string, status: EvolutionCandidateStatus) => {
            const index = state.candidates.findIndex((item) => item.candidateId === candidateId)
            const current = state.candidates[index]
            assertCandidateTransition(current.status, status)
            const value = { ...current, status }
            state.candidates[index] = value
            return { value }
        },
        saveDataset: async (_tenant: object, value: { snapshotId: string }) => {
            state.datasets.push(value)
            return { value }
        },
        saveEvaluation: async (_tenant: object, value: (typeof state.evaluations)[number]) => {
            state.evaluations.push(value)
            return { value }
        },
        saveApproval: async (_tenant: object, value: { approvalId: string }) => {
            state.approvals.push(value)
            return { value }
        },
        saveRelease: async (_tenant: object, value: ReleasePackage) => {
            state.releases.push(value)
            return { value }
        },
        transitionRelease: async (_tenant: object, releasePackageId: string, status: EvolutionReleaseStatus) => {
            const index = state.releases.findIndex((item) => item.releasePackageId === releasePackageId)
            const current = state.releases[index]
            assertReleaseTransition(current.status, status)
            const value = { ...current, status }
            state.releases[index] = value
            return { value }
        },
        saveDeployment: async (_tenant: object, value: ReleaseDeployment) => {
            state.deployments.push(value)
            return { value }
        },
        saveAudit: async (_tenant: object, value: EvolutionAuditEvent) => {
            state.audits.push(value)
            return { value }
        },
        activatePointerCas: async (input: {
            expectedRevision: number
            expectedVersionId: string
            newVersionId: string
            releasePackageId: string
            actorId: string
            actorRole: string
            occurredAt: string
        }) => {
            if (
                !state.pointer ||
                state.pointer.revision !== input.expectedRevision ||
                state.pointer.activeVersionId !== input.expectedVersionId
            ) {
                throw new Error('Active Pointer CAS conflict')
            }
            state.pointer = {
                ...state.pointer,
                activeVersionId: input.newVersionId,
                rollbackVersionId: input.expectedVersionId,
                releasePackageId: input.releasePackageId,
                revision: input.expectedRevision + 1,
                updatedAt: input.occurredAt,
                updatedBy: input.actorId
            }
            const releaseIndex = state.releases.findIndex((item) => item.releasePackageId === input.releasePackageId)
            state.releases[releaseIndex] = { ...state.releases[releaseIndex], status: 'active' }
            state.audits.push({
                auditId: `AUD-${input.releasePackageId}-activate`,
                releasePackageId: input.releasePackageId,
                candidateId: state.releases[releaseIndex].candidateId,
                action: 'active_pointer.cas_activated',
                actorId: input.actorId,
                actorRole: input.actorRole,
                summary: 'CAS activated',
                occurredAt: input.occurredAt
            })
            return state.pointer
        },
        verifyPersistence: async (
            _tenant: object,
            references: {
                targetIds: string[]
                versionIds: string[]
                bundleIds: string[]
                pointerIds: string[]
                eventIds: string[]
                proposalIds: string[]
                candidateIds: string[]
                datasetSnapshotIds: string[]
                evaluationRunIds: string[]
                approvalIds: string[]
                releasePackageIds: string[]
                deploymentIds: string[]
                auditIds: string[]
            }
        ) => {
            const rows: Array<[EvolutionPersistenceTable, string[]]> = [
                ['agent_evolution_target', references.targetIds],
                ['agent_evolution_capability_version', references.versionIds],
                ['agent_evolution_capability_bundle', references.bundleIds],
                ['agent_evolution_active_pointer', references.pointerIds],
                ['agent_evolution_learning_event', references.eventIds],
                ['agent_evolution_proposal', references.proposalIds],
                ['agent_evolution_candidate', references.candidateIds],
                ['agent_evolution_dataset_snapshot', references.datasetSnapshotIds],
                ['agent_evolution_evaluation_run', references.evaluationRunIds],
                ['agent_evolution_approval', references.approvalIds],
                ['agent_evolution_release_package', references.releasePackageIds],
                ['agent_evolution_release_deployment', references.deploymentIds],
                ['agent_evolution_audit_event', references.auditIds]
            ]
            return {
                verified: true,
                rowCount: rows.reduce((sum, [, ids]) => sum + ids.length, 0),
                tables: rows.map(([table, recordIds]) => ({
                    table,
                    expectedCount: recordIds.length,
                    actualCount: recordIds.length,
                    recordIds,
                    missingRecordIds: []
                }))
            }
        },
        getDashboard: async () => ({
            targets: [],
            versions: [],
            bundles: [],
            events: [],
            proposals: [],
            candidates: [],
            datasets: [],
            evaluations: [],
            approvals: [],
            releases: [],
            deployments: [],
            pointers: [],
            audits: []
        })
    }
}
