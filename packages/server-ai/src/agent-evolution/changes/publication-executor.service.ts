// Staged publication allocates its version and package in the caller's transaction.
import { Injectable } from '@nestjs/common'
import type { EntityManager } from 'typeorm'
import type { CapabilityVersion, EvolutionChangeOperation, ReleasePackage } from '@xpert-ai/contracts'
import { ApprovalDecisionEntity, CapabilityVersionEntity, ReleasePackageEntity } from '../entities/evolution.entities'
import { AgentEvolutionReleaseGatePolicyService } from '../application/agent-evolution-release-gate-policy.service'
import { changeIdentity } from './change.store'
import { changeError } from './change.errors'

@Injectable()
export class EvolutionPublicationExecutor {
    constructor(private readonly gates: AgentEvolutionReleaseGatePolicyService) {}

    async package(manager: EntityManager, operation: EvolutionChangeOperation) {
        const { change, context } = operation
        const identity = changeIdentity({ tenantId: context.tenantId, organizationId: context.organizationId! })
        const repository = manager.getRepository(ReleasePackageEntity)
        const releasePackageId = `PUB-${change.changeId}`
        const existing = await repository.findOneBy({ ...identity, releasePackageId })
        if (existing) return existing.value
        if (!change.candidate || !change.evaluation || change.approval?.decision !== 'approved')
            changeError('human_approval_required')
        const approvals = await manager
            .getRepository(ApprovalDecisionEntity)
            .find({ where: { ...identity, candidateId: change.changeId } })
        const gatePolicy = this.gates.snapshot()
        if (gatePolicy.profile === 'manual_test' && change.approval.approvalAuthority !== 'administrator')
            changeError('manual_test_administrator_required')
        const now = new Date().toISOString()
        const versions = manager.getRepository(CapabilityVersionEntity)
        const latest = await versions.findOne({
            where: { ...identity, targetId: change.targetId },
            order: { sequence: 'DESC' }
        })
        const sequence = (latest?.sequence ?? 0) + 1
        const version: CapabilityVersion = {
            versionId: `${change.targetId}:${change.changeId}`,
            targetId: change.targetId,
            sequence,
            semanticVersion: `1.${sequence - 1}.0`,
            artifact: change.candidate.artifact,
            providerKey: change.strategy.providerKey,
            providerVersion: change.strategy.providerVersion,
            dependencyVersionIds: [],
            sourceCandidateId: change.changeId,
            createdAt: now,
            createdBy: context.actor.actorId
        }
        await versions.save(
            versions.create({
                ...identity,
                targetId: change.targetId,
                versionId: version.versionId,
                sequence,
                artifactHash: version.artifact.hash,
                sourceCandidateId: change.changeId,
                value: version
            })
        )
        const value: ReleasePackage = {
            publicationKind: 'staged_rollout',
            releasePackageId,
            candidateId: change.changeId,
            candidateHash: change.candidate.artifact.hash,
            targetId: change.targetId,
            targetVersionId: version.versionId,
            rollbackVersionId: change.baseline.resourceId,
            evaluationRunId: change.evaluation.runId,
            scope: change.scope,
            status: 'approved',
            approvalIds: approvals
                .map((row) => row.value)
                .filter(
                    (item) =>
                        item.decision === 'approved' &&
                        item.candidateHash === change.candidate!.artifact.hash &&
                        item.evaluationRunId === change.evaluation!.runId &&
                        item.strategyHash === change.strategy.hash
                )
                .map((item) => item.approvalId),
            artifactHash: change.candidate.artifact.hash,
            providerKey: change.strategy.providerKey,
            providerVersion: change.strategy.providerVersion,
            gatePolicy,
            shadowMinimumSamples: gatePolicy.shadowMinimumSamples,
            canaryPercent: 0,
            createdAt: now,
            createdBy: context.actor.actorId
        }
        await repository.save(
            repository.create({
                ...identity,
                scopeType: change.scope.type,
                scopeKey: change.scope.key,
                releasePackageId,
                targetId: change.targetId,
                candidateId: change.changeId,
                status: value.status,
                value
            })
        )
        return value
    }
}
