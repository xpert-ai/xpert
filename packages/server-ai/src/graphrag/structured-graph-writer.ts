// Invariants: deterministic issuer/key identities bypass model matching. Source replacement and
// identity observations commit in the same transaction; unrelated and manually curated data survive.
import { EntityManager, In } from 'typeorm'
import { v5 as uuidv5 } from 'uuid'
import {
    identityFingerprint,
    identityScope,
    parseIdentityObservation
} from '../knowledgebase/identity/knowledge-identity-catalogue'
import { KnowledgeIdentity } from '../knowledgebase/identity/knowledge-identity.entity'
import { KnowledgeIdentityObservation } from '../knowledgebase/identity/knowledge-identity-observation.entity'
import type { KnowledgeIdentitySource } from '../knowledgebase/identity/knowledge-identity.types'
import {
    KnowledgeGraphEntity,
    KnowledgeGraphEntityContribution,
    KnowledgeGraphIndexJob,
    KnowledgeGraphMention,
    KnowledgeGraphRelation,
    KnowledgeGraphRelationContribution
} from './entities'
import { KnowledgeGraphContributionWriter } from './graph-contribution-writer'
import { KnowledgeGraphProjectionWriter } from './graph-projection-writer'
import { invalidGraphPublication } from './structured-graph-model'
import type { TKnowledgeGraphExtraction } from './types'

export async function persistStructuredGraph(
    manager: EntityManager,
    job: KnowledgeGraphIndexJob,
    source: KnowledgeIdentitySource,
    chunks: Parameters<KnowledgeGraphProjectionWriter['persist']>[1],
    snapshot: TKnowledgeGraphExtraction
) {
    const scope = identityScope(source)
    const identities = new Map<string, string>()
    const observations = manager.getRepository(KnowledgeIdentityObservation)
    await observations.update(
        { ...scope, sourceDocumentIdSnapshot: job.documentId, consumer: 'graph', isCurrent: true },
        { isCurrent: false }
    )
    for (const node of snapshot.entities) {
        if (node.identity.kind !== 'entity' || node.identity.identifiers.length !== 1) invalidGraphPublication()
        const identifier = node.identity.identifiers[0]
        const id = uuidv5(
            JSON.stringify(['structured-identity-v1', job.knowledgebaseId, identifier.namespace, identifier.value]),
            uuidv5.URL
        )
        await manager
            .getRepository(KnowledgeIdentity)
            .createQueryBuilder()
            .insert()
            .values({
                id,
                tenantId: job.tenantId,
                organizationId: job.organizationId,
                knowledgebaseId: job.knowledgebaseId,
                kind: 'entity',
                revision: 1
            })
            .orIgnore()
            .execute()
        const payload = parseIdentityObservation({
            canonicalName: node.name,
            descriptor: node.identity,
            aliases: node.aliases ?? [],
            facts: node.evidence.map((e) => ({
                text: e.quote ?? node.description ?? node.name,
                sourceChunkIds: [e.chunkId]
            }))
        })
        const sourceKey = identityFingerprint([source, node.candidateId, payload])
        await observations.save(
            observations.create({
                ...source,
                id: uuidv5(sourceKey, uuidv5.URL),
                candidateKey: node.candidateId,
                sourceKey,
                identityId: id,
                payload,
                isCurrent: true,
                decision: {
                    outcome: 'same',
                    reason: 'Explicit publisher namespace and node key.',
                    comparedIdentityIds: [id]
                }
            })
        )
        identities.set(node.candidateId, id)
    }
    const entityRepo = manager.getRepository(KnowledgeGraphEntityContribution)
    const relationRepo = manager.getRepository(KnowledgeGraphRelationContribution)
    const where = { knowledgebaseId: job.knowledgebaseId, sourceDocumentIdSnapshot: job.documentId }
    const oldEntities = await entityRepo.find({ where, select: { entityId: true } })
    const oldRelations = await relationRepo.find({ where, select: { relationId: true } })
    await manager
        .getRepository(KnowledgeGraphMention)
        .delete({ knowledgebaseId: job.knowledgebaseId, documentId: job.documentId })
    await relationRepo.delete(where)
    await entityRepo.delete(where)
    const touched = await new KnowledgeGraphProjectionWriter(manager).persist(job, chunks, snapshot, identities)
    const writer = new KnowledgeGraphContributionWriter(manager)
    for (const { relationId } of oldRelations) {
        await writer.recomputeRelationFromContributions(relationId)
        if (!(await relationRepo.countBy({ relationId }))) {
            await manager
                .getRepository(KnowledgeGraphRelation)
                .delete({ id: relationId, origin: In(['extracted', 'structured']) })
        }
    }
    for (const { entityId } of oldEntities) {
        await writer.recomputeEntityFromContributions(entityId)
        if (
            !(await entityRepo.countBy({ entityId })) &&
            !(await manager
                .getRepository(KnowledgeGraphRelation)
                .count({ where: [{ sourceEntityId: entityId }, { targetEntityId: entityId }] }))
        ) {
            await manager
                .getRepository(KnowledgeGraphEntity)
                .delete({ id: entityId, origin: In(['extracted', 'structured']) })
        }
    }
    return [...new Set([...touched, ...oldEntities.map((entity) => entity.entityId)])]
}
