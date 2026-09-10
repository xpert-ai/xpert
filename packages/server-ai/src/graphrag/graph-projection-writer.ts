import { IKnowledgeDocumentChunk } from '@xpert-ai/contracts'
import { EntityManager } from 'typeorm'
import { TDocChunkMetadata } from '../knowledge-document/types'
import { KnowledgeIdentityError } from '../knowledgebase/identity/knowledge-identity-error'
import { KnowledgeGraphEntity, KnowledgeGraphIndexJob, KnowledgeGraphMention, KnowledgeGraphRelation } from './entities'
import { KnowledgeGraphContributionWriter } from './graph-contribution-writer'
import { normalizeKnowledgeGraphType } from './identity-write'
import { TKnowledgeGraphExtraction, TKnowledgeGraphExtractionEntity, TKnowledgeGraphExtractionRelation } from './types'

function mergeEvidence<
    T extends {
        evidence?: TKnowledgeGraphExtractionEntity['evidence']
        description?: string | null
        confidence?: number | null
    }
>(items: T[]) {
    return {
        ...items[0],
        description: [...new Set(items.map((item) => item.description).filter(Boolean))].join('\n') || null,
        confidence: Math.max(...items.map((item) => item.confidence ?? 0)),
        evidence: [
            ...new Map(
                items.flatMap((item) => item.evidence ?? []).map((evidence) => [JSON.stringify(evidence), evidence])
            ).values()
        ]
    }
}

export class KnowledgeGraphProjectionWriter {
    constructor(private readonly manager: EntityManager) {}
    private get mentionRepository() {
        return this.manager.getRepository(KnowledgeGraphMention)
    }
    private get relationRepository() {
        return this.manager.getRepository(KnowledgeGraphRelation)
    }

    async persist(
        job: KnowledgeGraphIndexJob,
        chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
        extraction: TKnowledgeGraphExtraction,
        identities: ReadonlyMap<string, string>
    ) {
        const chunkById = new Map(chunks.map((chunk) => [chunk.metadata?.chunkId ?? chunk.id, chunk]))
        const groups = new Map<string, TKnowledgeGraphExtractionEntity[]>()
        for (const candidate of extraction.entities) {
            const identityId = identities.get(candidate.candidateId)
            if (!identityId) throw new KnowledgeIdentityError('invalid')
            groups.set(identityId, [...(groups.get(identityId) ?? []), candidate])
        }
        const writer = new KnowledgeGraphContributionWriter(this.manager)
        const nodes = new Map<string, KnowledgeGraphEntity>()
        // One source contribution per identity preserves all aliases and evidence in this document.
        for (const [identityId, candidates] of groups) {
            const extracted = {
                ...mergeEvidence(candidates),
                aliases: [...new Set(candidates.flatMap((candidate) => [candidate.name, ...(candidate.aliases ?? [])]))]
            }
            const node = await writer.upsertEntity(job, extracted, identityId)
            nodes.set(identityId, node)
            await this.createEntityMentions(job, node, extracted, chunkById)
        }
        const relations = new Map<
            string,
            {
                source: KnowledgeGraphEntity
                target: KnowledgeGraphEntity
                candidates: TKnowledgeGraphExtractionRelation[]
            }
        >()
        for (const candidate of extraction.relations) {
            const source = nodes.get(identities.get(candidate.sourceCandidateId))
            const target = nodes.get(identities.get(candidate.targetCandidateId))
            if (!source || !target) throw new KnowledgeIdentityError('invalid')
            // Aliases of one object must not create self-edges after identity resolution.
            if (source.id === target.id) continue
            const key = JSON.stringify([source.id, target.id, normalizeKnowledgeGraphType(candidate.type)])
            const group = relations.get(key) ?? { source, target, candidates: [] }
            group.candidates.push(candidate)
            relations.set(key, group)
        }
        for (const { source, target, candidates } of relations.values()) {
            const extracted = mergeEvidence(candidates)
            const relation = await writer.upsertRelation(job, source, target, extracted)
            await this.createRelationMentions(job, relation, source, target, extracted, chunkById)
        }
        return [...nodes.values()].map((node) => node.id)
    }
    async createEntityMentions(
        graphJob: KnowledgeGraphIndexJob,
        entity: KnowledgeGraphEntity,
        extracted: TKnowledgeGraphExtractionEntity,
        chunkById: Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>>
    ) {
        const evidence = extracted.evidence ?? []
        for (const item of evidence) {
            const chunk = chunkById.get(item.chunkId)
            if (!chunk) {
                continue
            }
            await this.mentionRepository.save(
                this.mentionRepository.create({
                    tenantId: graphJob.tenantId,
                    organizationId: graphJob.organizationId,
                    knowledgebaseId: graphJob.knowledgebaseId,
                    entityId: entity.id,
                    documentId: graphJob.documentId,
                    chunkId: item.chunkId,
                    quote: item.quote ?? null,
                    confidence: item.confidence ?? extracted.confidence ?? null,
                    revision: graphJob.revision ?? 0
                })
            )
        }
    }

    async createRelationMentions(
        graphJob: KnowledgeGraphIndexJob,
        relation: KnowledgeGraphRelation,
        source: KnowledgeGraphEntity,
        target: KnowledgeGraphEntity,
        extracted: TKnowledgeGraphExtractionRelation,
        chunkById: Map<string, IKnowledgeDocumentChunk<TDocChunkMetadata>>
    ) {
        const evidence = extracted.evidence ?? []
        for (const item of evidence) {
            const chunk = chunkById.get(item.chunkId)
            if (!chunk) {
                continue
            }
            for (const entity of [source, target]) {
                await this.mentionRepository.save(
                    this.mentionRepository.create({
                        tenantId: graphJob.tenantId,
                        organizationId: graphJob.organizationId,
                        knowledgebaseId: graphJob.knowledgebaseId,
                        entityId: entity.id,
                        relationId: relation.id,
                        documentId: graphJob.documentId,
                        chunkId: item.chunkId,
                        quote: item.quote ?? null,
                        confidence: item.confidence ?? extracted.confidence ?? null,
                        revision: graphJob.revision ?? 0
                    })
                )
            }
        }
        relation.evidenceCount = await this.mentionRepository.count({ where: { relationId: relation.id } })
        await this.relationRepository.update(relation.id, { evidenceCount: relation.evidenceCount })
    }
}
