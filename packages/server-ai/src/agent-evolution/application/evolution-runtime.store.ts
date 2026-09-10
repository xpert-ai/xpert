// Invariants: runtime rollout mutations keep their original CAS, locks and safety gates.
import type {
    ActiveCapabilityPointer,
    EvolutionAuditEvent,
    EvolutionCanaryTestOverride,
    EvolutionRuntimeObservation
} from '@xpert-ai/contracts'
import { isStagedRelease } from '@xpert-ai/contracts'
import { DataSource } from 'typeorm'
import {
    ActiveCapabilityPointerEntity,
    EvolutionAuditEventEntity,
    EvolutionCanaryTestOverrideEntity,
    EvolutionRuntimeObservationEntity,
    ReleaseDeploymentEntity,
    ReleasePackageEntity
} from '../entities'
import { stagedReleaseRow } from '../entities/evolution-row-guards'
import { assertReleaseTransition } from '../domain/evolution-state'
import {
    tenantWhere,
    tenantValues,
    canaryTestOverrideActiveKey,
    type EvolutionTenantScope
} from './evolution-store.helpers'
export class EvolutionRuntimeStore {
    constructor(private readonly dataSource: DataSource) {}
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
                    if (
                        release &&
                        isStagedRelease(release.value) &&
                        (release.status === 'shadow' || release.status === 'canary')
                    ) {
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
            const release = stagedReleaseRow(
                await releaseRepository.findOneOrFail({
                    where: { ...tenantWhere(input.tenant), releasePackageId: input.releasePackageId }
                })
            )
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
            const release = stagedReleaseRow(
                await releaseRepository.findOneOrFail({
                    where: { ...tenantWhere(input.tenant), releasePackageId: input.releasePackageId }
                })
            )
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
}
