import type {
    ActiveCapabilityPointer,
    ApprovalDecision,
    CapabilityVersion,
    CapabilityVersionBundle,
    DatasetSnapshot,
    EvaluationRun,
    EvolutionChannel,
    EvolutionAuditEvent,
    EvolutionCanaryTestOverride,
    EvolutionCandidate,
    EvolutionCandidateStatus,
    EvolutionPersistenceEvidence,
    EvolutionPersistenceTable,
    EvolutionReleaseStatus,
    EvolutionJob,
    EvolutionJobStatus,
    EvolutionPage,
    EvolutionPageQuery,
    EvolutionRuntimeObservation,
    EvolutionDiagnosis,
    EvolutionEventCluster,
    EvolutionExperience,
    EvolutionScope,
    EvolutionTargetDescriptor,
    ImprovementProposal,
    LearningEvent,
    ReleaseDeployment,
    ReleasePackage
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'crypto'
import { DataSource, In, IsNull, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm'
import {
    ActiveCapabilityPointerEntity,
    ApprovalDecisionEntity,
    CapabilityVersionBundleEntity,
    CapabilityVersionEntity,
    DatasetSnapshotEntity,
    EvaluationRunEntity,
    EvolutionAuditEventEntity,
    EvolutionCanaryTestOverrideEntity,
    EvolutionCandidateEntity,
    EvolutionJobEntity,
    EvolutionRuntimeObservationEntity,
    EvolutionDiagnosisEntity,
    EvolutionEventClusterEntity,
    EvolutionExperienceEntity,
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
        @InjectRepository(EvolutionDiagnosisEntity)
        private readonly diagnosisRepository: Repository<EvolutionDiagnosisEntity>,
        @InjectRepository(EvolutionEventClusterEntity)
        private readonly clusterRepository: Repository<EvolutionEventClusterEntity>,
        @InjectRepository(EvolutionExperienceEntity)
        private readonly experienceRepository: Repository<EvolutionExperienceEntity>,
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
        @InjectRepository(EvolutionCanaryTestOverrideEntity)
        private readonly canaryTestOverrideRepository: Repository<EvolutionCanaryTestOverrideEntity>,
        @InjectRepository(EvolutionAuditEventEntity)
        private readonly auditRepository: Repository<EvolutionAuditEventEntity>,
        @InjectRepository(EvolutionRuntimeObservationEntity)
        private readonly observationRepository: Repository<EvolutionRuntimeObservationEntity>,
        @InjectRepository(EvolutionJobEntity)
        private readonly jobRepository: Repository<EvolutionJobEntity>
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

    async findTarget(tenant: EvolutionTenantScope, targetId: string) {
        return this.targetRepository.findOne({ where: { ...tenantWhere(tenant), targetId } })
    }

    async findVersion(tenant: EvolutionTenantScope, versionId: string) {
        return this.versionRepository.findOne({ where: { ...tenantWhere(tenant), versionId } })
    }

    async findBundle(tenant: EvolutionTenantScope, bundleId: string) {
        return this.bundleRepository.findOne({ where: { ...tenantWhere(tenant), bundleId } })
    }

    async findCandidate(tenant: EvolutionTenantScope, candidateId: string) {
        return this.candidateRepository.findOne({ where: { ...tenantWhere(tenant), candidateId } })
    }

    async findProposal(tenant: EvolutionTenantScope, proposalId: string, revision: number) {
        return this.proposalRepository.findOne({
            where: { ...tenantWhere(tenant), proposalId, revision }
        })
    }

    async findApproval(tenant: EvolutionTenantScope, approvalId: string) {
        return this.approvalRepository.findOne({ where: { ...tenantWhere(tenant), approvalId } })
    }

    async listApprovalsForCandidate(tenant: EvolutionTenantScope, candidateId: string) {
        return this.approvalRepository.find({
            where: { ...tenantWhere(tenant), candidateId },
            order: { createdAt: 'ASC' }
        })
    }

    async findLatestVersionForTarget(tenant: EvolutionTenantScope, targetId: string) {
        return this.versionRepository.findOne({
            where: { ...tenantWhere(tenant), targetId },
            order: { sequence: 'DESC' }
        })
    }

    async findEvaluation(tenant: EvolutionTenantScope, runId: string) {
        return this.evaluationRepository.findOne({ where: { ...tenantWhere(tenant), runId } })
    }

    async findRelease(tenant: EvolutionTenantScope, releasePackageId: string) {
        return this.releaseRepository.findOne({ where: { ...tenantWhere(tenant), releasePackageId } })
    }

    async findDataset(tenant: EvolutionTenantScope, snapshotId: string) {
        return this.datasetRepository.findOne({ where: { ...tenantWhere(tenant), snapshotId } })
    }

    async listTargets(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        const pagination = normalizePage(query)
        const qb = this.targetRepository.createQueryBuilder('target').where('target.tenantId = :tenantId', {
            tenantId: tenant.tenantId
        })
        applyOrganizationScope(qb, tenant, 'target')
        if (query.search) {
            qb.andWhere('(target.targetId ILIKE :search OR target.providerKey ILIKE :search)', {
                search: `%${query.search}%`
            })
        }
        if (query.status) qb.andWhere('target.status = :status', { status: query.status })
        const [items, total] = await qb
            .orderBy('target.targetId', query.order ?? 'ASC')
            .skip(pagination.skip)
            .take(pagination.pageSize)
            .getManyAndCount()
        return page(
            items.map((item) => item.descriptor),
            total,
            pagination
        )
    }

    async listLearningEvents(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        const pagination = normalizePage(query)
        const qb = this.eventRepository.createQueryBuilder('event').where('event.tenantId = :tenantId', {
            tenantId: tenant.tenantId
        })
        applyOrganizationScope(qb, tenant, 'event')
        if (query.targetId) qb.andWhere('event.targetId = :targetId', { targetId: query.targetId })
        if (query.status) qb.andWhere("event.value ->> 'reviewStatus' = :status", { status: query.status })
        if (query.search) {
            qb.andWhere(
                "(event.eventId ILIKE :search OR event.value ->> 'subjectRef' ILIKE :search OR event.value ->> 'predictionSummary' ILIKE :search)",
                { search: `%${query.search}%` }
            )
        }
        const [items, total] = await qb
            .orderBy('event.createdAt', query.order ?? 'DESC')
            .skip(pagination.skip)
            .take(pagination.pageSize)
            .getManyAndCount()
        return page(
            items.map((item) => item.value),
            total,
            pagination
        )
    }

    async listCapabilityVersions(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        return this.listJsonValues(this.versionRepository, tenant, query, 'version', 'targetId')
    }

    async listCapabilityBundles(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        return this.listJsonValues(this.bundleRepository, tenant, query, 'bundle')
    }

    async listActivePointers(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        return this.listJsonValues(this.pointerRepository, tenant, query, 'pointer', 'targetId', 'channel')
    }

    async listProposals(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        return this.listJsonValues(this.proposalRepository, tenant, query, 'proposal', 'targetId', 'status')
    }

    async reviewLearningEvent(
        tenant: EvolutionTenantScope,
        eventId: string,
        reviewStatus: NonNullable<LearningEvent['reviewStatus']>
    ) {
        const entity = await this.eventRepository.findOneOrFail({ where: { ...tenantWhere(tenant), eventId } })
        entity.value = { ...entity.value, reviewStatus }
        return (await this.eventRepository.save(entity)).value
    }

    async listCandidates(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        return this.listJsonValues(this.candidateRepository, tenant, query, 'candidate', 'targetId', 'status')
    }

    async listDatasets(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        return this.listJsonValues(this.datasetRepository, tenant, query, 'dataset', undefined, undefined, true)
    }

    async listEvaluations(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        return this.listJsonValues(this.evaluationRepository, tenant, query, 'evaluation', undefined, 'status', true)
    }

    async listReleases(
        tenant: EvolutionTenantScope,
        query: EvolutionPageQuery = {}
    ): Promise<EvolutionPage<ReleasePackage>> {
        return this.listJsonValues(this.releaseRepository, tenant, query, 'release', 'targetId', 'status')
    }

    async listDeployments(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        return this.listJsonValues(this.deploymentRepository, tenant, query, 'deployment', undefined, 'status')
    }

    async listRuntimeObservations(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        return this.listJsonValues(this.observationRepository, tenant, query, 'observation', 'targetId')
    }

    async listAuditEvents(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        return this.listJsonValues(this.auditRepository, tenant, query, 'audit', undefined, 'action')
    }

    async listDeploymentsForTarget(tenant: EvolutionTenantScope, targetId: string) {
        const releases = await this.releaseRepository.find({
            where: { ...tenantWhere(tenant), targetId }
        })
        if (!releases.length) return []
        return this.deploymentRepository.find({
            where: {
                ...tenantWhere(tenant),
                releasePackageId: In(releases.map((item) => item.releasePackageId))
            },
            order: { createdAt: 'DESC' }
        })
    }

    async listDeploymentsForRelease(tenant: EvolutionTenantScope, releasePackageId: string) {
        return this.deploymentRepository.find({
            where: { ...tenantWhere(tenant), releasePackageId },
            order: { createdAt: 'DESC' }
        })
    }

    async listCanaryTestOverrides(tenant: EvolutionTenantScope, releasePackageId: string) {
        const entities = await this.canaryTestOverrideRepository.find({
            where: { ...tenantWhere(tenant), releasePackageId },
            order: { createdAt: 'DESC' }
        })
        const now = Date.now()
        const expired = entities.filter((entity) => entity.status === 'pending' && entity.expiresAt.getTime() <= now)
        if (expired.length) {
            await this.canaryTestOverrideRepository.save(
                expired.map((entity) => {
                    entity.status = 'expired'
                    entity.activeKey = null
                    entity.value = { ...entity.value, status: 'expired' }
                    return entity
                })
            )
        }
        return entities.map((entity) => entity.value)
    }

    async createCanaryTestOverride(
        tenant: EvolutionTenantScope,
        override: EvolutionCanaryTestOverride,
        audit: EvolutionAuditEvent
    ) {
        return this.dataSource.transaction(async (manager) => {
            const overrideRepository = manager.getRepository(EvolutionCanaryTestOverrideEntity)
            const auditRepository = manager.getRepository(EvolutionAuditEventEntity)
            const activeKey = canaryTestOverrideActiveKey(tenant, override.deploymentId, override.subjectKey)
            const existing = await overrideRepository.findOne({
                where: { ...tenantWhere(tenant), activeKey }
            })
            if (existing && existing.expiresAt.getTime() > Date.now()) return existing.value
            if (existing) {
                existing.status = 'expired'
                existing.activeKey = null
                existing.value = { ...existing.value, status: 'expired' }
                await overrideRepository.save(existing)
            }
            await overrideRepository.save(
                overrideRepository.create({
                    ...tenantValues(tenant),
                    scopeType: override.scope.type,
                    scopeKey: override.scope.key,
                    overrideId: override.overrideId,
                    releasePackageId: override.releasePackageId,
                    candidateId: override.candidateId,
                    deploymentId: override.deploymentId,
                    targetId: override.targetId,
                    subjectKey: override.subjectKey,
                    activeKey,
                    status: override.status,
                    expiresAt: new Date(override.expiresAt),
                    value: override
                })
            )
            await auditRepository.save(
                auditRepository.create({
                    ...tenantValues(tenant),
                    auditId: audit.auditId,
                    releasePackageId: audit.releasePackageId ?? null,
                    candidateId: audit.candidateId ?? null,
                    action: audit.action,
                    value: audit
                })
            )
            return override
        })
    }

    async consumeCanaryTestOverride(input: {
        tenant: EvolutionTenantScope
        releasePackageId: string
        candidateId: string
        deploymentId: string
        targetId: string
        subjectKey: string
        executionId: string
        consumedAt: string
    }) {
        return this.dataSource.transaction(async (manager) => {
            const overrideRepository = manager.getRepository(EvolutionCanaryTestOverrideEntity)
            const auditRepository = manager.getRepository(EvolutionAuditEventEntity)
            const retried = await overrideRepository.findOne({
                where: {
                    ...tenantWhere(input.tenant),
                    releasePackageId: input.releasePackageId,
                    deploymentId: input.deploymentId,
                    targetId: input.targetId,
                    subjectKey: input.subjectKey,
                    status: 'consumed'
                },
                order: { createdAt: 'DESC' }
            })
            if (retried?.value.consumedByExecutionId === input.executionId) return retried.value

            const entity = await overrideRepository.findOne({
                where: {
                    ...tenantWhere(input.tenant),
                    releasePackageId: input.releasePackageId,
                    deploymentId: input.deploymentId,
                    targetId: input.targetId,
                    subjectKey: input.subjectKey,
                    status: 'pending'
                },
                lock: { mode: 'pessimistic_write' }
            })
            if (!entity) return null
            if (entity.expiresAt.getTime() <= Date.now()) {
                entity.status = 'expired'
                entity.activeKey = null
                entity.value = { ...entity.value, status: 'expired' }
                await overrideRepository.save(entity)
                return null
            }

            const consumed: EvolutionCanaryTestOverride = {
                ...entity.value,
                status: 'consumed',
                consumedAt: input.consumedAt,
                consumedByExecutionId: input.executionId
            }
            entity.status = 'consumed'
            entity.activeKey = null
            entity.value = consumed
            await overrideRepository.save(entity)
            const audit: EvolutionAuditEvent = {
                auditId: `AUD-${entity.overrideId}-consumed`,
                releasePackageId: input.releasePackageId,
                candidateId: input.candidateId,
                action: 'canary.manual_test_override_consumed',
                actorId: 'agent-evolution-runtime',
                actorRole: 'system_runtime_resolver',
                summary: `One-time manual-test Candidate override consumed for subject '${input.subjectKey}' during execution '${input.executionId}'.`,
                metadata: {
                    manualTestOverrideId: entity.overrideId,
                    deploymentId: input.deploymentId,
                    subjectKey: input.subjectKey,
                    executionId: input.executionId,
                    overrideStatus: 'consumed'
                },
                occurredAt: input.consumedAt
            }
            await auditRepository.save(
                auditRepository.create({
                    ...tenantValues(input.tenant),
                    auditId: audit.auditId,
                    releasePackageId: audit.releasePackageId ?? null,
                    candidateId: audit.candidateId ?? null,
                    action: audit.action,
                    value: audit
                })
            )
            return consumed
        })
    }

    async completeDeployment(tenant: EvolutionTenantScope, deploymentId: string, completedAt: string) {
        const deployment = await this.deploymentRepository.findOneOrFail({
            where: { ...tenantWhere(tenant), deploymentId }
        })
        deployment.value = { ...deployment.value, completedAt }
        return this.deploymentRepository.save(deployment)
    }

    async saveRuntimeObservation(tenant: EvolutionTenantScope, observation: EvolutionRuntimeObservation) {
        return this.dataSource.transaction(async (manager) => {
            const observationRepository = manager.getRepository(EvolutionRuntimeObservationEntity)
            const deploymentRepository = manager.getRepository(ReleaseDeploymentEntity)
            const releaseRepository = manager.getRepository(ReleasePackageEntity)
            const auditRepository = manager.getRepository(EvolutionAuditEventEntity)
            const existing = await observationRepository.findOne({
                where: { ...tenantWhere(tenant), observationId: observation.observationId }
            })
            if (existing) return existing.value
            const saved = await observationRepository.save(
                observationRepository.create({
                    ...tenantValues(tenant),
                    scopeType: observation.scope.type,
                    scopeKey: observation.scope.key,
                    observationId: observation.observationId,
                    targetId: observation.targetId,
                    deploymentId: observation.deploymentId ?? null,
                    executionId: observation.executionId,
                    severeError: observation.severeError,
                    value: observation
                })
            )
            if (observation.deploymentId) {
                const deployment = await deploymentRepository.findOne({
                    where: { ...tenantWhere(tenant), deploymentId: observation.deploymentId },
                    lock: { mode: 'pessimistic_write' }
                })
                if (!deployment) return saved.value
                const previousCount = deployment.value.sampleCount
                const sampleCount = previousCount + 1
                const candidateAccuracy =
                    (deployment.value.candidateAccuracy * previousCount + (observation.success ? 1 : 0)) / sampleCount
                const severeErrors = deployment.value.severeErrors + (observation.severeError ? 1 : 0)
                const previousObservation = deployment.value.observations.at(-1)
                const runtimeObservation = {
                    observationId: observation.observationId,
                    observedAt: observation.observedAt,
                    sequence: sampleCount,
                    sampleCount,
                    baselineAccuracy: previousObservation?.baselineAccuracy ?? candidateAccuracy,
                    candidateAccuracy,
                    severeErrors,
                    p95LatencyMs: Math.max(previousObservation?.p95LatencyMs ?? 0, observation.latencyMs),
                    averageCost:
                        ((previousObservation?.averageCost ?? 0) * previousCount + (observation.cost ?? 0)) /
                        sampleCount
                }
                deployment.value = {
                    ...deployment.value,
                    sampleCount,
                    candidateAccuracy,
                    severeErrors,
                    observations: [...deployment.value.observations, runtimeObservation]
                }
                await deploymentRepository.save(deployment)
                if (observation.severeError) {
                    const release = await releaseRepository.findOne({
                        where: { ...tenantWhere(tenant), releasePackageId: deployment.releasePackageId },
                        lock: { mode: 'pessimistic_write' }
                    })
                    if (release && (release.status === 'shadow' || release.status === 'canary')) {
                        assertReleaseTransition(release.status, 'paused')
                        release.status = 'paused'
                        release.value = { ...release.value, status: 'paused' }
                        const audit: EvolutionAuditEvent = {
                            auditId: `AUD-${observation.observationId}-auto-pause`,
                            releasePackageId: release.releasePackageId,
                            candidateId: release.candidateId,
                            action: 'deployment.auto_paused',
                            actorId: 'agent-evolution-runtime',
                            actorRole: 'system_safety_guard',
                            summary: `Deployment automatically paused after severe runtime observation ${observation.observationId}.`,
                            occurredAt: observation.observedAt
                        }
                        await releaseRepository.save(release)
                        await auditRepository.save(
                            auditRepository.create({
                                ...tenantValues(tenant),
                                auditId: audit.auditId,
                                releasePackageId: release.releasePackageId,
                                candidateId: release.candidateId,
                                action: audit.action,
                                value: audit
                            })
                        )
                    }
                }
            }
            return saved.value
        })
    }

    async saveJob(tenant: EvolutionTenantScope, job: EvolutionJob) {
        const existing = await this.jobRepository.findOne({ where: { ...tenantWhere(tenant), jobId: job.jobId } })
        const saved = await this.jobRepository.save(
            this.jobRepository.create({
                ...existing,
                ...tenantValues(tenant),
                jobId: job.jobId,
                jobType: job.jobType,
                resourceId: job.resourceId,
                status: job.status,
                value: job
            })
        )
        return saved.value
    }

    async findJob(tenant: EvolutionTenantScope, jobId: string) {
        const entity = await this.jobRepository.findOne({ where: { ...tenantWhere(tenant), jobId } })
        return entity?.value ?? null
    }

    async updateJobStatus(
        tenant: EvolutionTenantScope,
        jobId: string,
        status: EvolutionJobStatus,
        patch: Partial<
            Pick<EvolutionJob, 'queueJobId' | 'errorCode' | 'errorMessage' | 'startedAt' | 'completedAt'>
        > = {}
    ) {
        const entity = await this.jobRepository.findOneOrFail({ where: { ...tenantWhere(tenant), jobId } })
        entity.status = status
        entity.value = { ...entity.value, ...patch, status }
        return (await this.jobRepository.save(entity)).value
    }

    private async listJsonValues<TEntity extends ObjectLiteral & { value: TValue }, TValue>(
        repository: Repository<TEntity>,
        tenant: EvolutionTenantScope,
        query: EvolutionPageQuery,
        alias: string,
        targetColumn?: string,
        statusColumn?: string,
        targetInValue = false
    ): Promise<EvolutionPage<TValue>> {
        const pagination = normalizePage(query)
        const qb = repository.createQueryBuilder(alias).where(`${alias}.tenantId = :tenantId`, {
            tenantId: tenant.tenantId
        })
        applyOrganizationScope(qb, tenant, alias)
        if (query.targetId && targetColumn) {
            qb.andWhere(`${alias}.${targetColumn} = :targetId`, { targetId: query.targetId })
        } else if (query.targetId && targetInValue) {
            qb.andWhere(`${alias}.value ->> 'targetId' = :targetId`, { targetId: query.targetId })
        }
        if (query.status && statusColumn) qb.andWhere(`${alias}.${statusColumn} = :status`, { status: query.status })
        const sortColumn = query.sort === 'updatedAt' ? 'updatedAt' : 'createdAt'
        const [items, total] = await qb
            .orderBy(`${alias}.${sortColumn}`, query.order ?? 'DESC')
            .skip(pagination.skip)
            .take(pagination.pageSize)
            .getManyAndCount()
        return page(
            items.map((item) => item.value),
            total,
            pagination
        )
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

    async findLearningEvents(tenant: EvolutionTenantScope, eventIds: string[]) {
        if (!eventIds.length) return []
        return this.eventRepository.find({ where: { ...tenantWhere(tenant), eventId: In(eventIds) } })
    }

    async saveDiagnosis(tenant: EvolutionTenantScope, diagnosis: EvolutionDiagnosis) {
        return this.diagnosisRepository.save(
            this.diagnosisRepository.create({
                ...tenantValues(tenant),
                scopeType: diagnosis.scope.type,
                scopeKey: diagnosis.scope.key,
                diagnosisId: diagnosis.diagnosisId,
                targetId: diagnosis.targetId,
                correctionSignature: diagnosis.correctionSignature,
                value: diagnosis
            })
        )
    }

    async saveEventCluster(tenant: EvolutionTenantScope, cluster: EvolutionEventCluster) {
        const existing = await this.clusterRepository.findOne({
            where: {
                ...tenantWhere(tenant),
                targetId: cluster.targetId,
                scopeType: cluster.scope.type,
                scopeKey: cluster.scope.key,
                correctionSignature: cluster.correctionSignature
            }
        })
        return this.clusterRepository.save(
            this.clusterRepository.create({
                ...existing,
                ...tenantValues(tenant),
                scopeType: cluster.scope.type,
                scopeKey: cluster.scope.key,
                clusterId: existing?.clusterId ?? cluster.clusterId,
                targetId: cluster.targetId,
                correctionSignature: cluster.correctionSignature,
                status: cluster.status,
                value: existing
                    ? {
                          ...cluster,
                          clusterId: existing.clusterId,
                          eventIds: [...new Set([...existing.value.eventIds, ...cluster.eventIds])],
                          caseCount: Math.max(existing.value.caseCount, cluster.caseCount),
                          createdAt: existing.value.createdAt
                      }
                    : cluster
            })
        )
    }

    async listDiagnoses(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        const pagination = normalizePage(query)
        const [items, total] = await this.diagnosisRepository.findAndCount({
            where: { ...tenantWhere(tenant), ...(query.targetId ? { targetId: query.targetId } : {}) },
            order: { createdAt: query.order ?? 'DESC' },
            skip: pagination.skip,
            take: pagination.pageSize
        })
        return page(
            items.map((item) => item.value),
            total,
            pagination
        )
    }

    async listEventClusters(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        const pagination = normalizePage(query)
        const [items, total] = await this.clusterRepository.findAndCount({
            where: {
                ...tenantWhere(tenant),
                ...(query.targetId ? { targetId: query.targetId } : {}),
                ...(query.status ? { status: query.status as EvolutionEventCluster['status'] } : {})
            },
            order: { updatedAt: query.order ?? 'DESC' },
            skip: pagination.skip,
            take: pagination.pageSize
        })
        return page(
            items.map((item) => item.value),
            total,
            pagination
        )
    }

    async saveExperience(tenant: EvolutionTenantScope, experience: EvolutionExperience) {
        const existing = await this.experienceRepository.findOne({
            where: { ...tenantWhere(tenant), sourceReleasePackageId: experience.sourceReleasePackageId }
        })
        return this.experienceRepository.save(
            this.experienceRepository.create({
                ...existing,
                ...tenantValues(tenant),
                scopeType: experience.scope.type,
                scopeKey: experience.scope.key,
                experienceId: existing?.experienceId ?? experience.experienceId,
                targetId: experience.targetId,
                sourceReleasePackageId: experience.sourceReleasePackageId,
                status: experience.status,
                value: existing
                    ? { ...experience, experienceId: existing.experienceId, createdAt: existing.value.createdAt }
                    : experience
            })
        )
    }

    async listExperiences(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        const pagination = normalizePage(query)
        const [items, total] = await this.experienceRepository.findAndCount({
            where: {
                ...tenantWhere(tenant),
                ...(query.targetId ? { targetId: query.targetId } : {}),
                ...(query.status ? { status: query.status as EvolutionExperience['status'] } : {})
            },
            order: { createdAt: query.order ?? 'DESC' },
            skip: pagination.skip,
            take: pagination.pageSize
        })
        return page(
            items.map((item) => item.value),
            total,
            pagination
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

    async updateProposalStatus(
        tenant: EvolutionTenantScope,
        proposalId: string,
        revision: number,
        status: ImprovementProposal['status']
    ) {
        const entity = await this.proposalRepository.findOneOrFail({
            where: { ...tenantWhere(tenant), proposalId, revision }
        })
        entity.status = status
        entity.value = { ...entity.value, status }
        return (await this.proposalRepository.save(entity)).value
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

    async rollbackPointerCas(input: {
        tenant: EvolutionTenantScope
        pointerId: string
        expectedRevision: number
        expectedVersionId: string
        rollbackVersionId: string
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
                activeVersionId: input.rollbackVersionId,
                rollbackVersionId: input.expectedVersionId,
                releasePackageId: input.releasePackageId,
                revision: input.expectedRevision + 1,
                updatedAt: input.occurredAt,
                updatedBy: input.actorId
            }
            const update = await pointerRepository.update(
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
            if (update.affected !== 1) throw new Error('Active Pointer rollback CAS conflict')
            const release = await releaseRepository.findOneOrFail({
                where: { ...tenantWhere(input.tenant), releasePackageId: input.releasePackageId }
            })
            assertReleaseTransition(release.status, 'rolled_back')
            release.status = 'rolled_back'
            release.value = { ...release.value, status: 'rolled_back' }
            const audit: EvolutionAuditEvent = {
                auditId: `AUD-${input.releasePackageId}-rollback-${input.expectedRevision + 1}`,
                releasePackageId: input.releasePackageId,
                candidateId: release.candidateId,
                action: 'active_pointer.cas_rolled_back',
                actorId: input.actorId,
                actorRole: input.actorRole,
                summary: `${input.expectedVersionId} -> ${input.rollbackVersionId}; revision ${input.expectedRevision} -> ${input.expectedRevision + 1}`,
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
            audits,
            canaryTestOverrides
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
            this.auditRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 100 }),
            this.canaryTestOverrideRepository.find({
                where: tenantWhere(tenant),
                order: { createdAt: 'DESC' },
                take: 50
            })
        ])
        const expiredCanaryTestOverrides = canaryTestOverrides.filter(
            (entity) => entity.status === 'pending' && entity.expiresAt.getTime() <= Date.now()
        )
        if (expiredCanaryTestOverrides.length) {
            await this.canaryTestOverrideRepository.save(
                expiredCanaryTestOverrides.map((entity) => {
                    entity.status = 'expired'
                    entity.activeKey = null
                    entity.value = { ...entity.value, status: 'expired' }
                    return entity
                })
            )
        }
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
            audits: audits.map((item) => item.value),
            canaryTestOverrides: canaryTestOverrides.map((item) => item.value)
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

interface NormalizedEvolutionPage {
    page: number
    pageSize: number
    skip: number
}

function normalizePage(query: EvolutionPageQuery): NormalizedEvolutionPage {
    const pageNumber = Number(query.page ?? 1)
    const pageSizeNumber = Number(query.pageSize ?? 20)
    const page = Number.isFinite(pageNumber) ? Math.max(1, Math.trunc(pageNumber)) : 1
    const pageSize = Number.isFinite(pageSizeNumber) ? Math.min(100, Math.max(1, Math.trunc(pageSizeNumber))) : 20
    return { page, pageSize, skip: (page - 1) * pageSize }
}

function page<T>(items: T[], total: number, pagination: NormalizedEvolutionPage): EvolutionPage<T> {
    return { items, total, page: pagination.page, pageSize: pagination.pageSize }
}

function applyOrganizationScope<TEntity extends ObjectLiteral>(
    qb: SelectQueryBuilder<TEntity>,
    tenant: EvolutionTenantScope,
    alias: string
) {
    if (tenant.organizationId) {
        qb.andWhere(`${alias}.organizationId = :organizationId`, { organizationId: tenant.organizationId })
    } else {
        qb.andWhere(`${alias}.organizationId IS NULL`)
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

function canaryTestOverrideActiveKey(tenant: EvolutionTenantScope, deploymentId: string, subjectKey: string) {
    return createHash('sha256')
        .update(`${tenant.tenantId}:${tenant.organizationId ?? '_'}:${deploymentId}:${subjectKey}`)
        .digest('hex')
}
