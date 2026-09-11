import { Document } from '@langchain/core/documents'
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector'
import { t } from 'i18next'

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
    async getByIds(ids: string[]): Promise<Document[]> {
        if (!ids.length) return []
        const collectionId = this.collectionTableName ? await this.getOrCreateCollection() : null
        const rows = (
            await this.pool.query(
                `SELECT * FROM ${this.computedTableName}
             WHERE "${this.idColumnName}" = ANY($1::uuid[])
             ${collectionId ? 'AND "collection_id" = $2' : ''}`,
                collectionId ? [ids, collectionId] : [ids]
            )
        ).rows
        return rows.map(
            (row) =>
                new Document({
                    id: row[this.idColumnName],
                    pageContent: row[this.contentColumnName],
                    metadata: row[this.metadataColumnName]
                })
        )
    }

    override async similaritySearchVectorWithScore(
        vector: number[],
        k: number,
        filter?: Record<string, unknown>
    ): Promise<[Document, number][]> {
        if (filter?.sourceOnly !== true) return super.similaritySearchVectorWithScore(vector, k, filter)
        const parameters: unknown[] = [`[${vector.join(',')}]`, k]
        const bind = (value: unknown) => {
            parameters.push(value)
            return `$${parameters.length}`
        }
        const predicates = [`"${this.metadataColumnName}" ->> 'questionGenerationId' IS NULL`]
        const collectionId = this.collectionTableName ? await this.getOrCreateCollection() : null
        if (collectionId) predicates.push(`"collection_id" = ${bind(collectionId)}`)
        for (const [key, value] of Object.entries(filter)) {
            if (key === 'sourceOnly') continue
            const path = `"${this.metadataColumnName}" ->> ${bind(key)}`
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                if ('in' in value && Array.isArray(value.in)) {
                    predicates.push(`${path} = ANY(${bind(value.in)}::text[])`)
                } else if ('notIn' in value && Array.isArray(value.notIn)) {
                    predicates.push(`NOT (${path} = ANY(${bind(value.notIn)}::text[]))`)
                } else if ('arrayContains' in value && Array.isArray(value.arrayContains)) {
                    predicates.push(`${path.replace('->>', '->')} ?| ${bind(value.arrayContains)}::text[]`)
                } else {
                    throw new Error(
                        t('server-ai:Error.KnowledgeSourceVectorFilterUnsupported', {
                            defaultValue: 'Unsupported source vector metadata filter.'
                        })
                    )
                }
            } else {
                predicates.push(`${path} = ${bind(value)}`)
            }
        }
        const rows = (
            await this.pool.query(
                `SELECT *, "${this.vectorColumnName}" ${this.computedOperatorString} $1 AS "_distance"
             FROM ${this.computedTableName} WHERE ${predicates.join(' AND ')} ORDER BY "_distance" ASC LIMIT $2`,
                parameters
            )
        ).rows
        return rows.map((row) => [
            new Document({
                id: row[this.idColumnName],
                pageContent: row[this.contentColumnName],
                metadata: row[this.metadataColumnName]
            }),
            Number(row._distance)
        ])
    }

    // Stable chunk IDs must survive a retry after vector insertion but before publication.
    // Upsert atomically; never delete a published vector before its replacement succeeds.
    override async addVectors(vectors: number[][], documents: Document[], options?: { ids?: string[] }) {
        if (!options?.ids) return super.addVectors(vectors, documents, options)
        if (options.ids.length !== vectors.length || documents.length !== vectors.length) {
            throw new Error(
                t('server-ai:Error.KnowledgebaseVectorBatchInvalid', {
                    defaultValue: 'The vector, document and identifier counts must match.'
                })
            )
        }
        const collectionId = this.collectionTableName ? await this.getOrCreateCollection() : null
        const columns = [this.idColumnName, this.contentColumnName, this.vectorColumnName, this.metadataColumnName]
        if (collectionId) columns.push('collection_id')
        for (let offset = 0; offset < vectors.length; offset += this.chunkSize) {
            const values: unknown[] = []
            const rows = vectors.slice(offset, offset + this.chunkSize).map((vector, index) => {
                const document = documents[offset + index]
                const row: unknown[] = [
                    options.ids[offset + index],
                    document.pageContent.replace(/\0/g, ''),
                    `[${vector.join(',')}]`,
                    document.metadata
                ]
                if (collectionId) row.push(collectionId)
                return `(${row
                    .map((value) => {
                        values.push(value)
                        return `$${values.length}`
                    })
                    .join(', ')})`
            })
            const assignments = columns
                .filter((column) => column !== this.idColumnName && column !== 'collection_id')
                .map((column) => `"${column}" = EXCLUDED."${column}"`)
                .join(', ')
            const result = await this.pool.query(
                `INSERT INTO ${this.computedTableName} AS target
                (${columns.map((column) => `"${column}"`).join(', ')}) VALUES ${rows.join(', ')}
                ON CONFLICT ("${this.idColumnName}") DO UPDATE SET ${assignments}
                ${collectionId ? 'WHERE target."collection_id" IS NOT DISTINCT FROM EXCLUDED."collection_id"' : ''}`,
                values
            )
            if (result.rowCount !== rows.length) {
                throw new Error(
                    t('server-ai:Error.KnowledgebaseVectorCollectionConflict', {
                        defaultValue: 'A vector identifier belongs to another collection.'
                    })
                )
            }
        }
    }

    async structuredSimilaritySearchWithScore(
        query: string,
        k: number,
        filter: StructuredVectorSearchFilter
    ): Promise<StructuredVectorSearchResult> {
        const embedding = await this.embeddings.embedQuery(query)
        return this.structuredSimilaritySearchVectorWithScore(embedding, k, filter)
    }

    async structuredSimilaritySearchVectorWithScore(
        embedding: number[],
        k: number,
        filter: StructuredVectorSearchFilter
    ): Promise<StructuredVectorSearchResult> {
        if (!filter.postgres) {
            throw new Error('PGVector structured search requires a PostgreSQL filter.')
        }
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
