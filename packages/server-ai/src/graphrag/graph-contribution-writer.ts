import { v5 as uuidv5 } from 'uuid'
// Invariants: lock the identity row before changing contributions or reading their aggregate.
// Every read/write in that critical section uses the same transaction connection.
import { KnowledgeGraphItemOrigin } from '@xpert-ai/contracts'
import { uniq } from 'lodash'
import { createHash } from 'node:crypto'
import { EntityManager, FindOptionsWhere, IsNull } from 'typeorm'
import {
    KnowledgeGraphEntity,
    KnowledgeGraphEntityContribution,
    KnowledgeGraphIndexJob,
    KnowledgeGraphRelation,
    KnowledgeGraphRelationContribution
} from './entities'
import { normalizeKnowledgeGraphName, normalizeKnowledgeGraphType, insertGraphIdentity } from './identity-write'
import { KnowledgeGraphEntityContributionInput, KnowledgeGraphRelationContributionInput } from './types'

const GRAPH_ORIGIN_EXTRACTED = 'extracted'
const GRAPH_VISIBILITY_ACTIVE = 'active'
function isExtractedOrigin(value?: KnowledgeGraphItemOrigin | null) {
    return !value || value === GRAPH_ORIGIN_EXTRACTED
}

export function buildGraphEntitySummary(
    entity: Pick<KnowledgeGraphEntity, 'name' | 'type' | 'aliases' | 'description'>
) {
    const aliases = entity.aliases?.length ? `Aliases: ${entity.aliases.join(', ')}.` : ''
    const description = entity.description ? `Description: ${entity.description}` : ''
    return [`${entity.name} (${entity.type}).`, aliases, description].filter(Boolean).join(' ')
}

export class KnowledgeGraphContributionWriter {
    constructor(private readonly manager: EntityManager) {}
    private get entityRepository() {
        return this.manager.getRepository(KnowledgeGraphEntity)
    }
    private get relationRepository() {
        return this.manager.getRepository(KnowledgeGraphRelation)
    }
    private get entityContributionRepository() {
        return this.manager.getRepository(KnowledgeGraphEntityContribution)
    }
    private get relationContributionRepository() {
        return this.manager.getRepository(KnowledgeGraphRelationContribution)
    }

    async recomputeEntityFromContributions(entityId: string) {
        return this.manager.transaction((manager) =>
            new KnowledgeGraphContributionWriter(manager).aggregateEntity(entityId)
        )
    }
    async recomputeRelationFromContributions(relationId: string) {
        return this.manager.transaction((manager) =>
            new KnowledgeGraphContributionWriter(manager).aggregateRelation(relationId)
        )
    }

    async upsertEntity(
        graphJob: KnowledgeGraphIndexJob,
        extracted: KnowledgeGraphEntityContributionInput,
        identityId: string
    ) {
        const type = normalizeKnowledgeGraphType(extracted.type)
        const normalizedName = normalizeKnowledgeGraphName(extracted.name)
        const identity: FindOptionsWhere<KnowledgeGraphEntity> = {
            tenantId: graphJob.tenantId ?? IsNull(),
            organizationId: graphJob.organizationId ?? IsNull(),
            knowledgebaseId: graphJob.knowledgebaseId,
            identityId
        }
        let entity = await this.entityRepository.findOne({ where: identity })
        if (!entity) {
            entity = this.entityRepository.create({
                id: uuidv5(`knowledge-graph-node:${graphJob.knowledgebaseId}:${identityId}`, uuidv5.URL),
                tenantId: graphJob.tenantId,
                organizationId: graphJob.organizationId,
                knowledgebaseId: graphJob.knowledgebaseId,
                type,
                identityId,
                name: extracted.name.trim(),
                normalizedName,
                origin: GRAPH_ORIGIN_EXTRACTED,
                visibility: GRAPH_VISIBILITY_ACTIVE,
                aliases: extracted.aliases ?? [],
                description: extracted.description ?? null,
                confidence: extracted.confidence ?? null,
                revision: graphJob.revision ?? 0
            })
            entity = await insertGraphIdentity(this.entityRepository, entity, identity)
        }
        return this.manager.transaction(async (manager) => {
            const writer = new KnowledgeGraphContributionWriter(manager)
            entity = await writer.entityRepository.findOneOrFail({
                where: { id: entity.id },
                lock: { mode: 'pessimistic_write' }
            })
            if (!graphJob.documentId || !graphJob.sourceContentHash) {
                entity.confidence = Math.max(entity.confidence ?? 0, extracted.confidence ?? 0)
                entity.revision = graphJob.revision ?? entity.revision
                entity.summary = buildGraphEntitySummary(entity)
                return writer.entityRepository.save(entity)
            }
            const current = await writer.entityContributionRepository.findOne({
                where: { entityId: entity.id, sourceDocumentIdSnapshot: graphJob.documentId }
            })
            await writer.entityContributionRepository.save(
                writer.entityContributionRepository.create({
                    ...(current ?? {}),
                    tenantId: graphJob.tenantId,
                    organizationId: graphJob.organizationId,
                    entityId: entity.id,
                    knowledgebaseId: graphJob.knowledgebaseId,
                    sourceDocumentIdSnapshot: graphJob.documentId,
                    sourceContentHash: graphJob.sourceContentHash,
                    sourcePublicationEpoch: graphJob.sourcePublicationEpoch ?? 0,
                    name: extracted.name.trim(),
                    aliases: extracted.aliases ?? [],
                    description: extracted.description ?? null,
                    confidence: extracted.confidence ?? null,
                    revision: graphJob.revision ?? 0
                })
            )
            await writer.aggregateEntity(entity.id)
            return writer.entityRepository.findOneByOrFail({ id: entity.id })
        })
    }
    async upsertRelation(
        graphJob: KnowledgeGraphIndexJob,
        source: KnowledgeGraphEntity,
        target: KnowledgeGraphEntity,
        extracted: KnowledgeGraphRelationContributionInput
    ) {
        const type = normalizeKnowledgeGraphType(extracted.type)
        const identity: FindOptionsWhere<KnowledgeGraphRelation> = {
            knowledgebaseId: graphJob.knowledgebaseId,
            sourceEntityId: source.id,
            targetEntityId: target.id,
            type
        }
        let relation = await this.relationRepository.findOne({ where: identity })
        if (!relation) {
            relation = this.relationRepository.create({
                tenantId: graphJob.tenantId,
                organizationId: graphJob.organizationId,
                knowledgebaseId: graphJob.knowledgebaseId,
                sourceEntityId: source.id,
                targetEntityId: target.id,
                type,
                normalizedType: type,
                origin: GRAPH_ORIGIN_EXTRACTED,
                visibility: GRAPH_VISIBILITY_ACTIVE,
                description: extracted.description ?? null,
                confidence: extracted.confidence ?? null,
                weight: extracted.confidence ?? null,
                revision: graphJob.revision ?? 0
            })
            relation = await insertGraphIdentity(this.relationRepository, relation, identity)
        }
        return this.manager.transaction(async (manager) => {
            const writer = new KnowledgeGraphContributionWriter(manager)
            relation = await writer.relationRepository.findOneOrFail({
                where: { id: relation.id },
                lock: { mode: 'pessimistic_write' }
            })
            if (!graphJob.documentId || !graphJob.sourceContentHash) {
                relation.confidence = Math.max(relation.confidence ?? 0, extracted.confidence ?? 0)
                relation.revision = graphJob.revision ?? relation.revision
                return writer.relationRepository.save(relation)
            }
            const current = await writer.relationContributionRepository.findOne({
                where: { relationId: relation.id, sourceDocumentIdSnapshot: graphJob.documentId }
            })
            await writer.relationContributionRepository.save(
                writer.relationContributionRepository.create({
                    ...(current ?? {}),
                    tenantId: graphJob.tenantId,
                    organizationId: graphJob.organizationId,
                    relationId: relation.id,
                    knowledgebaseId: graphJob.knowledgebaseId,
                    sourceDocumentIdSnapshot: graphJob.documentId,
                    sourceContentHash: graphJob.sourceContentHash,
                    sourcePublicationEpoch: graphJob.sourcePublicationEpoch ?? 0,
                    description: extracted.description ?? null,
                    confidence: extracted.confidence ?? null,
                    weight: extracted.confidence ?? null,
                    revision: graphJob.revision ?? 0
                })
            )
            await writer.aggregateRelation(relation.id)
            return writer.relationRepository.findOneByOrFail({ id: relation.id })
        })
    }
    private async aggregateEntity(entityId: string) {
        const entity = await this.entityRepository.findOne({
            where: { id: entityId },
            lock: { mode: 'pessimistic_write' }
        })
        if (!entity || !isExtractedOrigin(entity.origin)) return
        const contributions = await this.entityContributionRepository.find({
            where: { entityId },
            order: { sourceDocumentIdSnapshot: 'ASC' }
        })
        if (!contributions.length) {
            entity.sourceFingerprint = null
            entity.aliases = []
            entity.description = null
            entity.summary = buildGraphEntitySummary(entity)
            entity.confidence = null
            await this.entityRepository.save(entity)
            return
        }
        const ranked = [...contributions].sort(
            (left, right) =>
                (right.confidence ?? 0) - (left.confidence ?? 0) ||
                left.sourceDocumentIdSnapshot.localeCompare(right.sourceDocumentIdSnapshot)
        )
        entity.name = ranked[0].name
        entity.normalizedName = normalizeKnowledgeGraphName(entity.name)
        entity.aliases = uniq(contributions.flatMap((item) => item.aliases ?? [])).sort()
        entity.description = ranked.find((item) => !!item.description)?.description ?? null
        entity.confidence = Math.max(...contributions.map((item) => item.confidence ?? 0))
        entity.revision = Math.max(...contributions.map((item) => item.revision))
        entity.sourceFingerprint = createHash('sha256')
            .update(
                JSON.stringify(
                    contributions.map((item) => ({
                        sourceDocumentId: item.sourceDocumentIdSnapshot,
                        sourceContentHash: item.sourceContentHash,
                        sourcePublicationEpoch: item.sourcePublicationEpoch,
                        aliases: item.aliases,
                        description: item.description,
                        confidence: item.confidence
                    }))
                )
            )
            .digest('hex')
        entity.summary = buildGraphEntitySummary(entity)
        await this.entityRepository.save(entity)
    }
    private async aggregateRelation(relationId: string) {
        const relation = await this.relationRepository.findOne({
            where: { id: relationId },
            lock: { mode: 'pessimistic_write' }
        })
        if (!relation || !isExtractedOrigin(relation.origin)) return
        const contributions = await this.relationContributionRepository.find({
            where: { relationId },
            order: { sourceDocumentIdSnapshot: 'ASC' }
        })
        if (!contributions.length) {
            relation.description = null
            relation.confidence = null
            relation.weight = null
            relation.sourceFingerprint = null
            await this.relationRepository.save(relation)
            return
        }
        const ranked = [...contributions].sort(
            (left, right) =>
                (right.confidence ?? 0) - (left.confidence ?? 0) ||
                left.sourceDocumentIdSnapshot.localeCompare(right.sourceDocumentIdSnapshot)
        )
        relation.description = ranked.find((item) => !!item.description)?.description ?? null
        relation.confidence = Math.max(...contributions.map((item) => item.confidence ?? 0))
        relation.weight = Math.max(...contributions.map((item) => item.weight ?? 0))
        relation.revision = Math.max(...contributions.map((item) => item.revision))
        relation.sourceFingerprint = createHash('sha256')
            .update(
                JSON.stringify(
                    contributions.map((item) => ({
                        sourceDocumentId: item.sourceDocumentIdSnapshot,
                        sourceContentHash: item.sourceContentHash,
                        sourcePublicationEpoch: item.sourcePublicationEpoch,
                        description: item.description,
                        confidence: item.confidence,
                        weight: item.weight
                    }))
                )
            )
            .digest('hex')
        await this.relationRepository.save(relation)
    }
}
