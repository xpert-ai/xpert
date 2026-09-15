import {
    KBDocumentCategoryEnum,
    type KnowledgeChunkLanguageDetection,
    type KnowledgeChunkLanguageDecision
} from '@xpert-ai/contracts'
import type {
    ITextSplitterStrategy,
    ChunkMetadata,
    TextSplitterExecutionContext,
    TextSplitterResult
} from '@xpert-ai/plugin-sdk'
import type { DocumentInterface } from '@langchain/core/documents'
import { invalidKnowledgeParserConfig, validateMaxChunkTokens, validateChunkLanguageHint } from './parser-validation'
import { limitChunkTokens } from './token-limited-chunks'
import { detectChunkLanguage } from './chunk-language'

export interface KnowledgeSplitterExecutionContext extends TextSplitterExecutionContext {
    category?: KBDocumentCategoryEnum
    documentId?: string
    /** Prepared once before preprocessing/cache lookup for all batches of an enclosing document. */
    languageDetection?: KnowledgeChunkLanguageDetection
}

/** One preparation owner for raw document samples, including loader batches and settings previews. */
export function resolveKnowledgeLanguage(
    strategy: ITextSplitterStrategy,
    documents: Iterable<DocumentInterface<ChunkMetadata>>
): KnowledgeChunkLanguageDetection | undefined {
    return strategy?.meta?.supportsLanguageHint ? detectChunkLanguage(documents) : undefined
}

/** One execution boundary for the loader, lightweight preview and standalone pipeline chunker. */
export async function executeKnowledgeSplitter(
    strategy: ITextSplitterStrategy,
    documents: DocumentInterface<ChunkMetadata>[],
    value: unknown,
    context: KnowledgeSplitterExecutionContext = {}
): Promise<TextSplitterResult> {
    if (!strategy) throw invalidKnowledgeParserConfig('textSplitterType')
    if (value === undefined) value = {}
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidKnowledgeParserConfig('textSplitter')
    const envelope = 'maxChunkTokens' in value ? value.maxChunkTokens : undefined
    const maxChunkTokens = envelope === undefined ? context.maxChunkTokens : envelope
    validateMaxChunkTokens(maxChunkTokens)
    validateChunkLanguageHint(context.languageHint)
    const languageHint = context.languageHint ?? 'auto'
    const options = { ...value }
    if ('maxChunkTokens' in options) delete options.maxChunkTokens
    if ('chunkLanguageHint' in options) delete options.chunkLanguageHint
    if ('languageHint' in options) delete options.languageHint
    if (strategy.meta?.chunkingCapabilities && context.category === KBDocumentCategoryEnum.Sheet) {
        throw invalidKnowledgeParserConfig('text chunking is not applicable to spreadsheets')
    }
    await strategy.validateConfig?.(options)
    if ((strategy.meta?.chunkingCapabilities || strategy.meta?.supportsLanguageHint) && context.documentId) {
        documents = documents.map((document) => ({
            ...document,
            metadata: { ...document.metadata, documentId: document.metadata.documentId || context.documentId }
        }))
    }
    const languages: KnowledgeChunkLanguageDecision[] = []
    const resolvedLanguages = new Map<
        DocumentInterface<ChunkMetadata>,
        KnowledgeChunkLanguageDecision['resolvedLanguage']
    >()
    if (strategy.meta?.supportsLanguageHint) {
        const groups = new Map<string | DocumentInterface<ChunkMetadata>, number[]>()
        documents.forEach((document, index) => {
            const key = document.metadata.documentId || context.documentId || document
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key).push(index)
        })
        for (const sourceIndexes of groups.values()) {
            const detection =
                context.languageDetection ??
                resolveKnowledgeLanguage(
                    strategy,
                    sourceIndexes.map((index) => documents[index])
                )
            const resolvedLanguage = languageHint === 'auto' ? (detection.detectedLanguage ?? 'Mixed') : languageHint
            languages.push({ ...detection, sourceIndexes, languageHint, resolvedLanguage })
            for (const index of sourceIndexes) resolvedLanguages.set(documents[index], resolvedLanguage)
        }
    }
    const executionContext: TextSplitterExecutionContext = {
        maxChunkTokens,
        ...(strategy.meta?.supportsLanguageHint
            ? {
                  languageHint,
                  resolvedLanguage: languages.length === 1 ? languages[0].resolvedLanguage : undefined,
                  resolvedLanguages
              }
            : {})
    }
    const result =
        strategy.meta?.chunkingCapabilities?.tokenBudget || strategy.meta?.supportsLanguageHint
            ? await strategy.splitDocuments(documents, options, executionContext)
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
    return { ...result, chunks, ...(languages.length ? { languages } : {}) }
}
