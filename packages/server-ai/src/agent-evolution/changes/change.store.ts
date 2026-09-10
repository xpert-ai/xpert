// Invariants: one Proposal owns request identity; Candidate, Evaluation, Approval and Release
// are authoritative for their own stage. EvolutionChange is assembled, never persisted whole.
import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { createHash } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import {
    isEvidenceProposal,
    isPreparedCandidate,
    isProviderEvaluation,
    isProviderRelease,
    type EvidenceEvolutionProposal,
    type EvolutionCandidateStatus,
    type EvolutionChange,
    type EvolutionChangeIdentity,
    type EvolutionChangeStatus,
    type PreparedEvolutionCandidate,
    type ProviderEvaluationRun,
    type ProviderReleasePackage
} from '@xpert-ai/contracts'
import {
    ApprovalDecisionEntity,
    EvaluationRunEntity,
    EvolutionCandidateEntity,
    ImprovementProposalEntity,
    ReleasePackageEntity
} from '../entities/evolution.entities'
import { changeError } from './change.errors'

export const changeIdentity = (input: EvolutionChangeIdentity) => ({
    tenantId: input.tenantId,
    organizationId: input.organizationId
})
export function changeDigest(value: object) {
    return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

@Injectable()
export class EvolutionChangeStore {
    constructor(@InjectDataSource() private readonly db: DataSource) {}

    async create(input: EvolutionChangeIdentity, change: EvolutionChange) {
        const repository = this.db.getRepository(ImprovementProposalEntity)
        const proposal = this.proposal(change)
        await repository
            .createQueryBuilder()
            .insert()
            .values({
                ...changeIdentity(input),
                scopeType: change.scope.type,
                scopeKey: change.scope.key,
                targetId: change.targetId,
                proposalId: proposal.proposalId,
                revision: 1,
                requestId: change.requestId,
                status: proposal.status,
                value: proposal
            })
            .orIgnore()
            .execute()
        const row = await repository.findOneByOrFail({
            ...changeIdentity(input),
            targetId: change.targetId,
            requestId: change.requestId
        })
        if (!isEvidenceProposal(row.value)) changeError('immutable_request_changed')
        const prior = row.value
        if (
            changeDigest(prior.evidence) !== changeDigest(change.evidence) ||
            changeDigest(prior.baseline) !== changeDigest(change.baseline) ||
            changeDigest(prior.scope) !== changeDigest(change.scope) ||
            prior.strategy.hash !== change.strategy.hash ||
            changeDigest(prior.candidateInput) !== changeDigest(change.candidateInput) ||
            changeDigest(prior.datasetSnapshotIds) !== changeDigest(change.datasetSnapshotIds)
        )
            changeError('immutable_request_changed')
        return this.read(this.db.manager, input, prior.candidateId)
    }

    async list(input: EvolutionChangeIdentity & { targetId?: string; requestId?: string }) {
        const rows = await this.db.getRepository(ImprovementProposalEntity).find({
            where: {
                ...changeIdentity(input),
                ...(input.targetId ? { targetId: input.targetId } : {}),
                ...(input.requestId ? { requestId: input.requestId } : {})
            },
            order: { createdAt: 'DESC' }
        })
        return Promise.all(
            rows
                .map((row) => row.value)
                .filter(isEvidenceProposal)
                .map((proposal) => this.assemble(this.db.manager, input, proposal))
        )
    }

    async read(
        manager: EntityManager,
        input: EvolutionChangeIdentity,
        id: string,
        lock = false
    ): Promise<EvolutionChange> {
        const row = await manager.getRepository(ImprovementProposalEntity).findOne({
            where: {
                ...changeIdentity(input),
                proposalId: `PROP-${id}`,
                revision: 1
            },
            ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {})
        })
        if (!row || !isEvidenceProposal(row.value) || row.value.candidateId !== id) changeError('change_not_found')
        return this.assemble(manager, input, row.value)
    }

    async assemble(
        manager: EntityManager,
        input: EvolutionChangeIdentity,
        proposal: EvidenceEvolutionProposal
    ): Promise<EvolutionChange> {
        const scope = changeIdentity(input)
        const candidateRow = await manager
            .getRepository(EvolutionCandidateEntity)
            .findOneBy({ ...scope, candidateId: proposal.candidateId })
        const candidate = candidateRow?.value
        if (candidate && !isPreparedCandidate(candidate)) changeError('candidate_snapshot_mismatch')
        const evaluationRow = candidate?.evaluationRunId
            ? await manager.getRepository(EvaluationRunEntity).findOneBy({ ...scope, runId: candidate.evaluationRunId })
            : null
        if (
            evaluationRow &&
            (!isProviderEvaluation(evaluationRow.value) || evaluationRow.candidateId !== proposal.candidateId)
        )
            changeError('evaluation_snapshot_mismatch')
        const evaluation =
            evaluationRow && isProviderEvaluation(evaluationRow.value) ? evaluationRow.value.result : undefined
        const approvals = await manager
            .getRepository(ApprovalDecisionEntity)
            .find({ where: { ...scope, candidateId: proposal.candidateId }, order: { createdAt: 'DESC' } })
        const approval = approvals
            .map((row) => row.value)
            .find(
                (item) => item.evaluationRunId === evaluation?.runId && item.candidateHash === candidate?.artifact.hash
            )
        const releaseRow = await manager
            .getRepository(ReleasePackageEntity)
            .findOneBy({ ...scope, releasePackageId: `PUB-${proposal.candidateId}` })
        if (releaseRow && changeMode(proposal) === 'version_write' && !isProviderRelease(releaseRow.value))
            changeError('publication_snapshot_mismatch')
        const release = releaseRow && isProviderRelease(releaseRow.value) ? releaseRow.value : undefined
        const stagedStatus = releaseRow && !isProviderRelease(releaseRow.value) ? releaseRow.value.status : undefined
        const status: EvolutionChangeStatus = stagedStatus
            ? stagedStatus === 'active'
                ? 'published'
                : 'publishing'
            : release?.status === 'published'
              ? 'published'
              : release?.status === 'publishing'
                ? 'publishing'
                : approval?.decision === 'rejected'
                  ? 'rejected'
                  : approval && candidate?.status === 'approved'
                    ? 'approved'
                    : proposal.preparation === 'failed'
                      ? 'failed'
                      : candidate
                        ? fromCandidateStatus(candidate.status)
                        : 'preparing'
        return {
            contractVersion: 3,
            sourceKind: proposal.sourceKind,
            strategy: proposal.strategy,
            stages: proposal.stages,
            learningEventIds: proposal.learningEventIds,
            candidateInput: proposal.candidateInput,
            datasetSnapshotIds: proposal.datasetSnapshotIds,
            changeId: proposal.candidateId,
            requestId: proposal.requestId,
            targetId: proposal.targetId,
            scope: proposal.scope,
            baseline: proposal.baseline,
            evidence: proposal.evidence,
            evidenceHash: proposal.evidenceHash,
            status,
            candidate: candidate ? { ...candidate.definition, artifact: candidate.artifact } : undefined,
            evaluation,
            approval,
            receipt: release?.status === 'published' ? release.receipt : undefined,
            jobId: proposal.jobId,
            createdBy: proposal.createdBy,
            createdAt: proposal.createdAt,
            updatedAt: release?.updatedAt ?? proposal.updatedAt,
            failureReasons: proposal.failureReasons
        }
    }

    /** Saves each stage in its canonical table. Call under the Proposal row lock. */
    async save(
        manager: EntityManager,
        input: EvolutionChangeIdentity,
        change: EvolutionChange,
        provider: { providerKey: string; providerVersion: string }
    ) {
        const identity = changeIdentity(input)
        const proposals = manager.getRepository(ImprovementProposalEntity)
        const existing = await proposals.findOneBy({ ...identity, proposalId: `PROP-${change.changeId}`, revision: 1 })
        const value = this.proposal(change)
        if (existing && isEvidenceProposal(existing.value)) {
            const original = existing.value
            value.title = original.title
            value.problemStatement = original.problemStatement
            value.rootCause = original.rootCause
            value.changeHypothesis = original.changeHypothesis
            value.riskLevel = original.riskLevel
        }
        value.updatedAt = new Date().toISOString()
        if (existing) {
            if (
                !isEvidenceProposal(existing.value) ||
                changeDigest(existing.value.evidence) !== changeDigest(value.evidence) ||
                existing.value.evidenceHash !== value.evidenceHash ||
                changeDigest(existing.value.baseline) !== changeDigest(value.baseline) ||
                existing.value.strategy.hash !== value.strategy.hash
            )
                changeError('immutable_request_changed')
        }
        await proposals.save(
            proposals.create({
                ...existing,
                ...identity,
                proposalId: value.proposalId,
                revision: 1,
                requestId: value.requestId,
                scopeType: value.scope.type,
                scopeKey: value.scope.key,
                targetId: value.targetId,
                status: value.status,
                value
            })
        )
        if (change.candidate) {
            const repository = manager.getRepository(EvolutionCandidateEntity)
            const prior = await repository.findOneBy({ ...identity, candidateId: change.changeId })
            const { artifact, ...definition } = change.candidate
            if (
                prior &&
                (prior.artifactHash !== artifact.hash ||
                    (isPreparedCandidate(prior.value) &&
                        changeDigest(prior.value.definition) !== changeDigest(definition)))
            )
                changeError('immutable_candidate_changed')
            const candidate: PreparedEvolutionCandidate = {
                candidateId: change.changeId,
                targetId: change.targetId,
                strategy: change.strategy,
                baseVersionId: change.baseline.resourceId,
                proposalId: value.proposalId,
                proposalRevision: 1,
                artifact,
                definition,
                ...provider,
                dependencyVersionIds: [],
                targetScope: change.scope,
                buildInputsHash: change.evidenceHash,
                evaluationRunId: change.evaluation?.runId,
                status: toCandidateStatus(change.status),
                createdBy: change.createdBy,
                createdAt: change.createdAt
            }
            await repository.save(
                repository.create({
                    ...prior,
                    ...identity,
                    scopeType: change.scope.type,
                    scopeKey: change.scope.key,
                    candidateId: change.changeId,
                    targetId: change.targetId,
                    artifactHash: artifact.hash,
                    status: candidate.status,
                    value: candidate
                })
            )
        }
        if (change.evaluation) await this.saveEvaluation(manager, input, change, change.evaluation)
        if (change.approval) {
            const repository = manager.getRepository(ApprovalDecisionEntity)
            const prior = await repository.findOneBy({ ...identity, approvalId: change.approval.approvalId })
            if (prior && changeDigest(prior.value) !== changeDigest(change.approval))
                changeError('immutable_approval_changed')
            if (!prior)
                await repository.save(
                    repository.create({
                        ...identity,
                        scopeType: change.scope.type,
                        scopeKey: change.scope.key,
                        approvalId: change.approval.approvalId,
                        candidateId: change.changeId,
                        candidateHash: change.approval.candidateHash,
                        decision: change.approval.decision,
                        value: change.approval
                    })
                )
        }
        if (
            change.strategy.definition.publication.mode === 'version_write' &&
            change.approval?.decision === 'approved' &&
            change.candidate &&
            change.evaluation
        ) {
            const repository = manager.getRepository(ReleasePackageEntity)
            const releasePackageId = `PUB-${change.changeId}`
            const prior = await repository.findOneBy({ ...identity, releasePackageId })
            if (
                prior &&
                (!isProviderRelease(prior.value) ||
                    prior.value.candidateHash !== change.candidate.artifact.hash ||
                    (prior.value.status === 'published' &&
                        changeDigest(prior.value.receipt) !== changeDigest(change.receipt ?? {})))
            )
                changeError('immutable_receipt_changed')
            const common = {
                publicationKind: 'provider_version' as const,
                releasePackageId,
                candidateId: change.changeId,
                candidateHash: change.candidate.artifact.hash,
                targetId: change.targetId,
                evaluationRunId: change.evaluation.runId,
                scope: change.scope,
                approvalIds: (
                    await manager
                        .getRepository(ApprovalDecisionEntity)
                        .find({ where: { ...identity, candidateId: change.changeId } })
                )
                    .map((item) => item.value)
                    .filter(
                        (item) =>
                            item.decision === 'approved' &&
                            item.candidateHash === change.candidate!.artifact.hash &&
                            item.evaluationRunId === change.evaluation!.runId &&
                            item.strategyHash === change.strategy.hash
                    )
                    .map((item) => item.approvalId),
                artifactHash: change.candidate.artifact.hash,
                ...provider,
                createdAt: prior?.value.createdAt ?? change.approval.decidedAt,
                updatedAt: value.updatedAt,
                createdBy: change.approval.actorId
            }
            const release: ProviderReleasePackage = change.receipt
                ? { ...common, status: 'published', receipt: change.receipt }
                : { ...common, status: change.status === 'publishing' ? 'publishing' : 'approved' }
            await repository.save(
                repository.create({
                    ...prior,
                    ...identity,
                    scopeType: change.scope.type,
                    scopeKey: change.scope.key,
                    releasePackageId,
                    candidateId: change.changeId,
                    targetId: change.targetId,
                    status: release.status,
                    value: release
                })
            )
        }
    }

    async saveEvaluation(
        manager: EntityManager,
        input: EvolutionChangeIdentity,
        change: Pick<EvolutionChange, 'changeId' | 'targetId' | 'scope' | 'createdAt'>,
        result: ProviderEvaluationRun['result']
    ) {
        const repository = manager.getRepository(EvaluationRunEntity)
        const prior = await repository.findOneBy({ ...changeIdentity(input), runId: result.runId })
        if (
            prior &&
            (!isProviderEvaluation(prior.value) ||
                prior.candidateId !== change.changeId ||
                changeDigest(prior.value.result) !== changeDigest(result))
        )
            changeError('immutable_evaluation_changed')
        if (!prior) {
            const value: ProviderEvaluationRun = {
                evaluatorKind: 'strategy_checks',
                runId: result.runId,
                candidateId: change.changeId,
                targetId: change.targetId,
                scope: change.scope,
                status: result.passed ? 'passed' : 'failed',
                result,
                startedAt: change.createdAt,
                completedAt: result.completedAt
            }
            await repository.save(
                repository.create({
                    ...changeIdentity(input),
                    runId: result.runId,
                    candidateId: change.changeId,
                    status: value.status,
                    gatePassed: result.passed,
                    value
                })
            )
        }
    }

    private proposal(change: EvolutionChange): EvidenceEvolutionProposal {
        return {
            sourceKind: change.sourceKind,
            strategy: change.strategy,
            stages: change.stages,
            learningEventIds: change.learningEventIds,
            candidateInput: change.candidateInput,
            datasetSnapshotIds: change.datasetSnapshotIds,
            proposalId: `PROP-${change.changeId}`,
            revision: 1,
            targetId: change.targetId,
            scope: change.scope,
            requestId: change.requestId,
            candidateId: change.changeId,
            problemStatement: '',
            rootCause: '',
            changeHypothesis: '',
            riskLevel: change.strategy.riskLevel,
            evidenceEventIds: change.learningEventIds,
            baseVersionId: change.baseline.resourceId,
            title: change.candidate?.summary ?? change.targetId,
            baseline: change.baseline,
            evidence: change.evidence,
            evidenceHash: change.evidenceHash,
            status: change.status === 'rejected' ? 'rejected' : change.candidate ? 'candidate_built' : 'draft',
            preparation: change.status === 'failed' ? 'failed' : change.evaluation ? 'completed' : 'queued',
            failureReasons: change.failureReasons ?? [],
            jobId: change.jobId,
            createdAt: change.createdAt,
            updatedAt: change.updatedAt,
            createdBy: change.createdBy
        }
    }
}
function fromCandidateStatus(status: EvolutionCandidateStatus): EvolutionChangeStatus {
    switch (status) {
        case 'pending_approval':
        case 'approved':
        case 'rejected':
            return status
        case 'evaluation_failed':
            return 'test_failed'
        case 'expired':
            return 'stale'
        case 'packaged':
            return 'publishing'
        default:
            return 'testing'
    }
}
function toCandidateStatus(status: EvolutionChangeStatus): EvolutionCandidateStatus {
    switch (status) {
        case 'pending_approval':
        case 'approved':
        case 'rejected':
            return status
        case 'published':
            return 'packaged'
        case 'publishing':
            return 'approved'
        case 'test_failed':
        case 'failed':
            return 'evaluation_failed'
        case 'stale':
            return 'expired'
        default:
            return 'evaluating'
    }
}

function changeMode(proposal: EvidenceEvolutionProposal) {
    return proposal.strategy.definition.publication.mode
}
