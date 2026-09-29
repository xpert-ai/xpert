import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata } from '@xpert-ai/contracts'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { getErrorMessage } from '@xpert-ai/server-common'
import { t } from 'i18next'
import { DataSource } from 'typeorm'
import {
    KeywordRetrievalDocument,
    KeywordRetrievalRow,
    KeywordRetrievalState,
    KnowledgeCandidateRetriever,
    KnowledgeRetrievalBatch,
    KnowledgeRetrievalRequest
} from './types'
import { KnowledgeKeywordIndexService } from './knowledge-keyword-index.service'
import { postgresContentScopePredicate } from './content-scope'
import { KeywordQueryPlan } from '../analyzer/keyword-query'
import { keywordCandidateQuery } from './keyword-candidate-query'
import { KnowledgeKeywordAnalyzerService } from '../analyzer/keyword-analyzer.service'

const MAX_KEYWORD_TERMS = 12
const MAX_KEYWORD_CANDIDATES = 400
// Final Top K is applied by the handler; this multiplier is the logical candidate target.
const KEYWORD_OVERSAMPLING = 4
// Double refill pages after parent collapse, while sharing the 400-row request budget.
const KEYWORD_REFILL_GROWTH = 2

type KeywordParentRow = Omit<KeywordRetrievalRow, 'parentChunkId' | 'keywordScore' | 'coverage' | 'titleOnly'>

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

function toFiniteNumber(value: number | string) {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? number : 0
}

function keywordRankingScore(row: KeywordRetrievalRow) {
    const score = toFiniteNumber(row.keywordScore)
    // The handler sorts by relevanceScore again. Keep FTS as a bounded tie-breaker
    // so it cannot overturn coverage (and thus strict-before-relaxed) ordering.
    return row.coverage == null ? score : toFiniteNumber(row.coverage) + score / (1 + score)
}

function toKeywordDocument(
    row: KeywordParentRow | KeywordRetrievalRow,
    keywordScore: number,
    rankingScore: number
): KeywordRetrievalDocument {
    return {
        id: row.chunkRowId,
        pageContent: row.pageContent ?? '',
        metadata: {
            ...(row.metadata ?? {}),
            documentId: row.documentId,
            chunkId: row.chunkId,
            keywordScore,
            score: rankingScore,
            relevanceScore: rankingScore
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
    @Inject(KnowledgeKeywordAnalyzerService)
    private readonly keywordAnalyzers: KnowledgeKeywordAnalyzerService

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
        if (!normalizedQuery || (!request.knowledgebase.keywordAnalyzer && !terms.length)) {
            return {
                source: this.source,
                candidates: [],
                exhausted: true,
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
            const analyzedQuery = request.knowledgebase.keywordAnalyzer
                ? await this.keywordAnalyzers.queryPlan(request.knowledgebase, request.query)
                : undefined
            if (analyzedQuery?.strict === '') {
                return {
                    source: this.source,
                    candidates: [],
                    exhausted: true,
                    diagnostics: {
                        ...diagnostics,
                        keywordLatency: Date.now() - startedAt,
                        keywordCandidateCount: 0,
                        keywordBranchHitCount: 0,
                        hitCount: 0
                    }
                }
            }
            const indexStatus =
                analyzedQuery !== undefined
                    ? await this.keywordIndexService.vectorStatus()
                    : await this.keywordIndexService.status()
            diagnostics.keywordIndexStatus = indexStatus.ready ? 'ready' : 'missing'
            if (!indexStatus.ready) {
                const defaultValue =
                    'Knowledge keyword indexes are missing. Create the required PostgreSQL indexes before enabling keyword retrieval.'
                const error =
                    t('server-ai:Error.KeywordIndexMissing', {
                        defaultValue
                    }) || defaultValue
                return this.failedBatch(diagnostics, error, startedAt)
            }

            const candidateK = Math.min(
                MAX_KEYWORD_CANDIDATES,
                Math.max(1, request.k ?? request.knowledgebase.recall?.topK ?? 10) * KEYWORD_OVERSAMPLING
            )
            const phases = analyzedQuery?.relaxed ? [false, true] : [false]
            const queryKey = `${request.knowledgebase.id}:${normalizedQuery}:${analyzedQuery?.strict ?? 'legacy'}`
            const session = this.createOrReuseSession(request, queryKey, candidateK, phases)
            let documents = session.documents
            while (!session.exhausted && !session.budgetLimited && session.scanned < MAX_KEYWORD_CANDIDATES) {
                const phase = session.phases[session.phaseIndex]
                if (!phase) {
                    session.exhausted = true
                    break
                }
                const bodyBackedDocuments = new Set(
                    session.rows.filter(({ titleOnly }) => !titleOnly).map(({ documentId }) => documentId)
                )
                const needsBodyRefill = !!analyzedQuery?.relaxed && bodyBackedDocuments.size < candidateK
                if (documents.length >= candidateK && !needsBodyRefill) break
                const requestedWindow = Math.min(phase.pageWindow, MAX_KEYWORD_CANDIDATES - session.scanned)
                const window = request.faqSession
                    ? request.faqSession.budget.reserveCandidates(requestedWindow)
                    : requestedWindow
                if (!window) {
                    session.budgetLimited = true
                    break
                }
                const page = await this.searchCandidates(
                    request,
                    normalizedQuery,
                    terms,
                    window,
                    phase.offset,
                    analyzedQuery,
                    phase.relaxed
                )
                session.scanned += page.length
                phase.offset += page.length
                phase.pageWindow *= KEYWORD_REFILL_GROWTH
                const seen = new Set(session.rows.map((row) => row.chunkRowId))
                session.rows.push(...page.filter((row) => !seen.has(row.chunkRowId)))
                documents = await this.resolveDocuments(request, session.rows)
                session.documents = documents
                const bodyBackedDocumentsAfterPage = new Set(
                    session.rows.filter(({ titleOnly }) => !titleOnly).map(({ documentId }) => documentId)
                )
                const needsBodyRefillAfterPage =
                    !!analyzedQuery?.relaxed && bodyBackedDocumentsAfterPage.size < candidateK
                if (page.length < window) {
                    phase.exhausted = true
                    session.phaseIndex += 1
                    if (session.phaseIndex >= session.phases.length) session.exhausted = true
                } else if (documents.length >= candidateK && !needsBodyRefillAfterPage) {
                    break
                }
            }
            session.budgetLimited ||= session.scanned >= MAX_KEYWORD_CANDIDATES && !session.exhausted
            diagnostics.keywordCandidateCount = session.scanned
            diagnostics.keywordLatency = Date.now() - startedAt
            diagnostics.keywordBranchHitCount = documents.length
            diagnostics.hitCount = documents.length
            diagnostics.retryableWithoutDynamic = documents.length === 0 && !!request.preparedFilter.sources.dynamic

            return {
                source: this.source,
                candidates: documents.map((document, index) => ({ document, rank: index + 1 })),
                exhausted: session.exhausted,
                budgetLimited: session.budgetLimited,
                diagnostics
            }
        } catch (error) {
            return this.failedBatch(diagnostics, getErrorMessage(error), startedAt)
        }
    }

    private createOrReuseSession(
        request: KnowledgeRetrievalRequest,
        queryKey: string,
        candidateK: number,
        phases: boolean[]
    ): KeywordRetrievalState {
        const existing = request.faqSession?.keywordState
        if (existing?.queryKey === queryKey) return existing
        const state: KeywordRetrievalState = {
            queryKey,
            rows: [],
            documents: [],
            scanned: 0,
            phaseIndex: 0,
            exhausted: false,
            budgetLimited: false,
            phases: phases.map((relaxed) => ({ relaxed, offset: 0, pageWindow: candidateK, exhausted: false }))
        }
        if (request.faqSession) request.faqSession.keywordState = state
        return state
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
        terms: string[],
        window: number,
        offset: number,
        plan?: KeywordQueryPlan,
        relaxed = false
    ): Promise<KeywordRetrievalRow[]> {
        const { sql, parameters } = keywordCandidateQuery(
            request,
            normalizedQuery,
            terms,
            window,
            offset,
            plan,
            relaxed
        )
        return this.dataSource.query<KeywordRetrievalRow[]>(sql, parameters)
    }

    private async resolveDocuments(
        request: KnowledgeRetrievalRequest,
        rows: KeywordRetrievalRow[]
    ): Promise<KeywordRetrievalDocument[]> {
        const parentChunkIds = new Set(
            rows.map(({ parentChunkId }) => parentChunkId).filter((id): id is string => !!id)
        )
        const bodyDocumentIds = new Set(rows.filter(({ titleOnly }) => !titleOnly).map(({ documentId }) => documentId))
        const directDocuments = rows
            .filter(
                ({ parentChunkId, chunkId, documentId, titleOnly }) => !titleOnly || !bodyDocumentIds.has(documentId)
            )
            .filter(({ parentChunkId, chunkId }) => !parentChunkId && !parentChunkIds.has(chunkId))
            .map((row) => ({
                document: toKeywordDocument(row, toFiniteNumber(row.keywordScore), keywordRankingScore(row)),
                rank: rows.indexOf(row) + 1
            }))

        if (!parentChunkIds.size) {
            return directDocuments.sort((left, right) => left.rank - right.rank).map(({ document }) => document)
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
            const document = toKeywordDocument(parent, keywordScore, keywordRankingScore(rows[rank - 1]))
            document.children = childRows.map((row) =>
                toKeywordDocument(row, toFiniteNumber(row.keywordScore), keywordRankingScore(row))
            )
            return [{ document, rank }]
        })

        return [...directDocuments, ...parentDocuments]
            .sort((left, right) => left.rank - right.rank)
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
               AND COALESCE(c."metadata" ->> 'chunkId', c."id"::text) = ANY($4::text[])
               AND (${postgresContentScopePredicate(request.contentScope)})`,
            [request.scope.tenantId, request.scope.organizationId, request.knowledgebase.id, parentChunkIds]
        )
    }
}
