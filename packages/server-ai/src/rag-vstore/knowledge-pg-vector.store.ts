import { Document } from '@langchain/core/documents'
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector'

export type StructuredVectorSearchFilter = {
    postgres?: {
        sql: string
        parameters: unknown[]
        knowledgebaseId: string
    }
    milvus?: {
        expression: string
        values: Record<string, unknown>
    }
}

export type StructuredVectorSearchResult = {
    items: [Document, number][]
    candidateDocumentCount?: number
    candidateChunkCount?: number
}

/**
 * PGVector search that joins the relational document and chunk tables before
 * vector ranking. The compiled predicate only references the fixed aliases
 * `d` (knowledge_document) and `c` (knowledge_document_chunk).
 */
export class KnowledgePGVectorStore extends PGVectorStore {
    async structuredSimilaritySearchWithScore(
        query: string,
        k: number,
        filter: StructuredVectorSearchFilter
    ): Promise<StructuredVectorSearchResult> {
        if (!filter.postgres) {
            throw new Error('PGVector structured search requires a PostgreSQL filter.')
        }
        const embedding = await this.embeddings.embedQuery(query)
        const embeddingString = `[${embedding.join(',')}]`
        const collectionId = this.collectionTableName ? await this.getOrCreateCollection() : null
        const compiled = filter.postgres
        const parameters: unknown[] = [embeddingString, k]
        const collectionPredicate = collectionId ? `v."collection_id" = $3 AND` : ''
        if (collectionId) parameters.push(collectionId)
        const knowledgebaseParam = parameters.length + 1
        parameters.push(compiled.knowledgebaseId)
        const filterParameterOffset = parameters.length
        parameters.push(...compiled.parameters)
        const compiledSql = compiled.sql.replace(
            /\$(\d+)/g,
            (_match, index) => `$${Number(index) + filterParameterOffset}`
        )

        const queryString = `
            WITH candidates AS (
                SELECT
                    v.*,
                    d."id" AS "_document_id",
                    v."${this.vectorColumnName}" ${this.computedOperatorString} $1 AS "_distance"
                FROM ${this.computedTableName} v
                INNER JOIN "knowledge_document_chunk" c
                    ON COALESCE(c."metadata" ->> 'chunkId', c."id"::text) = v."${this.metadataColumnName}" ->> 'chunkId'
                INNER JOIN "knowledge_document" d ON d."id" = c."documentId"
                WHERE
                    ${collectionPredicate}
                    d."knowledgebaseId" = $${knowledgebaseParam}
                    AND c."knowledgebaseId" = $${knowledgebaseParam}
                    AND COALESCE(d."disabled", FALSE) = FALSE
                    AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
                    AND COALESCE(v."${this.metadataColumnName}" ->> 'enabled', 'true') <> 'false'
                    AND (${compiledSql})
            ),
            stats AS (
                SELECT
                    COUNT(DISTINCT "_document_id")::int AS "candidateDocumentCount",
                    COUNT(*)::int AS "candidateChunkCount"
                FROM candidates
            ),
            ranked AS (
                SELECT * FROM candidates ORDER BY "_distance" ASC LIMIT $2
            )
            SELECT ranked.*, stats."candidateDocumentCount", stats."candidateChunkCount"
            FROM stats
            LEFT JOIN ranked ON TRUE
            ORDER BY ranked."_distance" ASC NULLS LAST
        `
        const rows = (await this.pool.query(queryString, parameters)).rows
        const first = rows[0]
        const items: [Document, number][] = rows
            .filter((row) => row[this.idColumnName] && row[this.contentColumnName] != null && row._distance != null)
            .map((row) => [
                new Document({
                    id: row[this.idColumnName],
                    pageContent: row[this.contentColumnName],
                    metadata: row[this.metadataColumnName]
                }),
                Number(row._distance)
            ])
        return {
            items,
            candidateDocumentCount: first?.candidateDocumentCount ?? 0,
            candidateChunkCount: first?.candidateChunkCount ?? 0
        }
    }
}
