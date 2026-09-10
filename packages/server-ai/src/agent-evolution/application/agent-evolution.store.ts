import { verifyEvolutionPersistence } from './evolution-persistence-proof'
import { EvolutionRuntimeStore } from './evolution-runtime.store'
import {
    normalizePage,
    page,
    applyOrganizationScope,
    persistenceTable,
    tenantValues,
    tenantWhere,
    canaryTestOverrideActiveKey,
    type EvolutionTenantScope,
    type EvolutionPersistenceReferences
} from './evolution-store.helpers'
export type { EvolutionTenantScope, EvolutionPersistenceReferences } from './evolution-store.helpers'
import { isLearningProposal, isReplayEvaluation, isStagedRelease } from '@xpert-ai/contracts'
import { learningProposalRow, replayEvaluationRow, stagedReleaseRow } from '../entities/evolution-row-guards'
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
        const row = await this.proposalRepository.findOne({ where: { ...tenantWhere(tenant), proposalId, revision } })
        return row ? learningProposalRow(row) : null
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
        const row = await this.evaluationRepository.findOne({ where: { ...tenantWhere(tenant), runId } })
        return row ? replayEvaluationRow(row) : null
    }

    async findRelease(tenant: EvolutionTenantScope, releasePackageId: string) {
        const row = await this.releaseRepository.findOne({ where: { ...tenantWhere(tenant), releasePackageId } })
        return row ? stagedReleaseRow(row) : null
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
        const result = await this.listJsonValues(
            this.proposalRepository,
            tenant,
            query,
            'proposal',
            'targetId',
            'status',
            false,
            { field: 'sourceKind', value: 'learning_events' }
        )
        return { ...result, items: result.items.filter(isLearningProposal) }
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
        return this.listJsonValues<EvolutionCandidateEntity, EvolutionCandidate>(
            this.candidateRepository,
            tenant,
            query,
            'candidate',
            'targetId',
            'status',
            false,
            undefined,
            'self'
        )
    }

    async listDatasets(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        return this.listJsonValues(this.datasetRepository, tenant, query, 'dataset', undefined, undefined, true)
    }

    async listEvaluations(tenant: EvolutionTenantScope, query: EvolutionPageQuery = {}) {
        const result = await this.listJsonValues(
            this.evaluationRepository,
            tenant,
            query,
            'evaluation',
            undefined,
            'status',
            true,
            { field: 'evaluatorKind', value: 'golden_replay' },
            'candidate'
        )
        return { ...result, items: result.items.filter(isReplayEvaluation) }
    }

    async listReleases(
        tenant: EvolutionTenantScope,
        query: EvolutionPageQuery = {}
    ): Promise<EvolutionPage<ReleasePackage>> {
        const result = await this.listJsonValues(
            this.releaseRepository,
            tenant,
            query,
            'release',
            'targetId',
            'status',
            false,
            { field: 'publicationKind', value: 'staged_rollout' },
            'candidate'
        )
        return { ...result, items: result.items.filter(isStagedRelease) }
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

    createCanaryTestOverride(...args: Parameters<EvolutionRuntimeStore['createCanaryTestOverride']>) {
        return new EvolutionRuntimeStore(this.dataSource).createCanaryTestOverride(...args)
    }

    consumeCanaryTestOverride(...args: Parameters<EvolutionRuntimeStore['consumeCanaryTestOverride']>) {
        return new EvolutionRuntimeStore(this.dataSource).consumeCanaryTestOverride(...args)
    }

    async completeDeployment(tenant: EvolutionTenantScope, deploymentId: string, completedAt: string) {
        const deployment = await this.deploymentRepository.findOneOrFail({
            where: { ...tenantWhere(tenant), deploymentId }
        })
        deployment.value = { ...deployment.value, completedAt }
        return this.deploymentRepository.save(deployment)
    }

    saveRuntimeObservation(...args: Parameters<EvolutionRuntimeStore['saveRuntimeObservation']>) {
        return new EvolutionRuntimeStore(this.dataSource).saveRuntimeObservation(...args)
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
        targetInValue = false,
        mechanism?: { field: 'sourceKind' | 'evaluatorKind' | 'publicationKind'; value: string },
        strategyOwner?: 'self' | 'candidate'
    ): Promise<EvolutionPage<TValue>> {
        const pagination = normalizePage(query)
        const qb = repository.createQueryBuilder(alias).where(`${alias}.tenantId = :tenantId`, {
            tenantId: tenant.tenantId
        })
        applyOrganizationScope(qb, tenant, alias)
        if (strategyOwner === 'self') qb.andWhere(`${alias}.value -> 'strategy' ->> 'hash' IS NOT NULL`)
        if (strategyOwner === 'candidate') {
            qb.innerJoin(
                EvolutionCandidateEntity,
                'strategyCandidate',
                `strategyCandidate.candidateId = ${alias}.candidateId AND strategyCandidate.tenantId = ${alias}.tenantId AND strategyCandidate.organizationId IS NOT DISTINCT FROM ${alias}.organizationId`
            ).andWhere(`strategyCandidate.value -> 'strategy' ->> 'hash' IS NOT NULL`)
        }
        if (query.targetId && targetColumn) {
            qb.andWhere(`${alias}.${targetColumn} = :targetId`, { targetId: query.targetId })
        } else if (query.targetId && targetInValue) {
            qb.andWhere(`${alias}.value ->> 'targetId' = :targetId`, { targetId: query.targetId })
        }
        if (query.status && statusColumn) qb.andWhere(`${alias}.${statusColumn} = :status`, { status: query.status })
        if (mechanism)
            qb.andWhere(`${alias}.value ->> '${mechanism.field}' = :mechanism`, { mechanism: mechanism.value })
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
        const existing = await this.proposalRepository.findOne({
            where: { ...tenantWhere(tenant), proposalId: proposal.proposalId, revision: proposal.revision }
        })
        return this.proposalRepository.save(
            this.proposalRepository.create({
                ...existing,
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
        const entity = learningProposalRow(
            await this.proposalRepository.findOneOrFail({
                where: { ...tenantWhere(tenant), proposalId, revision }
            })
        )
        entity.status = status
        entity.value = { ...entity.value, status }
        return learningProposalRow(await this.proposalRepository.save(entity)).value
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

    async saveEvaluation(tenant: EvolutionTenantScope, evaluation: EvaluationRun) {
        return replayEvaluationRow(
            await this.evaluationRepository.save(
                this.evaluationRepository.create({
                    ...tenantValues(tenant),
                    runId: evaluation.runId,
                    candidateId: evaluation.candidateId,
                    status: evaluation.status,
                    gatePassed: evaluation.gate.passed,
                    value: evaluation
                })
            )
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
        return stagedReleaseRow(
            await this.releaseRepository.save(
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
        )
    }

    async transitionRelease(tenant: EvolutionTenantScope, releasePackageId: string, status: EvolutionReleaseStatus) {
        const entity = stagedReleaseRow(
            await this.releaseRepository.findOneOrFail({
                where: { ...tenantWhere(tenant), releasePackageId }
            })
        )
        assertReleaseTransition(entity.status, status)
        entity.status = status
        entity.value = { ...entity.value, status }
        return stagedReleaseRow(await this.releaseRepository.save(entity))
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

    activatePointerCas(...args: Parameters<EvolutionRuntimeStore['activatePointerCas']>) {
        return new EvolutionRuntimeStore(this.dataSource).activatePointerCas(...args)
    }

    rollbackPointerCas(...args: Parameters<EvolutionRuntimeStore['rollbackPointerCas']>) {
        return new EvolutionRuntimeStore(this.dataSource).rollbackPointerCas(...args)
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
            this.listProposals(tenant, { pageSize: 50 }),
            this.candidateRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 50 }),
            this.datasetRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 20 }),
            this.listEvaluations(tenant, { pageSize: 20 }),
            this.approvalRepository.find({ where: tenantWhere(tenant), order: { createdAt: 'DESC' }, take: 50 }),
            this.listReleases(tenant, { pageSize: 20 }),
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
            proposals: proposals.items,
            candidates: candidates.map((item) => item.value),
            datasets: datasets.map((item) => item.value),
            evaluations: evaluations.items,
            approvals: approvals.map((item) => item.value),
            releases: releases.items,
            deployments: deployments.map((item) => item.value),
            pointers: pointers.map((item) => item.value),
            audits: audits.map((item) => item.value),
            canaryTestOverrides: canaryTestOverrides.map((item) => item.value)
        }
    }

    verifyPersistence(tenant: EvolutionTenantScope, references: EvolutionPersistenceReferences) {
        return verifyEvolutionPersistence(this.dataSource, tenant, references)
    }
}
