import { DocumentInterface } from '@langchain/core/documents'
import { KnowledgeFilterDiagnostics } from '@xpert-ai/contracts'

export type KnowledgebaseCitation = {
    index: number
    chunkId?: string
    documentId?: string
    knowledgebaseId?: string
    documentName?: string
    fileUrl?: string
    mimeType?: string
    score?: number
    relevanceScore?: number
    snippet?: string
    metadata?: unknown
    citationLabel?: string
    citationUrl?: string
    citationMarkdown?: string
}

export type KnowledgebaseRetrievalChunk = KnowledgebaseCitation & {
    content: string
}

export type KnowledgebaseRetrievalToolOutput = {
    chunks: KnowledgebaseRetrievalChunk[]
    citations: KnowledgebaseCitation[]
    instructions: string
    diagnostics?: KnowledgeFilterDiagnostics[]
}

// Keep the link contract centralized so every retriever/tool prompt asks for the same Markdown form.
export const KNOWLEDGEBASE_CITATION_MARKDOWN_INSTRUCTION =
    'When using a chunk in the final answer, append its citationMarkdown immediately after the supported sentence or paragraph. Use the exact citationMarkdown string verbatim as an inline Markdown link in the form [label](url); do not rewrite it as a footnote, plain [1], reference-style link, bare URL, or separate source list.'

export function createKnowledgebaseCitationUrl(input: {
    knowledgebaseId: string
    documentId: string
    chunkId?: string
}) {
    const searchParams = new URLSearchParams({
        knowledgebaseId: input.knowledgebaseId,
        documentId: input.documentId
    })
    if (input.chunkId) {
        searchParams.set('chunkId', input.chunkId)
    }
    return `xpert://knowledgebase/chunk?${searchParams.toString()}`
}

export function addKnowledgebaseCitationLink<T extends KnowledgebaseCitation>(
    citation: T,
    fallbackKnowledgebaseId?: string
): T {
    const knowledgebaseId = citation.knowledgebaseId ?? fallbackKnowledgebaseId
    const citationLabel = `⟦${citation.index}⟧`
    // The agent receives this exact string and should copy it verbatim into the final answer.
    const citationUrl =
        citation.documentId && knowledgebaseId
            ? createKnowledgebaseCitationUrl({
                  knowledgebaseId,
                  documentId: citation.documentId,
                  chunkId: citation.chunkId
              })
            : undefined

    return {
        ...citation,
        ...(knowledgebaseId ? { knowledgebaseId } : {}),
        citationLabel,
        ...(citationUrl
            ? {
                  citationUrl,
                  citationMarkdown: `[${citationLabel}](${citationUrl})`
              }
            : {})
    }
}

export function createKnowledgebaseCitationFromDocument(
    doc: DocumentInterface<Record<string, any>>,
    index: number,
    fallbackKnowledgebaseId?: string
): KnowledgebaseCitation {
    const metadata = getRecord(doc.metadata) ?? {}
    const relationDocument = getRecord((doc as unknown as { document?: unknown }).document)
    const documentId =
        getString(metadata.documentId) ?? getString(metadata.knowledgeId) ?? getString(relationDocument?.id)
    const chunkId = getString(metadata.chunkId) ?? getString((doc as unknown as { id?: unknown }).id)
    const score = getNumber(metadata.score)
    const relevanceScore = getNumber(metadata.relevanceScore)

    return addKnowledgebaseCitationLink(
        {
            index,
            ...(chunkId ? { chunkId } : {}),
            ...(documentId ? { documentId } : {}),
            knowledgebaseId: getString(metadata.knowledgebaseId),
            documentName:
                getString(relationDocument?.name) ??
                getString(metadata.title) ??
                getString(metadata.originalFileName) ??
                getString(metadata.filename),
            fileUrl: getString(relationDocument?.fileUrl) ?? getString(metadata.fileUrl),
            mimeType: getString(relationDocument?.mimeType) ?? getString(metadata.mimeType),
            ...(score !== undefined ? { score } : {}),
            ...(relevanceScore !== undefined ? { relevanceScore } : {}),
            snippet: trimSnippet(doc.pageContent, 1200),
            metadata: sanitizeKnowledgebaseCitationMetadata(metadata)
        },
        fallbackKnowledgebaseId
    )
}

export function formatKnowledgebaseRetrievalToolOutput(
    docs: DocumentInterface<Record<string, any>>[],
    fallbackKnowledgebaseId?: string,
    diagnostics?: KnowledgeFilterDiagnostics[]
) {
    const chunks = docs.map((doc, index) => ({
        ...createKnowledgebaseCitationFromDocument(doc, index + 1, fallbackKnowledgebaseId),
        content: doc.pageContent
    }))
    // Citation summaries deliberately avoid repeating chunk metadata. The chunk already
    // carries the compact provenance needed by the Agent and citation URL.
    const citations = chunks.map(({ content, metadata: _metadata, ...citation }) => citation)

    return JSON.stringify(
        {
            chunks,
            citations,
            instructions: KNOWLEDGEBASE_CITATION_MARKDOWN_INSTRUCTION,
            ...(diagnostics?.length ? { diagnostics } : {})
        } satisfies KnowledgebaseRetrievalToolOutput,
        null,
        2
    )
}

/**
 * Keep retrieval provenance useful to an Agent without copying document-scale analysis
 * payloads into every matching chunk. In particular, OCR transformers may attach the
 * complete Markdown source map to source metadata; repeating that map for top-K hits can
 * turn a small retrieval into a multi-megabyte model request. The durable sourceMapAsset,
 * chunk/page/block locators and provider metadata remain available for exact trace-back.
 */
function sanitizeKnowledgebaseCitationMetadata(metadata: Record<string, unknown>) {
    const {
        children: _children,
        documentLayout: _documentLayout,
        markdownSourceMap: _markdownSourceMap,
        raw: _raw,
        ...bounded
    } = metadata
    return bounded
}

function trimSnippet(value: string | undefined, maxLength: number) {
    const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
    if (normalized.length <= maxLength) {
        return normalized
    }
    return normalized.slice(0, maxLength - 1).trimEnd() + '…'
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function getString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
