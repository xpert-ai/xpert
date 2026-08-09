import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { TDocChunkMetadata } from '../../knowledge-document/types'
import { KnowledgeGraphFilterScope, shiftKnowledgeFilterParameters } from './knowledge-graph-filter-scope'

export type KnowledgeGraphScopedRelation = {
    id: string
    sourceEntityId: string
    targetEntityId: string
    type: string
    weight?: number | null
}

export type KnowledgeGraphExpansionResult = {
    entityIds: string[]
    relations: KnowledgeGraphScopedRelation[]
    truncated: boolean
}

export type KnowledgeGraphScopedChunk = {
    chunkRowId: string
    chunkId: string
    documentId: string
    pageContent: string
    metadata: TDocChunkMetadata | null
    documentName?: string | null
    sourceType?: string | null
    fileExtension?: string | null
    category?: string | null
    fileUrl?: string | null
    graphScore: number
    matchedEntityIds: string[]
    matchedRelationIds: string[]
}

export type KnowledgeGraphScopedChunkResult = {
    chunks: KnowledgeGraphScopedChunk[]
    candidateDocumentCount: number
    candidateChunkCount: number
    eligibleMentionCount: number
    truncated: boolean
}

type EligibleSeedRow = {
    entityId: string
}

type ScopedRelationRow = {
    id: string
    sourceEntityId: string
    targetEntityId: string
    type: string
    weight?: number | string | null
}

type ScopedChunkAggregateRow = {
    items: KnowledgeGraphScopedChunk[] | null
    candidateDocumentCount: number | string
    candidateChunkCount: number | string
    eligibleMentionCount: number | string
    evidenceTruncated?: boolean
}

const MAX_GRAPH_ENTITIES = 200
const MAX_GRAPH_RELATIONS = 500
const MAX_GRAPH_EVIDENCE = 2000

@Injectable()
export class KnowledgeGraphFilterScopeService {
    constructor(private readonly dataSource: DataSource) {}

    async filterSeedEntities(candidateIds: string[], scope: KnowledgeGraphFilterScope) {
        const ids = [...new Set(candidateIds.filter(Boolean))]
        if (!ids.length) return []
        const parameters: unknown[] = [scope.tenantId, scope.organizationId, scope.knowledgebaseId, ids]
        const compiledSql = shiftKnowledgeFilterParameters(scope.compiledPostgres.sql, parameters.length)
        parameters.push(...scope.compiledPostgres.parameters)
        const rows = await this.dataSource.query<EligibleSeedRow[]>(
            `SELECT DISTINCT gm."entityId" AS "entityId"
             FROM "knowledge_graph_mention" gm
             INNER JOIN "knowledge_graph_entity" ge
                ON ge."id" = gm."entityId"
               AND ge."knowledgebaseId" = gm."knowledgebaseId"
             INNER JOIN "knowledge_document" d ON d."id" = gm."documentId"
             INNER JOIN "knowledge_document_chunk" c
                ON c."documentId" = d."id"
               AND COALESCE(c."metadata" ->> 'chunkId', c."id"::text) = gm."chunkId"
             WHERE gm."tenantId" IS NOT DISTINCT FROM $1
               AND gm."organizationId" IS NOT DISTINCT FROM $2
               AND gm."knowledgebaseId" = $3
               AND d."tenantId" IS NOT DISTINCT FROM $1
               AND d."organizationId" IS NOT DISTINCT FROM $2
               AND d."knowledgebaseId" = $3
               AND c."tenantId" IS NOT DISTINCT FROM $1
               AND c."organizationId" IS NOT DISTINCT FROM $2
               AND c."knowledgebaseId" = $3
               AND gm."entityId"::text = ANY($4::text[])
               AND (ge."visibility" = 'active' OR ge."visibility" IS NULL)
               AND COALESCE(d."disabled", FALSE) = FALSE
               AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
               AND (${compiledSql})`,
            parameters
        )
        const eligibleIds = new Set(rows.map(({ entityId }) => entityId))
        return ids.filter((id) => eligibleIds.has(id))
    }

    async expandEligibleSubgraph(
        seedEntityIds: string[],
        requestedDepth: number,
        scope: KnowledgeGraphFilterScope,
        limits: { maxEntities?: number; maxRelations?: number } = {}
    ): Promise<KnowledgeGraphExpansionResult> {
        const maxEntities = Math.min(MAX_GRAPH_ENTITIES, Math.max(1, limits.maxEntities ?? MAX_GRAPH_ENTITIES))
        const maxRelations = Math.min(MAX_GRAPH_RELATIONS, Math.max(1, limits.maxRelations ?? MAX_GRAPH_RELATIONS))
        const depth = Math.min(2, Math.max(0, Math.trunc(requestedDepth)))
        const entityIds = new Set(seedEntityIds.slice(0, maxEntities))
        const relations = new Map<string, KnowledgeGraphScopedRelation>()
        let frontier = [...entityIds]
        let truncated = seedEntityIds.length > entityIds.size

        for (let hop = 0; hop < depth && frontier.length && relations.size < maxRelations; hop += 1) {
            const remaining = maxRelations - relations.size
            const parameters: unknown[] = [scope.tenantId, scope.organizationId, scope.knowledgebaseId, frontier]
            const compiledSql = shiftKnowledgeFilterParameters(scope.compiledPostgres.sql, parameters.length)
            parameters.push(...scope.compiledPostgres.parameters)
            parameters.push(remaining + 1)
            const rows = await this.dataSource.query<ScopedRelationRow[]>(
                `SELECT DISTINCT
                    r."id" AS id,
                    r."sourceEntityId" AS "sourceEntityId",
                    r."targetEntityId" AS "targetEntityId",
                    r."type" AS type,
                    r."weight" AS weight
                 FROM "knowledge_graph_relation" r
                 INNER JOIN "knowledge_graph_entity" source_entity
                    ON source_entity."id" = r."sourceEntityId"
                   AND source_entity."knowledgebaseId" = r."knowledgebaseId"
                 INNER JOIN "knowledge_graph_entity" target_entity
                    ON target_entity."id" = r."targetEntityId"
                   AND target_entity."knowledgebaseId" = r."knowledgebaseId"
                 WHERE r."tenantId" IS NOT DISTINCT FROM $1
                   AND r."organizationId" IS NOT DISTINCT FROM $2
                   AND r."knowledgebaseId" = $3
                   AND (r."visibility" = 'active' OR r."visibility" IS NULL)
                   AND (source_entity."visibility" = 'active' OR source_entity."visibility" IS NULL)
                   AND (target_entity."visibility" = 'active' OR target_entity."visibility" IS NULL)
                   AND (
                       r."sourceEntityId"::text = ANY($4::text[])
                       OR r."targetEntityId"::text = ANY($4::text[])
                   )
                   AND EXISTS (
                       SELECT 1
                       FROM "knowledge_graph_mention" gm
                       INNER JOIN "knowledge_document" d ON d."id" = gm."documentId"
                       INNER JOIN "knowledge_document_chunk" c
                          ON c."documentId" = d."id"
                         AND COALESCE(c."metadata" ->> 'chunkId', c."id"::text) = gm."chunkId"
                       WHERE gm."tenantId" IS NOT DISTINCT FROM $1
                         AND gm."organizationId" IS NOT DISTINCT FROM $2
                         AND gm."knowledgebaseId" = $3
                         AND gm."relationId" = r."id"
                         AND d."tenantId" IS NOT DISTINCT FROM $1
                         AND d."organizationId" IS NOT DISTINCT FROM $2
                         AND d."knowledgebaseId" = $3
                         AND c."tenantId" IS NOT DISTINCT FROM $1
                         AND c."organizationId" IS NOT DISTINCT FROM $2
                         AND c."knowledgebaseId" = $3
                         AND COALESCE(d."disabled", FALSE) = FALSE
                         AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
                         AND (${compiledSql})
                   )
                 ORDER BY r."id"
                 LIMIT $${parameters.length}`,
                parameters
            )
            if (rows.length > remaining) truncated = true
            const next = new Set<string>()
            for (const row of rows.slice(0, remaining)) {
                const endpoints = [row.sourceEntityId, row.targetEntityId]
                const newEndpoints = endpoints.filter((id) => !entityIds.has(id))
                if (entityIds.size + newEndpoints.length > maxEntities) {
                    truncated = true
                    continue
                }
                relations.set(row.id, {
                    id: row.id,
                    sourceEntityId: row.sourceEntityId,
                    targetEntityId: row.targetEntityId,
                    type: row.type,
                    weight: row.weight == null ? null : Number(row.weight)
                })
                for (const id of newEndpoints) {
                    entityIds.add(id)
                    next.add(id)
                }
            }
            frontier = [...next]
        }

        return { entityIds: [...entityIds], relations: [...relations.values()], truncated }
    }

    async resolveEligibleGraphChunks(input: {
        scope: KnowledgeGraphFilterScope
        entityIds: string[]
        relationIds: string[]
        seedScores: Array<{ entityId: string; score: number }>
        topK?: number
    }): Promise<KnowledgeGraphScopedChunkResult> {
        const entityIds = [...new Set(input.entityIds.filter(Boolean))]
        const relationIds = [...new Set(input.relationIds.filter(Boolean))]
        if (!entityIds.length && !relationIds.length) {
            return {
                chunks: [],
                candidateDocumentCount: 0,
                candidateChunkCount: 0,
                eligibleMentionCount: 0,
                truncated: false
            }
        }
        const seedScores = new Map(input.seedScores.map(({ entityId, score }) => [entityId, score]))
        const scope = input.scope
        const parameters: unknown[] = [
            scope.tenantId,
            scope.organizationId,
            scope.knowledgebaseId,
            entityIds,
            relationIds,
            [...seedScores.keys()],
            [...seedScores.values()]
        ]
        const compiledSql = shiftKnowledgeFilterParameters(scope.compiledPostgres.sql, parameters.length)
        parameters.push(...scope.compiledPostgres.parameters)
        parameters.push(Math.min(200, Math.max(1, Math.trunc(input.topK ?? 10))))

        const rows = await this.dataSource.query<ScopedChunkAggregateRow[]>(
            `WITH seed_scores AS (
                SELECT seed."entityId", seed.score
                FROM unnest($6::text[], $7::double precision[]) AS seed("entityId", score)
             ), eligible_mentions AS (
                SELECT
                    gm."id" AS "mentionId",
                    gm."entityId"::text AS "entityId",
                    gm."relationId"::text AS "relationId",
                    gm."documentId"::text AS "documentId",
                    gm."chunkId" AS "chunkId",
                    gm."confidence" AS confidence,
                    c."id"::text AS "chunkRowId",
                    c."pageContent" AS "pageContent",
                    c."metadata" AS metadata,
                    d."name" AS "documentName",
                    d."sourceType" AS "sourceType",
                    d."type" AS "fileExtension",
                    d."category" AS category,
                    d."fileUrl" AS "fileUrl",
                    COALESCE(seed_scores.score, 0.5) * COALESCE(gm."confidence", 1) AS "graphScore"
                FROM "knowledge_graph_mention" gm
                INNER JOIN "knowledge_document" d ON d."id" = gm."documentId"
                INNER JOIN "knowledge_document_chunk" c
                   ON c."documentId" = d."id"
                  AND COALESCE(c."metadata" ->> 'chunkId', c."id"::text) = gm."chunkId"
                LEFT JOIN seed_scores ON seed_scores."entityId" = gm."entityId"::text
                WHERE gm."tenantId" IS NOT DISTINCT FROM $1
                  AND gm."organizationId" IS NOT DISTINCT FROM $2
                  AND gm."knowledgebaseId" = $3
                  AND d."tenantId" IS NOT DISTINCT FROM $1
                  AND d."organizationId" IS NOT DISTINCT FROM $2
                  AND d."knowledgebaseId" = $3
                  AND c."tenantId" IS NOT DISTINCT FROM $1
                  AND c."organizationId" IS NOT DISTINCT FROM $2
                  AND c."knowledgebaseId" = $3
                  AND (
                      gm."entityId"::text = ANY($4::text[])
                      OR gm."relationId"::text = ANY($5::text[])
                  )
                  AND COALESCE(d."disabled", FALSE) = FALSE
                  AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
                  AND (${compiledSql})
                ORDER BY gm."confidence" DESC NULLS LAST, gm."createdAt" DESC
                LIMIT ${MAX_GRAPH_EVIDENCE + 1}
             ), bounded_mentions AS (
                SELECT *
                FROM eligible_mentions
                LIMIT ${MAX_GRAPH_EVIDENCE}
             ), ranked_chunks AS (
                SELECT
                    "chunkRowId",
                    "chunkId",
                    "documentId",
                    "pageContent",
                    metadata,
                    "documentName",
                    "sourceType",
                    "fileExtension",
                    category,
                    "fileUrl",
                    MAX("graphScore") AS "graphScore",
                    ARRAY_REMOVE(ARRAY_AGG(DISTINCT "entityId"), NULL) AS "matchedEntityIds",
                    ARRAY_REMOVE(ARRAY_AGG(DISTINCT "relationId"), NULL) AS "matchedRelationIds"
                FROM bounded_mentions
                GROUP BY
                    "chunkRowId", "chunkId", "documentId", "pageContent", metadata,
                    "documentName", "sourceType", "fileExtension", category, "fileUrl"
             ), limited_chunks AS (
                SELECT *
                FROM ranked_chunks
                ORDER BY "graphScore" DESC, "chunkRowId"
                LIMIT $${parameters.length}
             )
             SELECT
                COALESCE((SELECT jsonb_agg(to_jsonb(limited_chunks)) FROM limited_chunks), '[]'::jsonb) AS items,
                (SELECT COUNT(DISTINCT "documentId") FROM bounded_mentions) AS "candidateDocumentCount",
                (SELECT COUNT(*) FROM ranked_chunks) AS "candidateChunkCount",
                (SELECT COUNT(*) FROM bounded_mentions) AS "eligibleMentionCount",
                (SELECT COUNT(*) > ${MAX_GRAPH_EVIDENCE} FROM eligible_mentions) AS "evidenceTruncated"`,
            parameters
        )
        const row = rows[0]
        return {
            chunks: row?.items ?? [],
            candidateDocumentCount: Number(row?.candidateDocumentCount ?? 0),
            candidateChunkCount: Number(row?.candidateChunkCount ?? 0),
            eligibleMentionCount: Number(row?.eligibleMentionCount ?? 0),
            truncated: row?.evidenceTruncated === true
        }
    }
}
