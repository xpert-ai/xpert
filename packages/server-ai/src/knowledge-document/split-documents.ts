import {
    DEFAULT_KNOWLEDGE_TEXT_SPLITTER,
    DocumentTextParserConfig,
    IKnowledgeDocument,
    IKnowledgeDocumentChunk
} from '@xpert-ai/contracts'
import { TextSplitterRegistry } from '@xpert-ai/plugin-sdk'
import { TDocChunkMetadata } from './types'
import { resolveKnowledgeDocumentParserConfig } from './parser-config'
import { invalidKnowledgeParserConfig, validateMaxChunkTokens } from './parser-validation'
import {
    executeKnowledgeSplitter,
    resolveKnowledgeLanguage,
    type KnowledgeSplitterExecutionContext
} from './execute-splitter'

/** Shared by persisted document processing and the read-only settings preview. */
export async function splitKnowledgeDocuments(
    registry: Pick<TextSplitterRegistry, 'get'>,
    document: Pick<IKnowledgeDocument, 'type' | 'category' | 'parserConfig'> & { id?: string },
    chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
    parserConfig?: DocumentTextParserConfig,
    context: Pick<KnowledgeSplitterExecutionContext, 'languageDetection'> = {}
) {
    const documentParserConfig = resolveKnowledgeDocumentParserConfig(document)
    const maxChunkTokens =
        documentParserConfig.maxChunkTokens === undefined
            ? parserConfig?.maxChunkTokens
            : documentParserConfig.maxChunkTokens
    validateMaxChunkTokens(maxChunkTokens)
    const textSplitterType =
        documentParserConfig.textSplitterType || parserConfig?.textSplitterType || DEFAULT_KNOWLEDGE_TEXT_SPLITTER
    const textSplitter = registry.get(textSplitterType)
    if (!textSplitter) throw invalidKnowledgeParserConfig(textSplitterType)
    const languageDetection = context.languageDetection ?? resolveKnowledgeLanguage(textSplitter, chunks)
    const originalContents = textSplitter.meta?.chunkingCapabilities
        ? chunks.map((chunk) => chunk.pageContent)
        : undefined
    if (originalContents) chunks = chunks.map((chunk) => ({ ...chunk, metadata: { ...chunk.metadata } }))
    // Text Preprocessing
    if (documentParserConfig.replaceWhitespace) {
        chunks.forEach((doc) => {
            // Markdown line boundaries carry headings, tables, and lists and must remain structural.
            if (doc.metadata?.contentFormat === 'markdown') return
            doc.pageContent = doc.pageContent.replace(/[\s\n\t]+/g, ' ') // Replace consecutive spaces, newlines, and tabs
        })
    }
    if (documentParserConfig.removeSensitive) {
        const imageRegex = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g
        const urlRegex = /https?:\/\/[^\s]+/g
        const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g

        chunks.forEach((doc) => {
            let page = doc.pageContent

            // 1) Extract markdown image urls with placeholder
            const imagePlaceholders: string[] = []
            page = page.replace(imageRegex, (match) => {
                imagePlaceholders.push(match)
                return `__IMG_PLACEHOLDER_${imagePlaceholders.length - 1}__`
            })

            // 2) Remove normal URLs (not inside markdown image)
            page = page.replace(urlRegex, '')

            // 3) Remove email addresses
            page = page.replace(emailRegex, '')

            // 4) Restore markdown image urls
            page = page.replace(/__IMG_PLACEHOLDER_(\d+)__/g, (_, index) => {
                return imagePlaceholders[Number(index)]
            })

            doc.pageContent = page
        })
    }
    if (originalContents) {
        chunks.forEach((chunk, index) => {
            if (chunk.pageContent !== originalContents[index]) {
                delete chunk.metadata.markdownSourceMap
                delete chunk.metadata.startOffset
                delete chunk.metadata.endOffset
                chunk.metadata.sourceMapping = 'coarse'
            }
        })
    }

    // Process the document in chunks
    let chunkSize: number, chunkOverlap: number
    if (documentParserConfig.chunkSize) {
        chunkSize = Number(documentParserConfig.chunkSize)
        chunkOverlap = Number(documentParserConfig.chunkOverlap ?? chunkSize / 10)
    } else if (parserConfig?.chunkSize) {
        chunkSize = Number(parserConfig.chunkSize)
        chunkOverlap = Number(parserConfig.chunkOverlap ?? chunkSize / 10)
    } else {
        chunkSize = 1000
        chunkOverlap = 100
    }
    const delimiter = documentParserConfig.delimiter || parserConfig?.delimiter
    if (textSplitter) {
        const options = {
            chunkSize,
            chunkOverlap,
            separators: delimiter?.split(' '),
            ...(parserConfig?.textSplitter ?? {}),
            ...(documentParserConfig.textSplitter ?? {})
        }
        // The node schema envelope is only for standalone pipelines; document settings have a public cap.
        if (textSplitter.meta?.chunkingCapabilities?.tokenBudget && 'maxChunkTokens' in options) {
            delete options.maxChunkTokens
        }
        return executeKnowledgeSplitter(textSplitter, chunks, options, {
            languageDetection,
            maxChunkTokens,
            languageHint: documentParserConfig.chunkLanguageHint ?? parserConfig?.chunkLanguageHint,
            category: document.category,
            documentId: document.id
        })
    }
}
