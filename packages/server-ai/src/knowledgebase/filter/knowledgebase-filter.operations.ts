import { KnowledgeFilterJSONValue } from '@xpert-ai/contracts'

import { BadRequestException } from '@nestjs/common'

import { DataSource } from 'typeorm'

import { KnowledgeFilterFieldDefinition } from './index'

import { escapeKnowledgeFilterOptionLike } from './knowledgebase-filter-policy'

interface KnowledgebaseFilterOperationsContext {
    dataSource: DataSource
}

export class KnowledgebaseFilterOperations {
    constructor(private readonly context: KnowledgebaseFilterOperationsContext) {}

    async countStructuredFilterCandidates(
        knowledgebaseId: string,
        compiled: { sql: string; parameters: unknown[] }
    ): Promise<{ candidateDocumentCount: number; candidateChunkCount: number }> {
        const sql = compiled.sql.replace(/\$(\d+)/g, (_match, index) => `$${Number(index) + 1}`)
        const [row] = await this.context.dataSource.query(
            `SELECT
                COUNT(DISTINCT d."id")::int AS "candidateDocumentCount",
                COUNT(DISTINCT c."id")::int AS "candidateChunkCount"
             FROM "knowledge_document" d
             INNER JOIN "knowledge_document_chunk" c ON c."documentId" = d."id"
             WHERE d."knowledgebaseId" = $1
               AND c."knowledgebaseId" = $1
               AND COALESCE(d."disabled", FALSE) = FALSE
               AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
               AND (${sql})`,
            [knowledgebaseId, ...compiled.parameters]
        )
        return {
            candidateDocumentCount: Number(row?.candidateDocumentCount ?? 0),
            candidateChunkCount: Number(row?.candidateChunkCount ?? 0)
        }
    }

    async listStructuredFilterFolderCandidates(
        knowledgebaseId: string,
        tenantId: string,
        organizationId: string,
        compiled: { sql: string; parameters: unknown[] }
    ): Promise<Array<{ folderPath: string; directDocumentCount: number }>> {
        const sql = compiled.sql.replace(/\$(\d+)/g, (_match, index) => `$${Number(index) + 3}`)
        const rows = await this.context.dataSource.query(
            `SELECT
                COALESCE(d."folder", '') AS "folderPath",
                COUNT(DISTINCT d."id")::int AS "directDocumentCount"
             FROM "knowledge_document" d
             INNER JOIN "knowledge_document_chunk" c ON c."documentId" = d."id"
             WHERE d."tenantId" IS NOT DISTINCT FROM $1
               AND d."organizationId" IS NOT DISTINCT FROM $2
               AND d."knowledgebaseId" = $3
               AND c."knowledgebaseId" = $3
               AND COALESCE(d."disabled", FALSE) = FALSE
               AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
               AND (${sql})
             GROUP BY COALESCE(d."folder", '')`,
            [tenantId, organizationId, knowledgebaseId, ...compiled.parameters]
        )
        return rows.map((row) => ({
            folderPath: String(row.folderPath ?? ''),
            directDocumentCount: Number(row.directDocumentCount ?? 0)
        }))
    }

    async listStructuredFilterValueCandidates(
        knowledgebaseId: string,
        tenantId: string,
        organizationId: string,
        compiled: { sql: string; parameters: unknown[] },
        definition: KnowledgeFilterFieldDefinition,
        options: { search?: string; allowedValues?: string[]; limit: number; offset: number }
    ): Promise<{
        items: Array<{ value: KnowledgeFilterJSONValue; documentCount: number; chunkCount: number }>
        total: number
        statistics: {
            eligibleDocumentCount: number
            eligibleChunkCount: number
            existingDocumentCount: number
            existingChunkCount: number
            min?: KnowledgeFilterJSONValue
            max?: KnowledgeFilterJSONValue
        }
    }> {
        const parameters: unknown[] = [tenantId, organizationId, knowledgebaseId]
        const rawValueExpression = this.structuredFilterOptionValueExpression(definition, parameters)
        const compiledSql = compiled.sql.replace(/\$(\d+)/g, (_match, index) => `$${Number(index) + parameters.length}`)
        parameters.push(...compiled.parameters)

        const searchable = definition.type !== 'object'
        const valuePredicates: string[] = []
        if (definition.type === 'enum' && options.allowedValues?.length) {
            parameters.push(options.allowedValues)
            valuePredicates.push(`(value #>> '{}') = ANY($${parameters.length})`)
        }
        if (searchable && options.search?.trim()) {
            parameters.push(`%${escapeKnowledgeFilterOptionLike(options.search.trim())}%`)
            valuePredicates.push(`(value #>> '{}') ILIKE $${parameters.length} ESCAPE '\\'`)
        }
        const valuePredicateSql = valuePredicates.length ? valuePredicates.join(' AND ') : 'TRUE'
        parameters.push(options.limit)
        const limitParameter = `$${parameters.length}`
        parameters.push(options.offset)
        const offsetParameter = `$${parameters.length}`

        const arrayValue = definition.type === 'string[]' || definition.type === 'number[]'
        const valuesCte =
            definition.type === 'object'
                ? `SELECT "documentId", "chunkId", "rawValue" AS value FROM eligible WHERE FALSE`
                : arrayValue
                  ? `SELECT e."documentId", e."chunkId", item.value
                     FROM eligible e
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN jsonb_typeof(e."rawValue") = 'array' THEN e."rawValue" ELSE '[]'::jsonb END
                     ) item(value)`
                  : `SELECT "documentId", "chunkId", "rawValue" AS value
                     FROM eligible
                     WHERE "rawValue" IS NOT NULL AND "rawValue" <> 'null'::jsonb`
        const sortableValue = (alias: string) =>
            definition.type === 'number' || definition.type === 'number[]'
                ? `(${alias} #>> '{}')::numeric`
                : `${alias} #>> '{}'`
        const rangeStatistics =
            definition.type === 'number' || definition.type === 'number[]' || definition.type === 'datetime'
                ? `,
                   (SELECT MIN(${sortableValue('value')}) FROM values_source) AS "minValue",
                   (SELECT MAX(${sortableValue('value')}) FROM values_source) AS "maxValue"`
                : ''

        const [row] = await this.context.dataSource.query(
            `WITH eligible AS (
                SELECT
                    d."id" AS "documentId",
                    c."id" AS "chunkId",
                    ${rawValueExpression} AS "rawValue"
                FROM "knowledge_document" d
                INNER JOIN "knowledge_document_chunk" c ON c."documentId" = d."id"
                WHERE d."tenantId" IS NOT DISTINCT FROM $1
                  AND d."organizationId" IS NOT DISTINCT FROM $2
                  AND d."knowledgebaseId" = $3
                  AND c."knowledgebaseId" = $3
                  AND COALESCE(d."disabled", FALSE) = FALSE
                  AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
                  AND (${compiledSql})
            ),
            values_source AS (
                ${valuesCte}
            ),
            grouped AS (
                SELECT
                    value,
                    COUNT(DISTINCT "documentId")::int AS "documentCount",
                    COUNT(DISTINCT "chunkId")::int AS "chunkCount"
                FROM values_source
                WHERE ${valuePredicateSql}
                GROUP BY value
            ),
            page AS (
                SELECT *
                FROM grouped
                ORDER BY ${sortableValue('value')} ASC
                LIMIT ${limitParameter} OFFSET ${offsetParameter}
            )
            SELECT
                COALESCE(
                    (SELECT jsonb_agg(
                        jsonb_build_object(
                            'value', value,
                            'documentCount', "documentCount",
                            'chunkCount', "chunkCount"
                        ) ORDER BY ${sortableValue('value')}
                    ) FROM page),
                    '[]'::jsonb
                ) AS items,
                (SELECT COUNT(*)::int FROM grouped) AS total,
                (SELECT COUNT(DISTINCT "documentId")::int FROM eligible) AS "eligibleDocumentCount",
                (SELECT COUNT(DISTINCT "chunkId")::int FROM eligible) AS "eligibleChunkCount",
                (SELECT COUNT(DISTINCT "documentId")::int FROM eligible WHERE "rawValue" IS NOT NULL) AS "existingDocumentCount",
                (SELECT COUNT(DISTINCT "chunkId")::int FROM eligible WHERE "rawValue" IS NOT NULL) AS "existingChunkCount"
                ${rangeStatistics}`,
            parameters
        )
        const convertRangeValue = (value: unknown): KnowledgeFilterJSONValue =>
            definition.type === 'number' || definition.type === 'number[]' ? Number(value) : String(value)
        const items = (Array.isArray(row?.items) ? row.items : []) as Array<{
            value: KnowledgeFilterJSONValue
            documentCount: number | string
            chunkCount: number | string
        }>
        return {
            items: items.map((item) => ({
                value: item.value,
                documentCount: Number(item.documentCount ?? 0),
                chunkCount: Number(item.chunkCount ?? 0)
            })),
            total: Number(row?.total ?? 0),
            statistics: {
                eligibleDocumentCount: Number(row?.eligibleDocumentCount ?? 0),
                eligibleChunkCount: Number(row?.eligibleChunkCount ?? 0),
                existingDocumentCount: Number(row?.existingDocumentCount ?? 0),
                existingChunkCount: Number(row?.existingChunkCount ?? 0),
                ...(row?.minValue != null ? { min: convertRangeValue(row.minValue) } : {}),
                ...(row?.maxValue != null ? { max: convertRangeValue(row.maxValue) } : {})
            }
        }
    }

    structuredFilterOptionValueExpression(definition: KnowledgeFilterFieldDefinition, parameters: unknown[]) {
        if (definition.scope === 'document') {
            const columns = new Set([
                'name',
                'folder',
                'type',
                'mimeType',
                'category',
                'sourceType',
                'createdAt',
                'updatedAt'
            ])
            if (!definition.column || !columns.has(definition.column)) {
                throw new BadRequestException(`Filter options are not available for field '${definition.field}'.`)
            }
            return `to_jsonb(d."${definition.column}")`
        }
        parameters.push(definition.metadataKey)
        const owner = definition.scope === 'chunkMetadata' ? 'c' : 'd'
        return `${owner}."metadata"::jsonb -> $${parameters.length}`
    }

    async listStructuredGraphEvidence(
        knowledgebaseId: string,
        tenantId: string,
        organizationId: string,
        compiled: { sql: string; parameters: unknown[] },
        scope: {
            entityIds?: string[]
            relationIds?: string[]
            take?: number
        }
    ): Promise<
        Array<{
            entityId?: string | null
            relationId?: string | null
            documentId: string
            chunkId: string
            quote?: string | null
            confidence?: number | null
            documentName?: string | null
            folderPath: string
        }>
    > {
        const entityIds = [...new Set(scope.entityIds?.filter(Boolean) ?? [])]
        const relationIds = [...new Set(scope.relationIds?.filter(Boolean) ?? [])]
        if (!entityIds.length && !relationIds.length) return []

        const parameters: unknown[] = [tenantId, organizationId, knowledgebaseId]
        const graphPredicates: string[] = []
        if (entityIds.length) {
            parameters.push(entityIds)
            graphPredicates.push(`gm."entityId" = ANY($${parameters.length})`)
        }
        if (relationIds.length) {
            parameters.push(relationIds)
            graphPredicates.push(`gm."relationId" = ANY($${parameters.length})`)
        }
        const compiledSql = compiled.sql.replace(/\$(\d+)/g, (_match, index) => `$${Number(index) + parameters.length}`)
        parameters.push(...compiled.parameters)
        parameters.push(Math.min(200, Math.max(1, Math.trunc(scope.take ?? 80))))
        const takeParameter = `$${parameters.length}`

        const rows = await this.context.dataSource.query(
            `SELECT
                gm."entityId" AS "entityId",
                gm."relationId" AS "relationId",
                gm."documentId" AS "documentId",
                gm."chunkId" AS "chunkId",
                gm."quote" AS quote,
                gm."confidence" AS confidence,
                d."name" AS "documentName",
                COALESCE(d."folder", '') AS "folderPath"
             FROM "knowledge_graph_mention" gm
             INNER JOIN "knowledge_document" d ON d."id" = gm."documentId"
             INNER JOIN "knowledge_document_chunk" c
                ON c."documentId" = d."id"
               AND COALESCE(c."metadata" ->> 'chunkId', c."id"::text) = gm."chunkId"
             WHERE d."tenantId" IS NOT DISTINCT FROM $1
               AND d."organizationId" IS NOT DISTINCT FROM $2
               AND d."knowledgebaseId" = $3
               AND c."knowledgebaseId" = $3
               AND gm."knowledgebaseId" = $3
               AND COALESCE(d."disabled", FALSE) = FALSE
               AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
               AND (${graphPredicates.join(' OR ')})
               AND (${compiledSql})
             ORDER BY gm."confidence" DESC NULLS LAST, gm."createdAt" DESC
             LIMIT ${takeParameter}`,
            parameters
        )
        return rows.map((row) => ({
            entityId: row.entityId ?? null,
            relationId: row.relationId ?? null,
            documentId: String(row.documentId),
            chunkId: String(row.chunkId),
            quote: row.quote ?? null,
            confidence: row.confidence == null ? null : Number(row.confidence),
            documentName: row.documentName ?? null,
            folderPath: String(row.folderPath ?? '')
        }))
    }
}
