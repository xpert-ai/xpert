import { CommandBus } from '@nestjs/cqrs'
import { PluginPermissionsCommand } from './commands/plugin-permissions.command'
import {
    knowledgeParserProvider,
    validateParserIntegration,
    validateTableParserSelection
} from '../knowledge-document/parser-provider'
import { validateQuestionGeneration } from '../knowledge-document/questions/question-generation'
import { Inject, Injectable } from '@nestjs/common'
import { Document } from '@langchain/core/documents'
import {
    buildChunkTree,
    DEFAULT_KNOWLEDGE_TEXT_SPLITTER,
    DocumentParserConfig,
    KnowledgebaseParserConfig,
    KnowledgeParserSelection,
    IKnowledgeDocument,
    knowledgeDocumentFileType,
    KnowledgeChunkPreviewInput,
    KnowledgeChunkPreviewResult,
    KnowledgeStructureEnum
} from '@xpert-ai/contracts'
import { DocumentTransformerRegistry, TextSplitterRegistry, TDocumentTransformerConfig } from '@xpert-ai/plugin-sdk'
import {
    invalidKnowledgeParserConfig,
    validateMaxChunkTokens,
    validateChunkLanguageHint,
    validateSeparators,
    validateKnowledgeTableSettings
} from '../knowledge-document/parser-validation'
import { resolveKnowledgeDocumentParserConfig } from '../knowledge-document/parser-config'
import { splitKnowledgeDocuments } from '../knowledge-document/split-documents'

@Injectable()
export class KnowledgeParserSettingsService {
    @Inject(CommandBus)
    private readonly commandBus: CommandBus

    constructor(
        private readonly splitters: TextSplitterRegistry,
        private readonly transformers: DocumentTransformerRegistry
    ) {}

    async validateSettings(config: KnowledgebaseParserConfig): Promise<KnowledgeStructureEnum> {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            throw invalidKnowledgeParserConfig('parserConfig')
        }
        validateKnowledgeTableSettings(config)
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
        if (
            config.parsers !== undefined &&
            (!config.parsers || typeof config.parsers !== 'object' || Array.isArray(config.parsers))
        ) {
            throw invalidKnowledgeParserConfig('parsers')
        }
        if (config.pdfParser && !Object.prototype.hasOwnProperty.call(config.parsers ?? {}, 'pdf')) {
            await this.validateSelection('pdf', config.pdfParser)
        }
        for (const [format, selection] of Object.entries(config.parsers ?? {})) {
            if (!format || knowledgeDocumentFileType({ type: format }) !== format || !/^[a-z0-9]+$/.test(format)) {
                throw invalidKnowledgeParserConfig(`parsers.${format}`)
            }
            if (selection !== null) await this.validateSelection(format, selection)
        }
        return this.validateSplitter(resolveKnowledgeDocumentParserConfig({ type: 'txt' }, config))
    }

    async validateSelection(type: string, selection: KnowledgeParserSelection, allowLegacy = false) {
        if (
            !selection ||
            typeof selection !== 'object' ||
            Array.isArray(selection) ||
            typeof selection.transformerType !== 'string' ||
            !selection.transformerType.trim() ||
            (selection.transformer !== undefined &&
                selection.transformer !== null &&
                (typeof selection.transformer !== 'object' || Array.isArray(selection.transformer))) ||
            (selection.transformerIntegration != null && typeof selection.transformerIntegration !== 'string')
        ) {
            throw invalidKnowledgeParserConfig(`parsers.${type}`)
        }
        const provider = knowledgeParserProvider(this.transformers, type, selection, allowLegacy)
        const integrationPermissions =
            provider.permissions?.filter((permission) => permission.type === 'integration') ?? []
        if (integrationPermissions.length && !selection.transformerIntegration) {
            throw invalidKnowledgeParserConfig('transformerIntegration')
        }
        const permissions = integrationPermissions.length
            ? await this.commandBus.execute<
                  PluginPermissionsCommand,
                  NonNullable<TDocumentTransformerConfig['permissions']>
              >(
                  new PluginPermissionsCommand(integrationPermissions, {
                      knowledgebaseId: '',
                      integrationId: selection.transformerIntegration
                  })
              )
            : {}
        const config = { ...selection.transformer, stage: 'test' as const, permissions }
        validateParserIntegration(provider, config)
        await provider.validateConfig(config)
    }

    async validateDocument(document: Partial<IKnowledgeDocument>, requestedParser?: string) {
        validateTableParserSelection(document)
        const parser = document.parserConfig
        if (parser?.transformerType) {
            await this.validateSelection(
                knowledgeDocumentFileType(document),
                {
                    transformerType: requestedParser || parser.transformerType,
                    transformerIntegration: parser.transformerIntegration ?? undefined,
                    transformer: parser.transformer ?? undefined
                },
                true
            )
        }
    }

    async validateSplitter(config: DocumentParserConfig): Promise<KnowledgeStructureEnum> {
        validateKnowledgeTableSettings(config)
        validateMaxChunkTokens(config.maxChunkTokens)
        validateChunkLanguageHint(config.chunkLanguageHint)
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
        return { ...result, chunks: buildChunkTree(result.chunks) }
    }
}
