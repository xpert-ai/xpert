import type {
    ActiveCapabilityPointer,
    ApprovalDecision,
    CapabilityVersion,
    CapabilityVersionBundle,
    DatasetSnapshot,
    EvaluationRun,
    EvolutionChannel,
    EvolutionAuditEvent,
    EvolutionCandidate,
    EvolutionCandidateStatus,
    EvolutionPersistenceEvidence,
    EvolutionPersistenceTable,
    EvolutionReleaseStatus,
    EvolutionScope,
    EvolutionTargetDescriptor,
    ImprovementProposal,
    LearningEvent,
    ReleaseDeployment,
    ReleasePackage
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, IsNull, Repository } from 'typeorm'
import {
    ActiveCapabilityPointerEntity,
    ApprovalDecisionEntity,
    CapabilityVersionBundleEntity,
    CapabilityVersionEntity,
    DatasetSnapshotEntity,
    EvaluationRunEntity,
    EvolutionAuditEventEntity,
    EvolutionCandidateEntity,
    EvolutionTargetEntity,
    ImprovementProposalEntity,
    LearningEventEntity,
    ReleaseDeploymentEntity,
    ReleasePackageEntity
} from '../entities'
import { assertCandidateTransition, assertReleaseTransition } from '../domain/evolution-state'

export interface EvolutionTenantScope {
    tenantId: string
    organizationId?: string | null
}

export interface EvolutionPersistenceReferences {
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

@Injectable()
export class AgentEvolutionStore {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(EvolutionTargetEntity) private readonly targetRepository: Repository<EvolutionTargetEntity>,
        @InjectRepository(CapabilityVersionEntity)
        private readonly versionRepository: Repository<CapabilityVersionEntity>,
        @InjectRepository(CapabilityVersionBundleEntity)
        private readonly bundleRepository: Repository<CapabilityVersionBundleEntity>,
        @InjectRepository(ActiveCapabilityPointerEntity)
        private readonly pointerRepository: Repository<ActiveCapabilityPointerEntity>,
        @InjectRepository(LearningEventEntity) private readonly eventRepository: Repository<LearningEventEntity>,
        @InjectRepository(ImprovementProposalEntity)
        private readonly proposalRepository: Repository<ImprovementProposalEntity>,
        @InjectRepository(EvolutionCandidateEntity)
        private readonly candidateRepository: Repository<EvolutionCandidateEntity>,
        @InjectRepository(DatasetSnapshotEntity)
        private readonly datasetRepository: Repository<DatasetSnapshotEntity>,
        @InjectRepository(EvaluationRunEntity)
        private readonly evaluationRepository: Repository<EvaluationRunEntity>,
        @InjectRepository(ApprovalDecisionEntity)
        private readonly approvalRepository: Repository<ApprovalDecisionEntity>,
        @InjectRepository(ReleasePackageEntity)
        private readonly releaseRepository: Repository<ReleasePackageEntity>,
        @InjectRepository(ReleaseDeploymentEntity)
        private readonly deploymentRepository: Repository<ReleaseDeploymentEntity>,
        @InjectRepository(EvolutionAuditEventEntity)
        private readonly auditRepository: Repository<EvolutionAuditEventEntity>
    ) {}

    async upsertTarget(tenant: EvolutionTenantScope, descriptor: EvolutionTargetDescriptor) {
        const existing = await this.targetRepository.findOne({
            where: { ...tenantWhere(tenant), targetId: descriptor.targetId }
        })
        return this.targetRepository.save(
            this.targetRepository.create({
                ...existing,
                ...tenantValues(tenant),
                targetId: descriptor.targetId,
                providerKey: descriptor.providerKey,
                status: descriptor.status,
                descriptor
            })
        )
    }

    async findVersion(tenant: EvolutionTenantScope, versionId: string) {
        return this.versionRepository.findOne({ where: { ...tenantWhere(tenant), versionId } })
    }

    async saveVersion(tenant: EvolutionTenantScope, version: CapabilityVersion) {
        const existing = await this.findVersion(tenant, version.versionId)
        if (existing && existing.artifactHash !== version.artifact.hash) {
            throw new Error(`Immutable capability version '${version.versionId}' has a different artifact hash`)
        }
        return this.versionRepository.save(
            this.versionRepository.create({
                ...existing,
                ...tenantValues(tenant),
                versionId: version.versionId,
                targetId: version.targetId,
                sequence: version.sequence,
                artifactHash: version.artifact.hash,
                sourceCandidateId: version.sourceCandidateId ?? null,
                value: version
            })
        )
    }

    async saveBundle(tenant: EvolutionTenantScope, bundle: CapabilityVersionBundle) {
        const existing = await this.bundleRepository.findOne({
            where: { ...tenantWhere(tenant), bundleId: bundle.bundleId }
        })
        if (existing && existing.bundleHash !== bundle.bundleHash) {
            throw new Error(`Immutable capability bundle '${bundle.bundleId}' has a different hash`)
        }
        return this.bundleRepository.save(
            this.bundleRepository.create({
                ...existing,
                ...tenantValues(tenant),
                bundleId: bundle.bundleId,
                bundleHash: bundle.bundleHash,
                value: bundle
            })
        )
    }

    async findPointer(
        tenant: EvolutionTenantScope,
        targetId: string,
        scope: EvolutionScope,
        channel: EvolutionChannel = 'production'
    ) {
        return this.pointerRepository.findOne({
            where: {
                ...tenantWhere(tenant),
                targetId,
                scopeType: scope.type,
                scopeKey: scope.key,
                channel
            }
        })
    }

    async savePointer(tenant: EvolutionTenantScope, pointer: ActiveCapabilityPointer) {
        const existing = await this.findPointer(tenant, pointer.targetId, pointer.scope, pointer.channel)
        return this.pointerRepository.save(
            this.pointerRepository.create({
                ...existing,
                ...tenantValues(tenant),
                pointerId: pointer.pointerId,
                targetId: pointer.targetId,
                scopeType: pointer.scope.type,
                scopeKey: pointer.scope.key,
                channel: pointer.channel,
                activeVersionId: pointer.activeVersionId,
                revision: pointer.revision,
                value: pointer
            })
        )
    }

    async saveLearningEvent(tenant: EvolutionTenantScope, event: LearningEvent) {
        const existing = await this.eventRepository.findOne({
            where: { ...tenantWhere(tenant), idempotencyKey: event.idempotencyKey }
        })
        if (existing) {
            return existing
        }
        return this.eventRepository.save(
            this.eventRepository.create({
                ...tenantValues(tenant),
                scopeType: event.scope.type,
                scopeKey: event.scope.key,
                eventId: event.eventId,
                idempotencyKey: event.idempotencyKey,
                targetId: event.targetId,
                bundleHash: event.bundleHash,
                value: event
            })
        )
    }

    async saveProposal(tenant: EvolutionTenantScope, proposal: ImprovementProposal) {
        return this.proposalRepository.save(
            this.proposalRepository.create({
                ...tenantValues(tenant),
                scopeType: proposal.scope.type,
                scopeKey: proposal.scope.key,
                proposalId: proposal.proposalId,
                revision: proposal.revision,
                targetId: proposal.targetId,
                status: proposal.status,
                value: proposal
            })
        )
    }

    async saveCandidate(tenant: EvolutionTenantScope, candidate: EvolutionCandidate) {
        const existing = await this.candidateRepository.findOne({
            where: { ...tenantWhere(tenant), candidateId: candidate.candidateId }
        })
        if (existing && existing.artifactHash !== candidate.artifact.hash) {
            throw new Error(`Immutable candidate '${candidate.candidateId}' has a different artifact hash`)
        }
        return this.candidateRepository.save(
            this.candidateRepository.create({
                ...existing,
                ...tenantValues(tenant),
                scopeType: candidate.targetScope.type,
                scopeKey: candidate.targetScope.key,
                candidateId: candidate.candidateId,
                targetId: candidate.targetId,
                artifactHash: candidate.artifact.hash,
                status: candidate.status,
                value: candidate
            })
        )
    }

    async transitionCandidate(tenant: EvolutionTenantScope, candidateId: string, status: EvolutionCandidateStatus) {
        const entity = await this.candidateRepository.findOneOrFail({
            where: { ...tenantWhere(tenant), candidateId }
        })
        assertCandidateTransition(entity.status, status)
        entity.status = status
        entity.value = { ...entity.value, status }
        return this.candidateRepository.save(entity)
    }

    saveDataset(tenant: EvolutionTenantScope, snapshot: DatasetSnapshot) {
        return this.datasetRepository.save(
            this.datasetRepository.create({
                ...tenantValues(tenant),
                snapshotId: snapshot.snapshotId,
                datasetId: snapshot.datasetId,
                snapshotHash: snapshot.snapshotHash,
                value: snapshot
            })
        )
    }

    saveEvaluation(tenant: EvolutionTenantScope, evaluation: EvaluationRun) {
        return this.evaluationRepository.save(
            this.evaluationRepository.create({
                ...tenantValues(tenant),
                runId: evaluation.runId,
                candidateId: evaluation.candidateId,
                status: evaluation.status,
                gatePassed: evaluation.gate.passed,
                value: evaluation
            })
        )
    }

    saveApproval(tenant: EvolutionTenantScope, approval: ApprovalDecision) {
        return this.approvalRepository.save(
            this.approvalRepository.create({
                ...tenantValues(tenant),
                scopeType: approval.scope.type,
                scopeKey: approval.scope.key,
                approvalId: approval.approvalId,
                candidateId: approval.candidateId,
                candidateHash: approval.candidateHash,
                decision: approval.decision,
                value: approval
            })
        )
    }

    async saveRelease(tenant: EvolutionTenantScope, release: ReleasePackage) {
        const existing = await this.releaseRepository.findOne({
            where: { ...tenantWhere(tenant), releasePackageId: release.releasePackageId }
        })
        return this.releaseRepository.save(
            this.releaseRepository.create({
                ...existing,
                ...tenantValues(tenant),
                scopeType: release.scope.type,
                scopeKey: release.scope.key,
                releasePackageId: release.releasePackageId,
                candidateId: release.candidateId,
                targetId: release.targetId,
                status: release.status,
                value: release
            })
        )
    }

    async transitionRelease(tenant: EvolutionTenantScope, releasePackageId: string, status: EvolutionReleaseStatus) {
        const entity = await this.releaseRepository.findOneOrFail({
            where: { ...tenantWhere(tenant), releasePackageId }
        })
        assertReleaseTransition(entity.status, status)
        entity.status = status
        entity.value = { ...entity.value, status }
        return this.releaseRepository.save(entity)
    }

    async saveDeployment(tenant: EvolutionTenantScope, deployment: ReleaseDeployment) {
        const existing = await this.deploymentRepository.findOne({
            where: { ...tenantWhere(tenant), deploymentId: deployment.deploymentId }
        })
        return this.deploymentRepository.save(
            this.deploymentRepository.create({
                ...existing,
                ...tenantValues(tenant),
                scopeType: deployment.scope.type,
                scopeKey: deployment.scope.key,
                deploymentId: deployment.deploymentId,
                releasePackageId: deployment.releasePackageId,
                channel: deployment.channel,
                status: deployment.status,
                value: deployment
            })
        )
    }

    saveAudit(tenant: EvolutionTenantScope, audit: EvolutionAuditEvent) {
        return this.auditRepository.save(
            this.auditRepository.create({
                ...tenantValues(tenant),
                auditId: audit.auditId,
                releasePackageId: audit.releasePackageId ?? null,
                candidateId: audit.candidateId ?? null,
                action: audit.action,
                value: audit
            })
        )
    }

    async activatePointerCas(input: {
        tenant: EvolutionTenantScope
        pointerId: string
        expectedRevision: number
        expectedVersionId: string
        newVersionId: string
        releasePackageId: string
        actorId: string
        actorRole: string
        occurredAt: string
    }) {
        return this.dataSource.transaction(async (manager) => {
            const pointerRepository = manager.getRepository(ActiveCapabilityPointerEntity)
            const releaseRepository = manager.getRepository(ReleasePackageEntity)
            const auditRepository = manager.getRepository(EvolutionAuditEventEntity)
            const pointer = await pointerRepository.findOneOrFail({
                where: { ...tenantWhere(input.tenant), pointerId: input.pointerId }
            })
            const nextPointer: ActiveCapabilityPointer = {
                ...pointer.value,
                activeVersionId: input.newVersionId,
                rollbackVersionId: input.expectedVersionId,
                releasePackageId: input.releasePackageId,
                revision: input.expectedRevision + 1,
                updatedAt: input.occurredAt,
                updatedBy: input.actorId
            }
            const pointerUpdate = await pointerRepository.update(
                {
                    ...tenantWhere(input.tenant),
                    pointerId: input.pointerId,
                    revision: input.expectedRevision,
                    activeVersionId: input.expectedVersionId
                },
                {
                    activeVersionId: nextPointer.activeVersionId,
                    revision: nextPointer.revision,
                    value: nextPointer
                }
            )
            if (pointerUpdate.affected !== 1) {
                throw new Error('Active Pointer CAS conflict')
            }
            const release = await releaseRepository.findOneOrFail({
                where: { ...tenantWhere(input.tenant), releasePackageId: input.releasePackageId }
            })
            assertReleaseTransition(release.status, 'active')
            release.status = 'active'
            release.value = { ...release.value, status: 'active' }
            const audit: EvolutionAuditEvent = {
                auditId: `AUD-${input.releasePackageId}-activate`,
                releasePackageId: input.releasePackageId,
                candidateId: release.candidateId,
                action: 'active_pointer.cas_activated',
                actorId: input.actorId,
                actorRole: input.actorRole,
                summary: `${input.expectedVersionId} -> ${input.newVersionId}; revision ${input.expectedRevision} -> ${input.expectedRevision + 1}`,
                occurredAt: input.occurredAt
            }
            await releaseRepository.save(release)
            await auditRepository.save(
                auditRepository.create({
                    ...tenantValues(input.tenant),
                    auditId: audit.auditId,
                    releasePackageId: input.releasePackageId,
                    candidateId: release.candidateId,
                    action: audit.action,
                    value: audit
                })
            )
            return nextPointer
        })
    }

    async getDashboard(tenant: EvolutionTenantScope) {
        const [
            targets,
            versions,
            bundles,
            events,
            proposals,
            candidates,
            datasets,
            evaluations,
            approvals,
            releases,
            deployments,
            pointers,
            audits
        ] = await Promise.all([
            this.targetRepository.find({ where: tenantWhere(tenant), order: { targetId: 'ASC' } }),
            this.versionRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 100 }),
            this.bundleRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 100 }),
            this.eventRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 100 }),
            this.proposalRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 50 }),
            this.candidateRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 50 }),
            this.datasetRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 20 }),
            this.evaluationRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 20 }),
            this.approvalRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 50 }),
            this.releaseRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 20 }),
            this.deploymentRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 30 }),
            this.pointerRepository.find({ where: tenantWhere(tenant), order: { updatedAt: 'DESC' } }),
            this.auditRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 100 })
        ])
        return {
            targets: targets.map((item) => item.descriptor),
            versions: versions.map((item) => item.value),
            bundles: bundles.map((item) => item.value),
            events: events.map((item) => item.value),
            proposals: proposals.map((item) => item.value),
            candidates: candidates.map((item) => item.value),
            datasets: datasets.map((item) => item.value),
            evaluations: evaluations.map((item) => item.value),
            approvals: approvals.map((item) => item.value),
            releases: releases.map((item) => item.value),
            deployments: deployments.map((item) => item.value),
            pointers: pointers.map((item) => item.value),
            audits: audits.map((item) => item.value)
        }
    }

    async verifyPersistence(
        tenant: EvolutionTenantScope,
        references: EvolutionPersistenceReferences
    ): Promise<EvolutionPersistenceEvidence> {
        const [
            targets,
            versions,
            bundles,
            pointers,
            events,
            proposals,
            candidates,
            datasets,
            evaluations,
            approvals,
            releases,
            deployments,
            audits
        ] = await Promise.all([
            this.targetRepository.find({
                where: { ...tenantWhere(tenant), targetId: In(references.targetIds) }
            }),
            this.versionRepository.find({
                where: { ...tenantWhere(tenant), versionId: In(references.versionIds) }
            }),
            this.bundleRepository.find({
                where: { ...tenantWhere(tenant), bundleId: In(references.bundleIds) }
            }),
            this.pointerRepository.find({
                where: { ...tenantWhere(tenant), pointerId: In(references.pointerIds) }
            }),
            this.eventRepository.find({
                where: { ...tenantWhere(tenant), eventId: In(references.eventIds) }
            }),
            this.proposalRepository.find({
                where: { ...tenantWhere(tenant), proposalId: In(references.proposalIds) }
            }),
            this.candidateRepository.find({
                where: { ...tenantWhere(tenant), candidateId: In(references.candidateIds) }
            }),
            this.datasetRepository.find({
                where: { ...tenantWhere(tenant), snapshotId: In(references.datasetSnapshotIds) }
            }),
            this.evaluationRepository.find({
                where: { ...tenantWhere(tenant), runId: In(references.evaluationRunIds) }
            }),
            this.approvalRepository.find({
                where: { ...tenantWhere(tenant), approvalId: In(references.approvalIds) }
            }),
            this.releaseRepository.find({
                where: { ...tenantWhere(tenant), releasePackageId: In(references.releasePackageIds) }
            }),
            this.deploymentRepository.find({
                where: { ...tenantWhere(tenant), deploymentId: In(references.deploymentIds) }
            }),
            this.auditRepository.find({
                where: { ...tenantWhere(tenant), auditId: In(references.auditIds) }
            })
        ])
        const tables = [
            persistenceTable(
                'agent_evolution_target',
                references.targetIds,
                targets.map((item) => item.targetId)
            ),
            persistenceTable(
                'agent_evolution_capability_version',
                references.versionIds,
                versions.map((item) => item.versionId)
            ),
            persistenceTable(
                'agent_evolution_capability_bundle',
                references.bundleIds,
                bundles.map((item) => item.bundleId)
            ),
            persistenceTable(
                'agent_evolution_active_pointer',
                references.pointerIds,
                pointers.map((item) => item.pointerId)
            ),
            persistenceTable(
                'agent_evolution_learning_event',
                references.eventIds,
                events.map((item) => item.eventId)
            ),
            persistenceTable(
                'agent_evolution_proposal',
                references.proposalIds,
                proposals.map((item) => item.proposalId)
            ),
            persistenceTable(
                'agent_evolution_candidate',
                references.candidateIds,
                candidates.map((item) => item.candidateId)
            ),
            persistenceTable(
                'agent_evolution_dataset_snapshot',
                references.datasetSnapshotIds,
                datasets.map((item) => item.snapshotId)
            ),
            persistenceTable(
                'agent_evolution_evaluation_run',
                references.evaluationRunIds,
                evaluations.map((item) => item.runId)
            ),
            persistenceTable(
                'agent_evolution_approval',
                references.approvalIds,
                approvals.map((item) => item.approvalId)
            ),
            persistenceTable(
                'agent_evolution_release_package',
                references.releasePackageIds,
                releases.map((item) => item.releasePackageId)
            ),
            persistenceTable(
                'agent_evolution_release_deployment',
                references.deploymentIds,
                deployments.map((item) => item.deploymentId)
            ),
            persistenceTable(
                'agent_evolution_audit_event',
                references.auditIds,
                audits.map((item) => item.auditId)
            )
        ]
        return {
            verified: tables.every((table) => table.missingRecordIds.length === 0),
            rowCount: tables.reduce((sum, table) => sum + table.actualCount, 0),
            tables
        }
    }
}

function persistenceTable(table: EvolutionPersistenceTable, expectedIds: string[], actualIds: string[]) {
    const actual = [...new Set(actualIds)].sort()
    const expected = [...new Set(expectedIds)].sort()
    return {
        table,
        expectedCount: expected.length,
        actualCount: actual.length,
        recordIds: actual,
        missingRecordIds: expected.filter((id) => !actual.includes(id))
    }
}

function tenantValues(tenant: EvolutionTenantScope) {
    return {
        tenantId: tenant.tenantId,
        organizationId: tenant.organizationId ?? null
    }
}

function tenantWhere(tenant: EvolutionTenantScope) {
    return {
        tenantId: tenant.tenantId,
        organizationId: tenant.organizationId ?? IsNull()
    }
}
