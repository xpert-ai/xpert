import { validateQuestionGeneration } from '../knowledge-document/questions/question-generation'
import { Injectable } from '@nestjs/common'
import { Document } from '@langchain/core/documents'
import {
    buildChunkTree,
    DEFAULT_KNOWLEDGE_TEXT_SPLITTER,
    DocumentParserConfig,
    KnowledgebaseParserConfig,
    KnowledgeChunkPreviewInput,
    KnowledgeChunkPreviewResult,
    KnowledgeStructureEnum
} from '@xpert-ai/contracts'
import { DocumentTransformerRegistry, TextSplitterRegistry } from '@xpert-ai/plugin-sdk'
import {
    invalidKnowledgeParserConfig,
    validateMaxChunkTokens,
    validateSeparators
} from '../knowledge-document/parser-validation'
import { resolveKnowledgeDocumentParserConfig } from '../knowledge-document/parser-config'
import { splitKnowledgeDocuments } from '../knowledge-document/split-documents'

@Injectable()
export class KnowledgeParserSettingsService {
    constructor(
        private readonly splitters: TextSplitterRegistry,
        private readonly transformers: DocumentTransformerRegistry
    ) {}

    async validateSettings(config: KnowledgebaseParserConfig): Promise<KnowledgeStructureEnum> {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            throw invalidKnowledgeParserConfig('parserConfig')
        }
        validateSeparators(config.separators)
        if (config.separators !== undefined && !Array.isArray(config.separators)) {
            throw invalidKnowledgeParserConfig('separators')
        }
        if (config.imageUnderstandingEnabled !== undefined && typeof config.imageUnderstandingEnabled !== 'boolean') {
            throw invalidKnowledgeParserConfig('imageUnderstandingEnabled')
        }
        const prompt = config.imageUnderstanding?.promptTemplate
        if (prompt !== undefined && (typeof prompt !== 'string' || prompt.length > 4000)) {
            throw invalidKnowledgeParserConfig('promptTemplate')
        }
        if (config.pdfParser) {
            const pdf = config.pdfParser
            const provider = this.transformers.get(pdf.transformerType)
            if (!provider?.meta.supportedFileTypes?.includes('pdf')) {
                throw invalidKnowledgeParserConfig(pdf.transformerType || 'pdfParser')
            }
            if (
                provider.permissions?.some((permission) => permission.type === 'integration') &&
                !pdf.transformerIntegration
            ) {
                throw invalidKnowledgeParserConfig('transformerIntegration')
            }
            await provider.validateConfig({ ...pdf.transformer, stage: 'test' })
        }
        return this.validateSplitter(resolveKnowledgeDocumentParserConfig({ type: 'txt' }, config))
    }

    async validateSplitter(config: DocumentParserConfig): Promise<KnowledgeStructureEnum> {
        validateMaxChunkTokens(config.maxChunkTokens)
        validateQuestionGeneration(config.questionGeneration)
        const name = config.textSplitterType || DEFAULT_KNOWLEDGE_TEXT_SPLITTER
        const splitter = this.splitters.get(name)
        if (!splitter) throw invalidKnowledgeParserConfig(name)
        await splitter.validateConfig(config.textSplitter ?? {})
        return splitter.structure
    }

    async preview(input: KnowledgeChunkPreviewInput): Promise<KnowledgeChunkPreviewResult> {
        if (
            typeof input?.text !== 'string' ||
            !input.text.trim() ||
            input.text.length > 100000 ||
            !['txt', 'md'].includes(input.type)
        ) {
            throw invalidKnowledgeParserConfig('preview text (1–100000), type (txt/md)')
        }
        // Preview runs only the selected splitter. It never saves documents or invokes models/converters.
        const parserConfig = resolveKnowledgeDocumentParserConfig({ type: input.type }, input.parserConfig)
        await this.validateSplitter(parserConfig)
        const result = await splitKnowledgeDocuments(this.splitters, { type: input.type, parserConfig }, [
            new Document({
                pageContent: input.text,
                metadata: {
                    documentId: 'preview',
                    chunkId: 'preview-source',
                    contentFormat: input.type === 'md' ? 'markdown' : 'text'
                }
            })
        ])
        return { chunks: buildChunkTree(result.chunks), ...(result.decisions ? { decisions: result.decisions } : {}) }
    }
}
