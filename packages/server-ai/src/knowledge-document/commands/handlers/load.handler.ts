import { t } from 'i18next'
import { resolveParserDiagnostics, textWithoutImages } from '../../parser-diagnostics'
import { rethrowParserError } from '../../parser-error'
import { knowledgeParserProvider, validateParserIntegration, validateTableParserSelection } from '../../parser-provider'
import { splitKnowledgeDocuments } from '../../split-documents'
import { resolveKnowledgeLanguage, type KnowledgeSplitterExecutionContext } from '../../execute-splitter'
import { knowledgeChunkingRevision } from '../../chunking-revision'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
    DocumentSheetParserConfig,
    DEFAULT_KNOWLEDGE_TEXT_SPLITTER,
    DocumentTextParserConfig,
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    KBDocumentCategoryEnum,
    KBDocumentStatusEnum,
    KnowledgeTableSource,
    isNativeKnowledgeTableDocument,
    knowledgeDocumentFileType
} from '@xpert-ai/contracts'
import {
    getErrorMessage,
    loadCsvWithAutoEncoding,
    loadExcel,
    loadExcelWorkbook,
    loadTableWorkbook,
    SpreadsheetSourceRowError,
    pick
} from '@xpert-ai/server-common'
import { computeObjectHash, RequestContext } from '@xpert-ai/server-core'
import { BadRequestException, Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import {
    ChunkMetadata,
    DocumentTransformerRegistry,
    ImageUnderstandingRegistry,
    TextSplitterRegistry,
    TImageUnderstandingMetadata,
    TImageUnderstandingResult
} from '@xpert-ai/plugin-sdk'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Document } from '@langchain/core/documents'
import { Cache } from 'cache-manager'
import { omit } from 'lodash'
import { v4 as uuid } from 'uuid'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import type { KnowledgeDocument } from '../../document.entity'
import { KnowledgebaseService } from '../../../knowledgebase/knowledgebase.service'
import { GetRagWebDocCacheQuery } from '../../../rag-web/queries/get-web-page.query'
import type { VolumeHandle } from '../../../shared/volume/volume'
import { KnowledgeWorkAreaResolver } from '../../../shared/volume/work-area'
import { KnowledgeDocLoadCommand } from '../load.command'
import { PluginPermissionsCommand } from '../../../knowledgebase/commands/plugin-permissions.command'
import { TDocChunkMetadata } from '../../types'
import { KnowledgeDocumentService } from '../../document.service'
import { resolveKnowledgeDocumentParserConfig } from '../../parser-config'
import { resolveKnowledgeDocumentTransformerIdentity } from '../../document-hash'
import { KnowledgeDocumentTransformSnapshotService } from '../../transform-snapshot.service'
import { KnowledgeDocumentAnalysisSnapshotService } from '../../analysis-snapshot.service'
import {
    createSpreadsheetFormDocuments,
    createSpreadsheetRecordDocuments,
    createSpreadsheetRecordResult
} from '../../spreadsheet-document'
import { invalidKnowledgeParserConfig, validateKnowledgeTableSettings } from '../../parser-validation'

type ImageUnderstandingWarning = {
    type: 'image_understanding_skipped' | 'image_understanding_failed'
    message: string
    assetCount?: number
    imagePath?: string
    imageUrl?: string
    parentChunkId?: string
}

@CommandHandler(KnowledgeDocLoadCommand)
export class KnowledgeDocLoadHandler implements ICommandHandler<KnowledgeDocLoadCommand> {
    @Inject(TextSplitterRegistry)
    private readonly textSplitterRegistry: TextSplitterRegistry

    @Inject(DocumentTransformerRegistry)
    private readonly transformerRegistry: DocumentTransformerRegistry

    @Inject(ImageUnderstandingRegistry)
    private readonly imageUnderstandingRegistry: ImageUnderstandingRegistry

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache

    @Inject(KnowledgeDocumentService)
    private readonly kbDocumentService: KnowledgeDocumentService

    @Inject(KnowledgeWorkAreaResolver)
    private readonly knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver

    @Inject(KnowledgeDocumentTransformSnapshotService)
    private readonly transformSnapshotService: KnowledgeDocumentTransformSnapshotService

    @Inject(KnowledgeDocumentAnalysisSnapshotService)
    private readonly analysisSnapshotService: KnowledgeDocumentAnalysisSnapshotService

    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    public async execute(
        command: KnowledgeDocLoadCommand
    ): Promise<{ chunks: Document[]; pages?: Document[]; tables?: KnowledgeTableSource[] }> {
        const { doc, stage, mode = 'full' } = command.input
        validateKnowledgeTableSettings(doc.parserConfig)
        const docParserConfig = resolveKnowledgeDocumentParserConfig(doc)
        validateTableParserSelection({ ...doc, parserConfig: docParserConfig })

        let visionModel: BaseChatModel | undefined
        if (!doc.knowledgebaseId) {
            throw new Error('knowledgebaseId is required for knowledge document loading')
        }
        const workArea = await this.knowledgeWorkAreaResolver.resolve({
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            knowledgebaseId: doc.knowledgebaseId,
            taskId: doc.jobId,
            documentId: doc.id
        })
        const volumeClient = workArea.volume

        if (isNativeKnowledgeTableDocument({ ...doc, parserConfig: docParserConfig })) {
            const format = doc.type.replace(/^\./, '').toLowerCase() === 'csv' ? 'csv' : 'excel'
            const legacy = format === 'csv' || docParserConfig.spreadsheet?.interpretation !== 'records'
            const workbook = await loadTableWorkbook(volumeClient.path(doc.filePath), {
                format,
                sheetMode: legacy ? 'legacy' : 'all',
                firstRowAsHeader: docParserConfig.spreadsheet?.firstRowAsHeader
            }).catch((error: unknown) => {
                if (error instanceof SpreadsheetSourceRowError) throw invalidKnowledgeParserConfig('table source row')
                throw error
            })
            const result = createSpreadsheetRecordResult({
                documentId: doc.id,
                workbook,
                config: docParserConfig.spreadsheet,
                indexedFields: docParserConfig.indexedFields,
                legacy
            })
            await this.recordBuiltinParser(doc, stage)
            return result
        }

        const hasCustomSheetTransformer = Boolean(
            docParserConfig.transformerType && docParserConfig.transformerType !== 'default'
        )
        if (doc.category === KBDocumentCategoryEnum.Sheet && !hasCustomSheetTransformer) {
            const parserConfig = docParserConfig as DocumentSheetParserConfig
            if (parserConfig.spreadsheet?.interpretation === 'form_document') {
                if (doc.name.toLowerCase().endsWith('.csv')) {
                    throw new Error('Spreadsheet form-document mode currently requires an XLS or XLSX workbook')
                }
                const workbook = await loadExcelWorkbook(volumeClient.path(doc.filePath))
                const result = {
                    chunks: createSpreadsheetFormDocuments({
                        documentId: doc.id,
                        documentName: doc.name,
                        workbook,
                        config: parserConfig.spreadsheet
                    })
                }
                await this.recordBuiltinParser(doc, stage)
                return result
            }
            if (parserConfig.spreadsheet?.interpretation === 'records' && !doc.name.toLowerCase().endsWith('.csv')) {
                const workbook = await loadExcelWorkbook(volumeClient.path(doc.filePath))
                const result = {
                    chunks: createSpreadsheetRecordDocuments({
                        documentId: doc.id,
                        workbook,
                        config: parserConfig.spreadsheet,
                        indexedFields: parserConfig.indexedFields
                    })
                }
                await this.recordBuiltinParser(doc, stage)
                return result
            }
            // const data = await this.commandBus.execute(new LoadStorageSheetCommand(doc.storageFileId))
            const data = await this.loadSheet(doc, volumeClient)
            const documents: Document[] = []
            for (const row of data) {
                // pageContent always contains all fields for display
                // searchContent in metadata contains only indexed fields for retrieval matching
                const metadata: any = { raw: row, documentId: doc.id, chunkId: uuid() }

                // Build full pageContent for display and persistence
                const fullPageContent = JSON.stringify(row)
                if (parserConfig?.indexedFields?.length) {
                    // Store indexed fields only for vectorization when configured
                    metadata.searchContent = JSON.stringify(pick(row, parserConfig.indexedFields))
                }

                documents.push(
                    new Document({
                        pageContent: fullPageContent,
                        metadata
                    })
                )
            }
            await this.recordBuiltinParser(doc, stage)
            return { chunks: documents }
        }

        if (doc.filePath || doc.fileUrl) {
            if (doc.metadata) doc.metadata = omit(doc.metadata, 'imageUnderstandingWarnings')
            const transformerType = docParserConfig.transformerType || 'default'
            const transformerIdentity = resolveKnowledgeDocumentTransformerIdentity(doc)
            let providesImageText = mode === 'rechunk' && doc.metadata?.parserProvidesImageText === true
            let transformed: Partial<IKnowledgeDocument<ChunkMetadata>>[]
            if (mode === 'rechunk') {
                // Rechunk is a strict resume point: loading must succeed without invoking plugin code.
                transformed = await this.transformSnapshotService.load(doc, transformerIdentity)
            } else {
                const transformer = knowledgeParserProvider(
                    this.transformerRegistry,
                    doc.type,
                    { transformerType: doc.parserConfig?.transformerType || transformerType },
                    true
                )
                providesImageText = transformer.meta.providesImageText === true
                const permissions = await this.commandBus.execute(
                    new PluginPermissionsCommand(transformer.permissions, {
                        knowledgebaseId: doc.knowledgebaseId,
                        integrationId: docParserConfig.transformerIntegration
                        // folder: stage === 'test' ? 'temp/' : `/`
                    })
                )
                const config = {
                    ...(docParserConfig.transformer ?? {}),
                    stage,
                    tempDir: workArea.tmpPath.serverPath,
                    fileScope: {
                        tenantId: RequestContext.currentTenantId(),
                        organizationId: RequestContext.getOrganizationId(),
                        userId: RequestContext.currentUserId(),
                        catalog: 'knowledges' as const,
                        knowledgeId: doc.knowledgebaseId,
                        scopeId: doc.knowledgebaseId
                    },
                    permissions
                }
                validateParserIntegration(transformer, config)
                await transformer.validateConfig?.(config)
                const cacheConfig = {
                    transformerSource: this.transformerRegistry.getSource?.(transformer),
                    // A saved connection can change while retaining its ID. Only its digest enters the cache key.
                    integrationOptionsHash: permissions.integration?.options
                        ? computeObjectHash(permissions.integration.options)
                        : undefined,
                    document: omit(doc, 'parserConfig'),
                    parserConfig: pick(docParserConfig, ['transformerType', 'transformerIntegration', 'transformer']),
                    stage
                }
                const cacheKey = 'knowledges:transformer:v2:' + computeObjectHash(cacheConfig)
                transformed = await this.cacheManager.get(cacheKey)
                if (!transformed) {
                    transformed = await transformer
                        .transformDocuments([{ ...doc, type: knowledgeDocumentFileType(doc) }], config)
                        .catch(rethrowParserError)
                    await this.cacheManager.set(cacheKey, transformed, 60 * 10 * 1000) // 10 min
                }

                if (stage !== 'test') {
                    // Persist both snapshots before splitting; final chunks no longer preserve the source layout verbatim.
                    const [transformSnapshot, analysisSnapshot] = await Promise.all([
                        this.transformSnapshotService.save(doc, transformed, transformerIdentity),
                        this.analysisSnapshotService.save(doc, transformed, transformerIdentity)
                    ])
                    doc.metadata = {
                        ...omit(
                            doc.metadata ?? {},
                            'analysisSnapshot',
                            'parserDiagnostics',
                            'imageUnderstandingWarnings'
                        ),
                        ...(transformed.length === 1 ? omit(transformed[0].metadata ?? {}, 'analysisSnapshot') : {}),
                        transformSnapshot,
                        parser: transformerType,
                        parserLabel: transformer.meta.label,
                        parserProvidesImageText: providesImageText,
                        ...(analysisSnapshot ? { analysisSnapshot } : {})
                    }
                }
            }

            if (stage !== 'test') {
                await this.kbDocumentService.update(doc.id, {
                    status: KBDocumentStatusEnum.TRANSFORMED,
                    ...(doc.metadata ? { metadata: doc.metadata } : {})
                })
            }

            const chunks = []
            let hasPdfPageTranscripts = false
            const languageDetection = resolveKnowledgeLanguage(
                this.textSplitterRegistry?.get(docParserConfig.textSplitterType || DEFAULT_KNOWLEDGE_TEXT_SPLITTER),
                {
                    *[Symbol.iterator]() {
                        for (const item of transformed) yield* item.chunks ?? []
                    }
                }
            )
            for await (const transItem of transformed) {
                // Chunker with caching
                const chunkerCacheConfig = {
                    ...(languageDetection ? { detectedLanguage: languageDetection.detectedLanguage ?? null } : {}),
                    ...(knowledgeChunkingRevision(docParserConfig.textSplitterType)
                        ? { chunkingRevision: knowledgeChunkingRevision(docParserConfig.textSplitterType) }
                        : {}),
                    document: transItem,
                    parserConfig: pick(docParserConfig, [
                        'textSplitterType',
                        'textSplitter',
                        'maxChunkTokens',
                        'chunkLanguageHint',
                        'replaceWhitespace',
                        'removeSensitive'
                    ]),
                    stage
                }
                const cacheKey = 'knowledges:chunker:' + computeObjectHash(chunkerCacheConfig)
                let splitted = await this.cacheManager.get<{
                    chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
                }>(cacheKey)
                if (!splitted) {
                    splitted = await this.splitDocuments(
                        doc,
                        transItem.chunks as IKnowledgeDocumentChunk<TDocChunkMetadata>[],
                        undefined,
                        { languageDetection }
                    )
                    await this.cacheManager.set(cacheKey, splitted, 60 * 10 * 1000) // 10 min
                }

                // Update document status
                if (stage !== 'test') {
                    await this.kbDocumentService.update(doc.id, { status: KBDocumentStatusEnum.SPLITTED })
                }

                // Image understanding
                const images = transItem.metadata?.assets?.filter((asset) => asset.type === 'image')
                if (
                    images?.length &&
                    docParserConfig.imageUnderstandingType &&
                    docParserConfig.imageUnderstandingEnabled !== false &&
                    (docParserConfig.imageUnderstandingEnabled === true || !providesImageText)
                ) {
                    try {
                        const imageUnderstandingDocument = this.createImageUnderstandingDocument(
                            doc,
                            transItem,
                            splitted.chunks
                        )
                        const imageCacheConfig = {
                            document: imageUnderstandingDocument,
                            parserConfig: pick(docParserConfig, [
                                'imageUnderstandingType',
                                'imageUnderstandingIntegration',
                                'imageUnderstandingModel',
                                'imageUnderstanding'
                            ]),
                            stage
                        }
                        // Older VLM cache entries omit text parents from parent-child chunks.
                        const cacheKey = 'knowledges:understanding:v3:' + computeObjectHash(imageCacheConfig)
                        let imgTransformed = await this.cacheManager.get<TImageUnderstandingResult>(cacheKey)
                        if (!imgTransformed) {
                            const imageUnderstanding = this.imageUnderstandingRegistry.get(
                                docParserConfig.imageUnderstandingType
                            )
                            const strategyConfig = {
                                ...(docParserConfig.imageUnderstanding ?? {}),
                                stage
                            }
                            const requiresVisionModel =
                                (await imageUnderstanding.requiresVisionModel?.(strategyConfig)) ?? true
                            if (requiresVisionModel && !visionModel) {
                                visionModel = await this.knowledgebaseService.getVisionModel(
                                    doc.knowledgebaseId,
                                    docParserConfig.imageUnderstandingModel
                                )
                            }
                            const permissions = await this.commandBus.execute(
                                new PluginPermissionsCommand(imageUnderstanding.permissions, {
                                    knowledgebaseId: doc.knowledgebaseId,
                                    integrationId: docParserConfig.imageUnderstandingIntegration
                                    // folder: stage === 'test' ? 'temp/' : `/`
                                })
                            )
                            imgTransformed = await imageUnderstanding.understandImages(imageUnderstandingDocument, {
                                ...strategyConfig,
                                visionModel,
                                permissions
                            })

                            await this.cacheManager.set(cacheKey, imgTransformed, 60 * 10 * 1000) // 10 min
                        }

                        const understoodChunks = []
                        let splitPageTranscript = false
                        // OCR arrives after initial splitting. Apply the same limits to page transcripts.
                        for (const chunk of imgTransformed.chunks) {
                            if (chunk.metadata.sourceType === 'pdf_page' && chunk.metadata.parser === 'vlm') {
                                // VLM keeps the image origin, but a page transcript is text for splitting and indexing.
                                const transcript = new Document<TDocChunkMetadata>({
                                    ...chunk,
                                    metadata: {
                                        ...chunk.metadata,
                                        chunkId: chunk.metadata.chunkId ?? uuid(),
                                        mediaType: 'text'
                                    }
                                })
                                const result = await this.splitDocuments(doc, [transcript])
                                understoodChunks.push(...result.chunks)
                                splitPageTranscript = true
                            } else understoodChunks.push(chunk)
                        }
                        chunks.push(...understoodChunks)
                        hasPdfPageTranscripts ||= splitPageTranscript
                        await this.persistImageUnderstandingDocumentMetadata(
                            doc,
                            stage,
                            imgTransformed.metadata?.documentMetadata
                        )
                        await this.recordImageUnderstandingWarnings(
                            doc,
                            stage,
                            normalizeImageUnderstandingWarnings(imgTransformed.metadata?.warnings)
                        )

                        // Update document status
                        if (stage !== 'test') {
                            await this.kbDocumentService.update(doc.id, { status: KBDocumentStatusEnum.UNDERSTOOD })
                        }
                    } catch (error) {
                        chunks.push(...splitted.chunks)
                        await this.recordImageUnderstandingWarnings(doc, stage, [
                            {
                                type: 'image_understanding_skipped',
                                message: getErrorMessage(error),
                                assetCount: images.length
                            }
                        ])
                    }
                } else {
                    chunks.push(...splitted.chunks)
                }
            }
            const diagnostics = resolveParserDiagnostics(
                transformed.map((item) => item.metadata?.parserDiagnostics),
                chunks
            )
            let resultChunks = chunks
            if (diagnostics) {
                doc.metadata = { ...doc.metadata, parserDiagnostics: diagnostics }
                if (stage !== 'test') await this.kbDocumentService.update(doc.id, { metadata: doc.metadata })
                if (
                    !chunks.some(
                        (chunk) => textWithoutImages(chunk.pageContent) && chunk.pageContent.trim() !== '[unreadable]'
                    )
                ) {
                    throw new BadRequestException(
                        t('server-ai:Error.KnowledgeParserOcrRequired', {
                            defaultValue:
                                'No text was recognized. Enable image understanding with an available vision model, or select an OCR parser.'
                        })
                    )
                }
                // An image URL alone is not retrieval content. Keep parents referenced by real child chunks.
                const parents = new Set(chunks.map((chunk) => chunk.metadata.parentId).filter(Boolean))
                resultChunks = chunks.filter(
                    (chunk) => textWithoutImages(chunk.pageContent) || parents.has(chunk.metadata.chunkId)
                )
            }
            return { chunks: hasPdfPageTranscripts ? this.reindexChunkSiblings(resultChunks) : resultChunks }
        }

        if (!doc.sourceConfig && docParserConfig.transformerType && docParserConfig.transformerType !== 'default') {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgeParserOriginalFileRequired', {
                    defaultValue:
                        'This parser requires the original file. Upload the file before selecting a file parser.'
                })
            )
        }
        return this.loadWeb(doc)
    }

    /**
     * Builds the generic document passed to an image-understanding strategy.
     * Persisted document metadata is carried across reprocessing so a strategy
     * can retain its previous bounded assessment, while transformer metadata
     * remains authoritative for the current file assets.
     */
    private createImageUnderstandingDocument(
        doc: IKnowledgeDocument,
        transformed: Partial<IKnowledgeDocument<ChunkMetadata>>,
        chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    ): IKnowledgeDocument<ChunkMetadata> {
        return {
            ...transformed,
            metadata: {
                ...(doc.metadata ?? {}),
                ...(transformed.metadata ?? {})
            },
            chunks
        } as IKnowledgeDocument<ChunkMetadata>
    }

    private async recordImageUnderstandingWarnings(
        doc: IKnowledgeDocument,
        stage: string,
        warnings: ImageUnderstandingWarning[]
    ) {
        if (stage === 'test' || !warnings.length || !doc.id) {
            return
        }

        const metadata = {
            ...(doc.metadata ?? {}),
            imageUnderstandingWarnings: [...getExistingImageUnderstandingWarnings(doc.metadata), ...warnings]
        }
        doc.metadata = metadata
        // Metadata is one JSON column; TypeORM's deep entity type cannot model its open-ended keys.
        await this.kbDocumentService.update(doc.id, {
            metadata: metadata as unknown as QueryDeepPartialEntity<KnowledgeDocument>['metadata']
        })
    }

    /**
     * Persists JSON-safe strategy output on the owning document while keeping
     * host-managed transform and analysis snapshot references authoritative.
     */
    private async persistImageUnderstandingDocumentMetadata(
        doc: IKnowledgeDocument,
        stage: string,
        documentMetadata: TImageUnderstandingMetadata['documentMetadata']
    ) {
        if (stage === 'test' || !doc.id || !documentMetadata) return
        const metadata = {
            ...omit(doc.metadata ?? {}, 'imageUnderstandingInvalidatedAt'),
            ...omit(documentMetadata, 'transformSnapshot', 'analysisSnapshot', 'parser', 'parserLabel')
        }
        doc.metadata = metadata
        await this.kbDocumentService.update(doc.id, {
            metadata: metadata as unknown as QueryDeepPartialEntity<KnowledgeDocument>['metadata']
        })
    }

    async loadWeb(doc: IKnowledgeDocument) {
        const docs = []
        for await (const page of doc.pages) {
            if (page.id) {
                docs.push({ ...page, metadata: { ...page.metadata, docPageId: page.id } })
            } else {
                // From cache when scraping web pages
                const _docs = await this.queryBus.execute(new GetRagWebDocCacheQuery(page.metadata.scrapeId))
                docs.push(..._docs.map((doc) => ({ ...doc, metadata: { ...doc.metadata, docPageId: page.id } })))
            }
        }

        return await this.splitDocuments(doc, docs)
    }

    /**
     * Split documents into smaller chunks for processing by `parserConfig`.
     *
     * @param document The original knowledge document entity.
     * @param chunks The document data to split.
     * @param parserConfig custom parser configuration.
     * @returns An array of split document chunks.
     */
    async splitDocuments(
        document: IKnowledgeDocument,
        chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[],
        parserConfig?: DocumentTextParserConfig,
        context?: Pick<KnowledgeSplitterExecutionContext, 'languageDetection'>
    ) {
        return splitKnowledgeDocuments(this.textSplitterRegistry, document, chunks, parserConfig, context)
    }

    /** Page splitters restart indexes; assign document-wide root order and retain per-parent child order. */
    private reindexChunkSiblings(chunks: Document[]): Document[] {
        const indexes = new Map<string | null, number>()
        return chunks.map((chunk) => {
            const parentId = chunk.metadata.parentId ?? null
            const chunkIndex = indexes.get(parentId) ?? 0
            indexes.set(parentId, chunkIndex + 1)
            return { ...chunk, metadata: { ...chunk.metadata, chunkIndex } }
        })
    }

    private async recordBuiltinParser(doc: IKnowledgeDocument, stage: string) {
        if (stage === 'test') return
        doc.metadata = {
            ...omit(
                doc.metadata ?? {},
                'parserLabel',
                'transformSnapshot',
                'analysisSnapshot',
                'documentAnalysis',
                'parserProvidesImageText',
                'parserDiagnostics',
                'imageUnderstandingWarnings'
            ),
            parser: 'builtin'
        }
        await this.kbDocumentService.update(doc.id, { metadata: doc.metadata })
    }

    async loadSheet(doc: IKnowledgeDocument, volumeClient: VolumeHandle): Promise<Record<string, any>[]> {
        const filePath = volumeClient.path(doc.filePath)
        if (doc.name.toLowerCase().endsWith('.csv')) {
            return loadCsvWithAutoEncoding(filePath)
        }

        return loadExcel(filePath)
    }
}

function normalizeImageUnderstandingWarnings(value: unknown): ImageUnderstandingWarning[] {
    if (!Array.isArray(value)) {
        return []
    }

    const warnings: Array<ImageUnderstandingWarning | null> = value.map((warning) => {
        if (!warning || typeof warning !== 'object') {
            return null
        }
        const record = warning as Record<string, unknown>
        const message = typeof record.message === 'string' ? record.message : ''
        if (!message) {
            return null
        }
        const type =
            record.type === 'image_understanding_skipped' || record.type === 'image_understanding_failed'
                ? record.type
                : 'image_understanding_failed'
        return {
            type,
            message,
            assetCount: typeof record.assetCount === 'number' ? record.assetCount : undefined,
            imagePath: typeof record.imagePath === 'string' ? record.imagePath : undefined,
            imageUrl: typeof record.imageUrl === 'string' ? record.imageUrl : undefined,
            parentChunkId: typeof record.parentChunkId === 'string' ? record.parentChunkId : undefined
        } satisfies ImageUnderstandingWarning
    })
    return warnings.filter((warning): warning is ImageUnderstandingWarning => !!warning)
}

function getExistingImageUnderstandingWarnings(metadata: unknown): ImageUnderstandingWarning[] {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return []
    }

    const warnings = (metadata as Record<string, unknown>).imageUnderstandingWarnings
    return normalizeImageUnderstandingWarnings(warnings)
}
