import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata } from '@xpert-ai/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import { getErrorMessage } from '@xpert-ai/server-common'
import { t } from 'i18next'
import { DataSource } from 'typeorm'
import { TDocChunkMetadata } from '../../knowledge-document/types'
import { compileKnowledgeFilterToPostgres } from '../filter'
import { shiftKnowledgeFilterParameters } from '../filter/knowledge-graph-filter-scope'
import { KnowledgeCandidateRetriever, KnowledgeRetrievalBatch, KnowledgeRetrievalRequest } from './types'
import { KnowledgeKeywordIndexService } from './knowledge-keyword-index.service'

const MAX_KEYWORD_TERMS = 12
const MAX_KEYWORD_CANDIDATES = 400
const KEYWORD_OVERSAMPLING = 4
const MIN_TRIGRAM_QUERY_LENGTH = 3

type KeywordCandidateRow = {
    chunkRowId: string
    chunkId: string
    parentChunkId?: string | null
    pageContent: string | null
    metadata: TDocChunkMetadata | null
    documentId: string
    documentName?: string | null
    sourceType?: string | null
    fileExtension?: string | null
    category?: string | null
    fileUrl?: string | null
    keywordScore: number | string
}

type KeywordParentRow = Omit<KeywordCandidateRow, 'parentChunkId' | 'keywordScore'>

type KeywordDocument = DocumentInterface<DocumentMetadata> & {
    id: string
    children?: KeywordDocument[]
    document: {
        id: string
        name?: string | null
        sourceType?: string | null
        type?: string | null
        category?: string | null
        fileUrl?: string | null
    }
}

export function normalizeKeywordQuery(query: string) {
    return query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function extractKeywordTerms(query: string) {
    const normalized = normalizeKeywordQuery(query)
    if (!normalized) return []
    return [
        ...new Set(
            normalized
                .match(/[\p{L}\p{N}_-]+/gu)
                ?.map((term) => term.trim())
                .filter((term) => /[\p{L}\p{N}]/u.test(term)) ?? []
        )
    ].slice(0, MAX_KEYWORD_TERMS)
}

function escapeLike(value: string) {
    return value.replace(/[\\%_]/g, '\\$&')
}

function supportsTrigramSearch(value: string) {
    return Array.from(value).length >= MIN_TRIGRAM_QUERY_LENGTH
}

function toFiniteNumber(value: number | string) {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? number : 0
}

function toKeywordDocument(row: KeywordParentRow | KeywordCandidateRow, keywordScore: number): KeywordDocument {
    return {
        id: row.chunkRowId,
        pageContent: row.pageContent ?? '',
        metadata: {
            ...(row.metadata ?? {}),
            chunkId: row.chunkId,
            keywordScore,
            score: keywordScore,
            relevanceScore: keywordScore
        },
        document: {
            id: row.documentId,
            name: row.documentName,
            sourceType: row.sourceType,
            type: row.fileExtension,
            category: row.category,
            fileUrl: row.fileUrl
        }
    }
}

@Injectable()
export class KeywordKnowledgeCandidateRetriever implements KnowledgeCandidateRetriever {
    readonly source = 'keyword' as const

    constructor(
        private readonly dataSource: DataSource,
        private readonly keywordIndexService: KnowledgeKeywordIndexService
    ) {}

    async retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalBatch> {
        if (this.dataSource.options.type !== 'postgres') {
            const defaultValue = 'Keyword retrieval currently requires PostgreSQL.'
            throw new BadRequestException(
                t('server-ai:Error.KeywordRetrievalPostgresRequired', {
                    defaultValue
                }) || defaultValue
            )
        }

        const normalizedQuery = normalizeKeywordQuery(request.query)
        const terms = extractKeywordTerms(normalizedQuery)
        const diagnostics = { ...request.preparedFilter.diagnostics }
        if (!normalizedQuery || !terms.length) {
            return {
                source: this.source,
                candidates: [],
                diagnostics: {
                    ...diagnostics,
                    keywordLatency: 0,
                    keywordCandidateCount: 0,
                    keywordBranchHitCount: 0,
                    hitCount: 0
                }
            }
        }

        const startedAt = Date.now()
        try {
            const indexStatus = await this.keywordIndexService.status()
            diagnostics.keywordIndexStatus = indexStatus.ready ? 'ready' : 'missing'
            if (!indexStatus.ready) {
                const defaultValue =
                    'Knowledge keyword indexes are missing. Create the required PostgreSQL indexes before enabling RRF.'
                const error =
                    t('server-ai:Error.KeywordIndexMissing', {
                        defaultValue
                    }) || defaultValue
                return this.failedBatch(diagnostics, error, startedAt)
            }

            const rows = await this.searchCandidates(request, normalizedQuery, terms)
            diagnostics.keywordCandidateCount = rows.length
            const documents = await this.resolveDocuments(request, rows)
            diagnostics.keywordLatency = Date.now() - startedAt
            diagnostics.keywordBranchHitCount = documents.length
            diagnostics.hitCount = documents.length
            diagnostics.retryableWithoutDynamic = documents.length === 0 && !!request.preparedFilter.sources.dynamic

            return {
                source: this.source,
                candidates: documents.map((document, index) => ({ document, rank: index + 1 })),
                diagnostics
            }
        } catch (error) {
            return this.failedBatch(diagnostics, getErrorMessage(error), startedAt)
        }
    }

    private failedBatch(
        diagnostics: KnowledgeRetrievalBatch['diagnostics'],
        error: string,
        startedAt: number
    ): KnowledgeRetrievalBatch {
        diagnostics.keywordLatency = Date.now() - startedAt
        diagnostics.keywordCandidateCount ??= 0
        diagnostics.keywordBranchHitCount = 0
        diagnostics.keywordFailureReason = error
        diagnostics.hitCount = 0
        diagnostics.errors = [...(diagnostics.errors ?? []), error]
        return { source: this.source, candidates: [], diagnostics, failed: true, error }
    }

    private async searchCandidates(
        request: KnowledgeRetrievalRequest,
        normalizedQuery: string,
        terms: string[]
    ): Promise<KeywordCandidateRow[]> {
        const { knowledgebase: kb, preparedFilter } = request
        const parameters: unknown[] = [request.scope.tenantId, request.scope.organizationId, kb.id]
        const compiled = preparedFilter.effective
            ? compileKnowledgeFilterToPostgres(preparedFilter.effective, preparedFilter.registry)
            : { sql: 'TRUE', parameters: [] }
        const compiledSql = shiftKnowledgeFilterParameters(compiled.sql, parameters.length)
        parameters.push(...compiled.parameters)

        parameters.push(normalizedQuery)
        const exactQueryParameter = `$${parameters.length}`
        const fullTextMatch =
            `to_tsvector('simple', COALESCE(c."pageContent", '')) ` +
            `@@ plainto_tsquery('simple', ${exactQueryParameter})`
        const fullTextRank =
            `ts_rank_cd(to_tsvector('simple', COALESCE(c."pageContent", '')), ` +
            `plainto_tsquery('simple', ${exactQueryParameter}))`
        const phrasePatternParameter = supportsTrigramSearch(normalizedQuery)
            ? (() => {
                  parameters.push(`%${escapeLike(normalizedQuery)}%`)
                  return `$${parameters.length}`
              })()
            : undefined
        const termPatternParameters = terms.filter(supportsTrigramSearch).map((term) => {
            parameters.push(`%${escapeLike(term)}%`)
            return `$${parameters.length}`
        })
        const searchableExpressions = [phrasePatternParameter, ...termPatternParameters]
            .filter((parameter): parameter is string => !!parameter)
            .map(
                (parameter) =>
                    `(c."pageContent" ILIKE ${parameter} ESCAPE '\\' OR COALESCE(d."name", '') ILIKE ${parameter} ESCAPE '\\')`
            )
        const termScore = termPatternParameters
            .map(
                (parameter) =>
                    `(CASE WHEN c."pageContent" ILIKE ${parameter} ESCAPE '\\' THEN 1 ELSE 0 END + ` +
                    `CASE WHEN COALESCE(d."name", '') ILIKE ${parameter} ESCAPE '\\' THEN 0.5 ELSE 0 END)`
            )
            .join(' + ')
        const phraseContentScore = phrasePatternParameter
            ? `CASE WHEN c."pageContent" ILIKE ${phrasePatternParameter} ESCAPE '\\' THEN 2 ELSE 0 END`
            : '0'
        const phraseDocumentScore = phrasePatternParameter
            ? `CASE WHEN COALESCE(d."name", '') ILIKE ${phrasePatternParameter} ESCAPE '\\' THEN 1 ELSE 0 END`
            : '0'
        const matchExpressions = [fullTextMatch, ...searchableExpressions]
        const topK = Math.max(1, request.k ?? kb.recall?.topK ?? 10)
        parameters.push(Math.min(MAX_KEYWORD_CANDIDATES, topK * KEYWORD_OVERSAMPLING))
        const limitParameter = `$${parameters.length}`

        return this.dataSource.query<KeywordCandidateRow[]>(
            `SELECT
                c."id" AS "chunkRowId",
                COALESCE(c."metadata" ->> 'chunkId', c."id"::text) AS "chunkId",
                c."metadata" ->> 'parentId' AS "parentChunkId",
                c."pageContent" AS "pageContent",
                c."metadata" AS "metadata",
                d."id" AS "documentId",
                d."name" AS "documentName",
                d."sourceType" AS "sourceType",
                d."type" AS "fileExtension",
                d."category" AS "category",
                d."fileUrl" AS "fileUrl",
                (
                    CASE WHEN lower(COALESCE(c."pageContent", '')) = ${exactQueryParameter} THEN 4 ELSE 0 END
                    + ${fullTextRank} * 4
                    + ${phraseContentScore}
                    + ${phraseDocumentScore}
                    + ${termScore || '0'}
                )::double precision AS "keywordScore"
             FROM "knowledge_document_chunk" c
             INNER JOIN "knowledge_document" d ON d."id" = c."documentId"
             WHERE c."tenantId" IS NOT DISTINCT FROM $1
               AND c."organizationId" IS NOT DISTINCT FROM $2
               AND c."knowledgebaseId" = $3
               AND d."tenantId" IS NOT DISTINCT FROM $1
               AND d."organizationId" IS NOT DISTINCT FROM $2
               AND d."knowledgebaseId" = $3
               AND COALESCE(d."disabled", FALSE) = FALSE
               AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
               AND (${compiledSql})
               AND (${matchExpressions.join(' OR ')})
             ORDER BY "keywordScore" DESC, length(COALESCE(c."pageContent", '')) ASC, c."id"
             LIMIT ${limitParameter}`,
            parameters
        )
    }

    private async resolveDocuments(
        request: KnowledgeRetrievalRequest,
        rows: KeywordCandidateRow[]
    ): Promise<KeywordDocument[]> {
        const topK = Math.max(1, request.k ?? request.knowledgebase.recall?.topK ?? 10)
        const parentChunkIds = new Set(
            rows.map(({ parentChunkId }) => parentChunkId).filter((id): id is string => !!id)
        )
        const directDocuments = rows
            .filter(({ parentChunkId, chunkId }) => !parentChunkId && !parentChunkIds.has(chunkId))
            .map((row) => ({
                document: toKeywordDocument(row, toFiniteNumber(row.keywordScore)),
                rank: rows.indexOf(row) + 1
            }))

        if (!parentChunkIds.size) {
            return directDocuments
                .sort((left, right) => left.rank - right.rank)
                .slice(0, topK)
                .map(({ document }) => document)
        }

        const parents = await this.loadParents(request, [...parentChunkIds])
        const parentByChunkId = new Map(parents.map((parent) => [parent.chunkId, parent]))
        const parentDocuments = [...parentChunkIds].flatMap((parentChunkId) => {
            const parent = parentByChunkId.get(parentChunkId)
            if (!parent) return []
            const childRows = rows.filter(({ parentChunkId: childParentId }) => childParentId === parentChunkId)
            if (!childRows.length) return []
            const matchedParent = rows.find(
                ({ parentChunkId: candidateParentId, chunkId }) => !candidateParentId && chunkId === parentChunkId
            )
            const contributingRows = matchedParent ? [matchedParent, ...childRows] : childRows
            const rank = Math.min(...contributingRows.map((row) => rows.indexOf(row) + 1))
            const keywordScore = Math.max(...contributingRows.map(({ keywordScore }) => toFiniteNumber(keywordScore)))
            const document = toKeywordDocument(parent, keywordScore)
            document.children = childRows.map((row) => toKeywordDocument(row, toFiniteNumber(row.keywordScore)))
            return [{ document, rank }]
        })

        return [...directDocuments, ...parentDocuments]
            .sort((left, right) => left.rank - right.rank)
            .slice(0, topK)
            .map(({ document }) => document)
    }

    private loadParents(request: KnowledgeRetrievalRequest, parentChunkIds: string[]) {
        return this.dataSource.query<KeywordParentRow[]>(
            `SELECT
                c."id" AS "chunkRowId",
                COALESCE(c."metadata" ->> 'chunkId', c."id"::text) AS "chunkId",
                c."pageContent" AS "pageContent",
                c."metadata" AS "metadata",
                d."id" AS "documentId",
                d."name" AS "documentName",
                d."sourceType" AS "sourceType",
                d."type" AS "fileExtension",
                d."category" AS "category",
                d."fileUrl" AS "fileUrl"
             FROM "knowledge_document_chunk" c
             INNER JOIN "knowledge_document" d ON d."id" = c."documentId"
             WHERE c."tenantId" IS NOT DISTINCT FROM $1
               AND c."organizationId" IS NOT DISTINCT FROM $2
               AND c."knowledgebaseId" = $3
               AND d."tenantId" IS NOT DISTINCT FROM $1
               AND d."organizationId" IS NOT DISTINCT FROM $2
               AND d."knowledgebaseId" = $3
               AND COALESCE(d."disabled", FALSE) = FALSE
               AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
               AND COALESCE(c."metadata" ->> 'chunkId', c."id"::text) = ANY($4::text[])`,
            [request.scope.tenantId, request.scope.organizationId, request.knowledgebase.id, parentChunkIds]
        )
    }
}
