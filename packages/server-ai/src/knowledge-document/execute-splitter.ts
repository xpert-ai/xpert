import { KBDocumentCategoryEnum } from '@xpert-ai/contracts'
import type {
    ITextSplitterStrategy,
    ChunkMetadata,
    TextSplitterExecutionContext,
    TextSplitterResult
} from '@xpert-ai/plugin-sdk'
import type { DocumentInterface } from '@langchain/core/documents'
import { invalidKnowledgeParserConfig, validateMaxChunkTokens } from './parser-validation'
import { limitChunkTokens } from './token-limited-chunks'

/** One execution boundary for the loader, lightweight preview and standalone pipeline chunker. */
export async function executeKnowledgeSplitter(
    strategy: ITextSplitterStrategy,
    documents: DocumentInterface<ChunkMetadata>[],
    value: unknown,
    context: TextSplitterExecutionContext & { category?: KBDocumentCategoryEnum; documentId?: string } = {}
): Promise<TextSplitterResult> {
    if (!strategy) throw invalidKnowledgeParserConfig('textSplitterType')
    if (value === undefined) value = {}
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidKnowledgeParserConfig('textSplitter')
    const envelope = 'maxChunkTokens' in value ? value.maxChunkTokens : undefined
    const maxChunkTokens = envelope === undefined ? context.maxChunkTokens : envelope
    validateMaxChunkTokens(maxChunkTokens)
    const options = { ...value }
    if ('maxChunkTokens' in options) delete options.maxChunkTokens
    if (strategy.meta?.chunkingCapabilities && context.category === KBDocumentCategoryEnum.Sheet) {
        throw invalidKnowledgeParserConfig('text chunking is not applicable to spreadsheets')
    }
    await strategy.validateConfig?.(options)
    if (strategy.meta?.chunkingCapabilities && context.documentId) {
        documents = documents.map((document) => ({
            ...document,
            metadata: { ...document.metadata, documentId: document.metadata.documentId || context.documentId }
        }))
    }
    const result = strategy.meta?.chunkingCapabilities?.tokenBudget
        ? await strategy.splitDocuments(documents, options, { maxChunkTokens })
        : await strategy.splitDocuments(documents, options)
    if (strategy.meta?.chunkingCapabilities && result.chunks.length > 10000) {
        throw invalidKnowledgeParserConfig('structured output (at most 10000 chunks)')
    }
    const chunks = limitChunkTokens(result.chunks, maxChunkTokens)
    if (strategy.meta?.chunkingCapabilities) {
        if (chunks.length > 10000) throw invalidKnowledgeParserConfig('structured output (at most 10000 chunks)')
        const originalIds = new Set(result.chunks.map((chunk) => chunk.metadata.chunkId))
        const splitInputs = new Set<string>()
        for (const chunk of chunks) {
            if (!chunk.metadata.chunking || originalIds.has(chunk.metadata.chunkId)) continue
            if (chunk.metadata.searchContent !== undefined) chunk.metadata.searchContent = chunk.pageContent
            chunk.metadata.chunking = {
                ...chunk.metadata.chunking,
                continued: true,
                sourceRanges: [],
                contextRanges: [],
                warnings: [...new Set([...chunk.metadata.chunking.warnings, 'structure-split' as const])]
            }
            splitInputs.add(chunk.metadata.chunking.inputHash)
        }
        for (const decision of result.decisions ?? []) {
            if (splitInputs.has(decision.inputHash) && !decision.warnings.includes('structure-split')) {
                decision.warnings.push('structure-split')
            }
        }
    }
    return { ...result, chunks }
}
