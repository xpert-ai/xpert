import { DataSource, In } from 'typeorm'
import type { EvolutionPersistenceEvidence } from '@xpert-ai/contracts'
import {
    EvolutionTargetEntity,
    CapabilityVersionEntity,
    CapabilityVersionBundleEntity,
    ActiveCapabilityPointerEntity,
    LearningEventEntity,
    ImprovementProposalEntity,
    EvolutionCandidateEntity,
    DatasetSnapshotEntity,
    EvaluationRunEntity,
    ApprovalDecisionEntity,
    ReleasePackageEntity,
    ReleaseDeploymentEntity,
    EvolutionAuditEventEntity
} from '../entities'
import {
    tenantWhere,
    persistenceTable,
    type EvolutionTenantScope,
    type EvolutionPersistenceReferences
} from './evolution-store.helpers'
export async function verifyEvolutionPersistence(
    dataSource: DataSource,
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
        dataSource.getRepository(EvolutionTargetEntity).find({
            where: { ...tenantWhere(tenant), targetId: In(references.targetIds) }
        }),
        dataSource.getRepository(CapabilityVersionEntity).find({
            where: { ...tenantWhere(tenant), versionId: In(references.versionIds) }
        }),
        dataSource.getRepository(CapabilityVersionBundleEntity).find({
            where: { ...tenantWhere(tenant), bundleId: In(references.bundleIds) }
        }),
        dataSource.getRepository(ActiveCapabilityPointerEntity).find({
            where: { ...tenantWhere(tenant), pointerId: In(references.pointerIds) }
        }),
        dataSource.getRepository(LearningEventEntity).find({
            where: { ...tenantWhere(tenant), eventId: In(references.eventIds) }
        }),
        dataSource.getRepository(ImprovementProposalEntity).find({
            where: { ...tenantWhere(tenant), proposalId: In(references.proposalIds) }
        }),
        dataSource.getRepository(EvolutionCandidateEntity).find({
            where: { ...tenantWhere(tenant), candidateId: In(references.candidateIds) }
        }),
        dataSource.getRepository(DatasetSnapshotEntity).find({
            where: { ...tenantWhere(tenant), snapshotId: In(references.datasetSnapshotIds) }
        }),
        dataSource.getRepository(EvaluationRunEntity).find({
            where: { ...tenantWhere(tenant), runId: In(references.evaluationRunIds) }
        }),
        dataSource.getRepository(ApprovalDecisionEntity).find({
            where: { ...tenantWhere(tenant), approvalId: In(references.approvalIds) }
        }),
        dataSource.getRepository(ReleasePackageEntity).find({
            where: { ...tenantWhere(tenant), releasePackageId: In(references.releasePackageIds) }
        }),
        dataSource.getRepository(ReleaseDeploymentEntity).find({
            where: { ...tenantWhere(tenant), deploymentId: In(references.deploymentIds) }
        }),
        dataSource.getRepository(EvolutionAuditEventEntity).find({
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
