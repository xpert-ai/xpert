import type { DocumentInterface } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter, type RecursiveCharacterTextSplitterParams } from '@langchain/textsplitters'
import { decodeKnowledgeSeparators, type KnowledgeChunkLanguage } from '@xpert-ai/contracts'
import { countTextTokens, type ChunkMetadata, type TextSplitterExecutionContext } from '@xpert-ai/plugin-sdk'
import { parseMarkdown, parseSource, type StructuredSource } from './structured-document'
import { sentenceRanges } from './language-boundaries'

type Options = Partial<Omit<RecursiveCharacterTextSplitterParams, 'separators'>> & { separators?: string | string[] }

export function createLanguageTextSplitter(
    options: Options,
    document: DocumentInterface<Partial<ChunkMetadata>>,
    context: TextSplitterExecutionContext = {}
): RecursiveCharacterTextSplitter {
    const separators = decodeKnowledgeSeparators(options.separators)
    if (!separators.includes('')) separators.push('')
    const config = { ...options, separators }
    const language = context.resolvedLanguages?.get(document) ?? context.resolvedLanguage
    return language && options.separators === undefined && !options.lengthFunction
        ? new LanguageTextSplitter(config, document.metadata, language, context.maxChunkTokens)
        : new RecursiveCharacterTextSplitter(config)
}

/** Add sentence boundaries only to natural prose; legacy recursion still handles indivisible/structural text. */
class LanguageTextSplitter extends RecursiveCharacterTextSplitter {
    constructor(
        options: Partial<RecursiveCharacterTextSplitterParams>,
        private readonly metadata: Partial<ChunkMetadata>,
        private readonly language: KnowledgeChunkLanguage,
        private readonly maxTokens?: number
    ) {
        super(options)
    }

    async splitText(text: string): Promise<string[]> {
        const fits = (value: string) =>
            value.length <= this.chunkSize && (!this.maxTokens || countTextTokens(value) <= this.maxTokens)
        if (fits(text)) return text.trim() ? [text.trim()] : []
        const source: StructuredSource = {
            document: { pageContent: text, metadata: { ...this.metadata, chunkId: this.metadata.chunkId ?? '' } },
            index: 0
        }
        // Recognize explicit fences even in plain text. This never changes contentFormat or Auto routing.
        const units = this.metadata.documentLayout ? parseSource(source, []) : parseMarkdown(source, [])
        const result: string[] = []
        let pending = ''
        let cursor = 0
        const flush = () => {
            if (pending.trim()) result.push(pending.trim())
            pending = ''
        }
        for (const unit of units) {
            const body = text.slice(cursor, unit.end)
            cursor = unit.end
            if (unit.kind !== 'paragraph') {
                flush()
                result.push(...(await super.splitText(body)))
                continue
            }
            for (const range of sentenceRanges(body, this.language)) {
                const sentence = body.slice(range.start, range.end)
                if (!fits(sentence)) {
                    flush()
                    result.push(...(await super.splitText(sentence)))
                    continue
                }
                if (pending && !fits(pending + sentence)) {
                    let start = Math.max(0, pending.length - this.chunkOverlap)
                    if (/[\uDC00-\uDFFF]/.test(pending[start] ?? '')) start++
                    const overlap = pending.slice(start)
                    flush()
                    if (fits(overlap + sentence)) pending = overlap
                }
                pending += sentence
            }
        }
        flush()
        return result
    }
}
