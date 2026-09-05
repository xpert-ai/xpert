import {
    DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG,
    DocumentTypeEnum,
    IKnowledgebase,
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    IKnowledgeFAQChunkMetadata,
    IKnowledgeFAQEntry,
    KBDocumentCategoryEnum,
    KBDocumentStatusEnum,
    KnowledgebaseFAQConfig,
    KnowledgebaseTypeEnum,
    KnowledgeFAQExportFormat,
    KnowledgeFAQImportMode,
    KnowledgeFAQImportPreview,
    KnowledgeFAQImportResult,
    KnowledgeFAQListParams,
    KnowledgeFAQUpdateInput,
    KnowledgeFAQWriteInput
} from '@xpert-ai/contracts'
import {
    BadRequestException,
    ConflictException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException
} from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { t } from 'i18next'
import { v4 as uuidv4 } from 'uuid'
import type { DataSource } from 'typeorm'
import { KnowledgeDocumentChunkService } from '../../knowledge-document/chunk/chunk.service'
import { KnowledgeDocumentService } from '../../knowledge-document/document.service'
import { KnowledgebaseService } from '../knowledgebase.service'
import { buildFAQKeywordProjection, isKnowledgeFAQChunkMetadata, NormalizedFAQInput } from './faq-projection'
import { parseWeKnoraFAQFile, serializeWeKnoraFAQCSV, serializeWeKnoraFAQJSON } from './faq-transfer'
import { buildFAQVectorWrite, FAQVectorWrite, resolveFAQEmbeddingContextSize } from './faq-vector'
import { assertFAQQuestionUniqueness, FAQInputValidationError, validateAndNormalizeFAQInput } from './faq-validation'

export const FAQ_MANAGED_DOCUMENT_SOURCE_KEY = 'system:faq'
export const FAQ_SYSTEM_MANAGED_TYPE = 'faq'
export const KNOWLEDGE_FAQ_IMPORT_MAX_ENTRIES = 1000
export const KNOWLEDGE_FAQ_IMPORT_PREVIEW_LIMIT = 50

type FAQManagedDocumentMetadata = {
    systemManaged: true
    systemManagedType: typeof FAQ_SYSTEM_MANAGED_TYPE
}

type FAQChunkRecord = {
    chunk: IKnowledgeDocumentChunk
    metadata: IKnowledgeFAQChunkMetadata
}

type StagedFAQRecord = {
    id: string
    input: NormalizedFAQInput
    vectorWrite: FAQVectorWrite
    chunk: IKnowledgeDocumentChunk
    version: number
}

function resolveFAQConfig(knowledgebase: IKnowledgebase): KnowledgebaseFAQConfig {
    return {
        ...DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG,
        ...knowledgebase.faqConfig
    }
}

function normalizeSearch(value: string) {
    return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
}

@Injectable()
export class KnowledgeFAQService {
    private readonly logger = new Logger(KnowledgeFAQService.name)
    private readonly localLocks = new Map<string, Promise<void>>()

    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService,
        private readonly chunkService: KnowledgeDocumentChunkService,
        @InjectDataSource()
        private readonly dataSource: DataSource
    ) {}

    async findAll(knowledgebaseId: string, params: KnowledgeFAQListParams = {}) {
        await this.getFAQKnowledgebase(knowledgebaseId, 'read')
        const document = await this.findManagedDocument(knowledgebaseId)
        if (!document) return { items: [], total: 0 }

        const entries = (await this.findFAQChunks(document.id))
            .filter(({ metadata }) => metadata.vectorSyncStatus !== 'pending' && metadata.vectorSyncStatus !== 'failed')
            .map(({ chunk, metadata }) => this.toEntry(chunk, metadata))
        const search = normalizeSearch(params.search ?? '')
        const filtered = entries.filter((entry) => {
            if (params.enabled !== undefined && entry.enabled !== params.enabled) return false
            if (!search) return true
            return normalizeSearch(
                [
                    entry.standardQuestion,
                    ...entry.similarQuestions,
                    ...entry.negativeQuestions,
                    ...entry.answerBlocks
                ].join('\n')
            ).includes(search)
        })
        const skip = Math.max(0, params.skip ?? 0)
        const take = Math.min(100, Math.max(1, params.take ?? 20))
        return {
            items: filtered.slice(skip, skip + take),
            total: filtered.length
        }
    }

    async findOne(knowledgebaseId: string, faqId: string): Promise<IKnowledgeFAQEntry> {
        await this.getFAQKnowledgebase(knowledgebaseId, 'read')
        const document = await this.requireManagedDocument(knowledgebaseId)
        const current = this.requireFAQChunk(await this.findFAQChunks(document.id), faqId)
        if (current.metadata.vectorSyncStatus === 'pending' || current.metadata.vectorSyncStatus === 'failed') {
            throw new NotFoundException(
                t('server-ai:Error.KnowledgeFAQNotFound', {
                    defaultValue: 'FAQ entry was not found'
                })
            )
        }
        return this.toEntry(current.chunk, current.metadata)
    }

    async importFile(
        knowledgebaseId: string,
        file: Pick<Express.Multer.File, 'originalname' | 'buffer'>,
        mode: KnowledgeFAQImportMode = 'append'
    ): Promise<KnowledgeFAQImportResult> {
        await this.getFAQKnowledgebase(knowledgebaseId, 'write')
        const entries = this.parseImportFile(file)

        if (mode === 'replace') return this.replaceAll(knowledgebaseId, entries)

        const failed: KnowledgeFAQImportResult['failed'] = []
        let imported = 0
        for (const [index, entry] of entries.entries()) {
            try {
                await this.create(knowledgebaseId, entry)
                imported++
            } catch (error) {
                failed.push({
                    row: index + 1,
                    standardQuestion: entry.standardQuestion,
                    message: getFAQImportErrorMessage(error)
                })
            }
        }
        return { total: entries.length, imported, failed }
    }

    async previewImportFile(
        knowledgebaseId: string,
        file: Pick<Express.Multer.File, 'originalname' | 'buffer'>
    ): Promise<KnowledgeFAQImportPreview> {
        await this.getFAQKnowledgebase(knowledgebaseId, 'write')
        const entries = this.parseImportFile(file)
        return {
            total: entries.length,
            items: entries.slice(0, KNOWLEDGE_FAQ_IMPORT_PREVIEW_LIMIT).map((entry, index) => ({
                row: index + 1,
                standardQuestion: entry.standardQuestion
            })),
            truncated: entries.length > KNOWLEDGE_FAQ_IMPORT_PREVIEW_LIMIT
        }
    }

    async exportFile(knowledgebaseId: string, format: KnowledgeFAQExportFormat, ids?: string[]) {
        await this.getFAQKnowledgebase(knowledgebaseId, 'read')
        const document = await this.findManagedDocument(knowledgebaseId)
        let entries = document
            ? (await this.findFAQChunks(document.id))
                  .filter(({ metadata }) => metadata.vectorSyncStatus === 'ready')
                  .map(({ chunk, metadata }) => this.toEntry(chunk, metadata))
            : []
        if (ids?.length) {
            const entriesById = new Map(entries.map((entry) => [entry.id, entry]))
            entries = ids.map((id) => entriesById.get(id)).filter((entry): entry is IKnowledgeFAQEntry => !!entry)
            if (entries.length !== ids.length) {
                throw new NotFoundException(
                    t('server-ai:Error.KnowledgeFAQExportSelectionChanged', {
                        defaultValue: 'One or more selected FAQ entries no longer exist. Refresh and try again.'
                    })
                )
            }
        }
        const content = format === 'json' ? serializeWeKnoraFAQJSON(entries) : serializeWeKnoraFAQCSV(entries)
        return {
            content: Buffer.from(content, 'utf8'),
            contentType: format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
            fileName: `faq-export-${new Date().toISOString().slice(0, 10)}.${format}`
        }
    }

    async exportImportTemplate(knowledgebaseId: string) {
        await this.getFAQKnowledgebase(knowledgebaseId, 'read')
        const content = serializeWeKnoraFAQCSV([
            {
                id: 'example',
                knowledgebaseId,
                standardQuestion: '如何重置密码？',
                similarQuestions: ['忘记密码怎么办？', '怎么找回密码？'],
                negativeQuestions: ['如何修改用户名？'],
                answerBlocks: ['打开登录页面。', '点击“忘记密码”并按提示操作。'],
                enabled: true,
                version: 1
            }
        ])
        return {
            content: Buffer.from(content, 'utf8'),
            contentType: 'text/csv; charset=utf-8',
            fileName: 'faq-import-template.csv'
        }
    }

    async create(knowledgebaseId: string, input: KnowledgeFAQWriteInput): Promise<IKnowledgeFAQEntry> {
        return this.withKnowledgebaseLock(knowledgebaseId, async () => {
            const knowledgebase = await this.getFAQKnowledgebase(knowledgebaseId, 'write')
            const normalized = this.validateInput(input)
            const document = await this.ensureManagedDocument(knowledgebase)
            const existing = await this.findFAQChunks(document.id)
            this.assertUnique(normalized, existing)
            const vectorStore = await this.knowledgebaseService.getActiveVectorStore(knowledgebase.id, true)
            return this.createReadyFAQRecord(knowledgebase, document, normalized, vectorStore)
        })
    }

    async update(knowledgebaseId: string, faqId: string, input: KnowledgeFAQUpdateInput): Promise<IKnowledgeFAQEntry> {
        return this.withKnowledgebaseLock(knowledgebaseId, async () => {
            const knowledgebase = await this.getFAQKnowledgebase(knowledgebaseId, 'write')
            const normalized = this.validateInput(input)
            const document = await this.requireManagedDocument(knowledgebaseId)
            const existing = await this.findFAQChunks(document.id)
            const current = this.requireFAQChunk(existing, faqId)
            if (current.chunk.version !== input.version) {
                throw new ConflictException(
                    t('server-ai:Error.KnowledgeFAQVersionConflict', {
                        defaultValue: 'FAQ entry has been modified. Refresh and try again.'
                    })
                )
            }
            this.assertUnique(normalized, existing, faqId)

            const oldWrite = this.buildStoredVectorWrite(knowledgebase, document, current)
            const newWrite = this.buildVectorWrite(knowledgebase, document, faqId, normalized)
            const vectorStore = await this.knowledgebaseService.getActiveVectorStore(knowledgebase.id, true)
            const config = resolveFAQConfig(knowledgebase)
            try {
                await vectorStore.deleteChunks([...new Set([...current.metadata.faqVectorIds, ...newWrite.ids])])
                await vectorStore.addKnowledgeChunks(newWrite.chunks, { ids: newWrite.ids })
                const readyMetadata = this.buildCanonicalMetadata(
                    faqId,
                    normalized,
                    newWrite.ids,
                    'ready',
                    normalized.enabled
                )
                await this.chunkService.updateWithVersion(
                    faqId,
                    {
                        pageContent: buildFAQKeywordProjection(normalized, config),
                        metadata: readyMetadata
                    },
                    input.version
                )
                return this.toEntry(
                    {
                        ...current.chunk,
                        version: input.version + 1
                    },
                    readyMetadata
                )
            } catch (error) {
                await this.restoreVectors(vectorStore, oldWrite, newWrite.ids, error)
                throw error
            }
        })
    }

    async delete(knowledgebaseId: string, faqId: string, version: number) {
        return this.withKnowledgebaseLock(knowledgebaseId, async () => {
            const knowledgebase = await this.getFAQKnowledgebase(knowledgebaseId, 'write')
            const document = await this.requireManagedDocument(knowledgebaseId)
            const existing = await this.findFAQChunks(document.id)
            const current = this.requireFAQChunk(existing, faqId)
            if (current.chunk.version !== version) {
                throw new ConflictException(
                    t('server-ai:Error.KnowledgeFAQVersionConflict', {
                        defaultValue: 'FAQ entry has been modified. Refresh and try again.'
                    })
                )
            }
            const vectorStore = await this.knowledgebaseService.getActiveVectorStore(knowledgebase.id, true)
            await this.deleteFAQRecord(knowledgebase, document, current, vectorStore)
        })
    }

    private async getFAQKnowledgebase(knowledgebaseId: string, access: 'read' | 'write') {
        const knowledgebase =
            access === 'write'
                ? await this.knowledgebaseService.assertKnowledgebaseWriteAccess(knowledgebaseId)
                : await this.knowledgebaseService.findOneByIdString(knowledgebaseId)
        if (knowledgebase.type !== KnowledgebaseTypeEnum.FAQ) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgeFAQKnowledgebaseRequired', {
                    defaultValue: 'FAQ entries can only be managed in an FAQ knowledgebase'
                })
            )
        }
        if (access === 'write') {
            await this.knowledgebaseService.assertNotRebuilding(knowledgebaseId)
        }
        return knowledgebase
    }

    private async findManagedDocument(knowledgebaseId: string) {
        const { items } = await this.documentService.findAll({
            where: {
                knowledgebaseId,
                sourceType: DocumentTypeEnum.FILE,
                sourceKey: FAQ_MANAGED_DOCUMENT_SOURCE_KEY
            },
            order: { createdAt: 'ASC' },
            take: 1
        })
        return items[0] ?? null
    }

    private async requireManagedDocument(knowledgebaseId: string) {
        const document = await this.findManagedDocument(knowledgebaseId)
        if (!document) {
            throw new NotFoundException(
                t('server-ai:Error.KnowledgeFAQManagedDocumentNotFound', {
                    defaultValue: 'The managed FAQ document was not found'
                })
            )
        }
        return document
    }

    private async ensureManagedDocument(knowledgebase: IKnowledgebase) {
        const existing = await this.findManagedDocument(knowledgebase.id)
        if (existing) return existing
        const metadata: FAQManagedDocumentMetadata = {
            systemManaged: true,
            systemManagedType: FAQ_SYSTEM_MANAGED_TYPE
        }
        return this.documentService.createDocument({
            knowledgebaseId: knowledgebase.id,
            name: 'FAQ',
            filePath: '.system/faq',
            sourceKey: FAQ_MANAGED_DOCUMENT_SOURCE_KEY,
            sourceType: DocumentTypeEnum.FILE,
            category: KBDocumentCategoryEnum.Text,
            type: 'txt',
            mimeType: 'text/plain',
            status: KBDocumentStatusEnum.FINISH,
            metadata
        })
    }

    private parseImportFile(file: Pick<Express.Multer.File, 'originalname' | 'buffer'>) {
        let entries: KnowledgeFAQWriteInput[]
        try {
            entries = parseWeKnoraFAQFile({ fileName: file.originalname, buffer: file.buffer })
        } catch (error) {
            throw new BadRequestException({
                message:
                    t('server-ai:Error.KnowledgeFAQImportInvalid', {
                        detail: getFAQImportErrorMessage(error),
                        defaultValue: 'The FAQ import file is invalid: {{detail}}'
                    }) || getFAQImportErrorMessage(error)
            })
        }
        if (entries.length > KNOWLEDGE_FAQ_IMPORT_MAX_ENTRIES) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgeFAQImportTooManyEntries', {
                    max: KNOWLEDGE_FAQ_IMPORT_MAX_ENTRIES,
                    defaultValue: 'An FAQ import can contain at most {{max}} entries.'
                })
            )
        }
        if (!entries.length) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgeFAQImportEmpty', {
                    defaultValue: 'The FAQ import file does not contain any entries.'
                })
            )
        }
        return entries
    }

    private prepareReplacementEntries(entries: KnowledgeFAQWriteInput[]) {
        const failed: KnowledgeFAQImportResult['failed'] = []
        const normalizedEntries: NormalizedFAQInput[] = []
        const validated: Array<NormalizedFAQInput & { id: string }> = []
        for (const [index, entry] of entries.entries()) {
            try {
                const normalized = this.validateInput(entry)
                assertFAQQuestionUniqueness(normalized, validated)
                validated.push({ ...normalized, id: `import-row-${index + 1}` })
                normalizedEntries.push(normalized)
            } catch (error) {
                failed.push({
                    row: index + 1,
                    standardQuestion: entry.standardQuestion,
                    message: getFAQImportErrorMessage(error)
                })
            }
        }
        return { normalizedEntries, failed }
    }

    private async replaceAll(
        knowledgebaseId: string,
        entries: KnowledgeFAQWriteInput[]
    ): Promise<KnowledgeFAQImportResult> {
        const prepared = this.prepareReplacementEntries(entries)
        if (prepared.failed.length) {
            return { total: entries.length, imported: 0, failed: prepared.failed }
        }

        return this.withKnowledgebaseLock(knowledgebaseId, async () => {
            const knowledgebase = await this.getFAQKnowledgebase(knowledgebaseId, 'write')
            const document = await this.ensureManagedDocument(knowledgebase)
            const existing = await this.findFAQChunks(document.id)
            const vectorStore = await this.knowledgebaseService.getActiveVectorStore(knowledgebase.id, true)
            const staged: StagedFAQRecord[] = []

            for (const [index, normalized] of prepared.normalizedEntries.entries()) {
                try {
                    staged.push(await this.stageFAQRecord(knowledgebase, document, normalized, vectorStore))
                } catch (error) {
                    await this.rollbackReplacement(knowledgebase, document, vectorStore, staged, [], error)
                    if (isFAQRecoveryFailure(error)) throw error
                    return {
                        total: entries.length,
                        imported: 0,
                        failed: [
                            {
                                row: index + 1,
                                standardQuestion: normalized.standardQuestion,
                                message: getFAQImportErrorMessage(error)
                            }
                        ]
                    }
                }
            }

            const deleted: FAQChunkRecord[] = []
            try {
                for (const current of existing) {
                    await this.deleteFAQRecord(knowledgebase, document, current, vectorStore)
                    deleted.push(current)
                }
                for (const current of staged) {
                    await this.finalizeStagedFAQRecord(knowledgebase, current)
                }
            } catch (error) {
                await this.rollbackReplacement(knowledgebase, document, vectorStore, staged, deleted, error)
                throw error
            }

            return { total: entries.length, imported: entries.length, failed: [] }
        })
    }

    private async findFAQChunks(documentId: string) {
        const { items } = await this.chunkService.findAll({
            where: { documentId },
            order: { updatedAt: 'DESC' }
        })
        return items.flatMap((chunk) => {
            if (!isKnowledgeFAQChunkMetadata(chunk.metadata)) return []
            return [{ chunk, metadata: chunk.metadata }]
        })
    }

    private requireFAQChunk(chunks: Awaited<ReturnType<KnowledgeFAQService['findFAQChunks']>>, faqId: string) {
        const result = chunks.find(({ chunk }) => chunk.id === faqId && chunk.knowledgebaseId)
        if (!result) {
            throw new NotFoundException(
                t('server-ai:Error.KnowledgeFAQNotFound', {
                    defaultValue: 'FAQ entry was not found'
                })
            )
        }
        return result
    }

    private validateInput(input: KnowledgeFAQWriteInput) {
        try {
            return validateAndNormalizeFAQInput(input)
        } catch (error) {
            if (!(error instanceof FAQInputValidationError)) throw error
            throw new BadRequestException({
                message:
                    t(`server-ai:Error.KnowledgeFAQValidation.${error.code}`, {
                        defaultValue: error.code
                    }) || error.code,
                code: error.code,
                field: error.field,
                conflictingFAQId: error.conflictingFAQId
            })
        }
    }

    private assertUnique(
        input: NormalizedFAQInput,
        chunks: Awaited<ReturnType<KnowledgeFAQService['findFAQChunks']>>,
        excludedFAQId?: string
    ) {
        try {
            assertFAQQuestionUniqueness(
                input,
                chunks.map(({ chunk, metadata }) => ({
                    id: chunk.id,
                    standardQuestion: metadata.standardQuestion,
                    similarQuestions: metadata.similarQuestions,
                    enabled: metadata.enabled
                })),
                excludedFAQId
            )
        } catch (error) {
            if (!(error instanceof FAQInputValidationError)) throw error
            throw new BadRequestException({
                message:
                    t('server-ai:Error.KnowledgeFAQValidation.duplicate_question', {
                        defaultValue: 'The standard question or similar question is already used by another FAQ'
                    }) || 'The standard question or similar question is already used by another FAQ',
                code: error.code,
                field: error.field,
                conflictingFAQId: error.conflictingFAQId
            })
        }
    }

    private buildCanonicalMetadata(
        faqId: string,
        input: NormalizedFAQInput,
        faqVectorIds: string[],
        vectorSyncStatus: IKnowledgeFAQChunkMetadata['vectorSyncStatus'],
        enabled: boolean
    ): IKnowledgeFAQChunkMetadata {
        return {
            chunkId: faqId,
            contentKind: 'faq',
            standardQuestion: input.standardQuestion,
            similarQuestions: input.similarQuestions,
            negativeQuestions: input.negativeQuestions,
            answerBlocks: input.answerBlocks,
            enabled,
            faqVectorIds,
            vectorSyncStatus,
            contentFormat: 'text',
            mediaType: 'text'
        }
    }

    private buildVectorWrite(
        knowledgebase: IKnowledgebase,
        document: IKnowledgeDocument,
        faqId: string,
        input: NormalizedFAQInput
    ): FAQVectorWrite {
        return buildFAQVectorWrite({
            knowledgebase,
            document,
            faqId,
            faq: input,
            config: resolveFAQConfig(knowledgebase),
            embeddingContextSize: resolveFAQEmbeddingContextSize(knowledgebase)
        })
    }

    private buildStoredVectorWrite(
        knowledgebase: IKnowledgebase,
        document: IKnowledgeDocument,
        current: FAQChunkRecord
    ) {
        const input = this.toNormalizedInput(current.metadata)
        const configured = this.buildVectorWrite(knowledgebase, document, current.chunk.id, input)
        if (sameStringSet(configured.ids, current.metadata.faqVectorIds)) return configured

        const legacy = buildFAQVectorWrite({
            knowledgebase,
            document,
            faqId: current.chunk.id,
            faq: input,
            config: resolveFAQConfig(knowledgebase)
        })
        return sameStringSet(legacy.ids, current.metadata.faqVectorIds) ? legacy : configured
    }

    private toNormalizedInput(metadata: IKnowledgeFAQChunkMetadata): NormalizedFAQInput {
        return {
            standardQuestion: metadata.standardQuestion,
            similarQuestions: metadata.similarQuestions,
            negativeQuestions: metadata.negativeQuestions ?? [],
            answerBlocks: metadata.answerBlocks,
            enabled: metadata.enabled
        }
    }

    private toEntry(
        chunk: Pick<IKnowledgeDocumentChunk, 'id' | 'knowledgebaseId' | 'version' | 'createdAt' | 'updatedAt'>,
        metadata: IKnowledgeFAQChunkMetadata
    ): IKnowledgeFAQEntry {
        return {
            id: chunk.id,
            knowledgebaseId: chunk.knowledgebaseId,
            standardQuestion: metadata.standardQuestion,
            similarQuestions: metadata.similarQuestions,
            negativeQuestions: metadata.negativeQuestions ?? [],
            answerBlocks: metadata.answerBlocks,
            enabled: metadata.enabled,
            version: chunk.version ?? 1,
            createdAt: chunk.createdAt,
            updatedAt: chunk.updatedAt
        }
    }

    private async stageFAQRecord(
        knowledgebase: IKnowledgebase,
        document: IKnowledgeDocument,
        input: NormalizedFAQInput,
        vectorStore: Awaited<ReturnType<KnowledgebaseService['getActiveVectorStore']>>,
        id = uuidv4(),
        initialVersion?: number
    ): Promise<StagedFAQRecord> {
        const config = resolveFAQConfig(knowledgebase)
        const vectorWrite = this.buildVectorWrite(knowledgebase, document, id, input)
        const pendingMetadata = this.buildCanonicalMetadata(id, input, [], 'pending', false)
        const chunk = await this.chunkService.create({
            id,
            knowledgebaseId: knowledgebase.id,
            documentId: document.id,
            pageContent: buildFAQKeywordProjection(input, config),
            metadata: pendingMetadata,
            ...(initialVersion ? { version: initialVersion } : {})
        })
        const staged = { id, input, vectorWrite, chunk, version: chunk.version ?? 1 }
        try {
            await vectorStore.addKnowledgeChunks(vectorWrite.chunks, { ids: vectorWrite.ids })
            return staged
        } catch (error) {
            await this.cleanupStagedFAQRecord(vectorStore, staged, error)
            throw error
        }
    }

    private async finalizeStagedFAQRecord(knowledgebase: IKnowledgebase, staged: StagedFAQRecord) {
        const metadata = this.buildCanonicalMetadata(
            staged.id,
            staged.input,
            staged.vectorWrite.ids,
            'ready',
            staged.input.enabled
        )
        await this.chunkService.updateWithVersion(
            staged.id,
            {
                pageContent: buildFAQKeywordProjection(staged.input, resolveFAQConfig(knowledgebase)),
                metadata
            },
            staged.version
        )
        staged.version++
        return this.toEntry({ ...staged.chunk, version: staged.version }, metadata)
    }

    private async createReadyFAQRecord(
        knowledgebase: IKnowledgebase,
        document: IKnowledgeDocument,
        input: NormalizedFAQInput,
        vectorStore: Awaited<ReturnType<KnowledgebaseService['getActiveVectorStore']>>,
        id?: string,
        initialVersion?: number
    ) {
        const staged = await this.stageFAQRecord(knowledgebase, document, input, vectorStore, id, initialVersion)
        try {
            return await this.finalizeStagedFAQRecord(knowledgebase, staged)
        } catch (error) {
            await this.cleanupStagedFAQRecord(vectorStore, staged, error)
            throw error
        }
    }

    private async deleteFAQRecord(
        knowledgebase: IKnowledgebase,
        document: IKnowledgeDocument,
        current: FAQChunkRecord,
        vectorStore: Awaited<ReturnType<KnowledgebaseService['getActiveVectorStore']>>
    ) {
        const oldWrite = this.buildStoredVectorWrite(knowledgebase, document, current)
        await vectorStore.deleteChunks(current.metadata.faqVectorIds)
        try {
            await this.chunkService.deleteWithVersion(current.chunk.id, current.chunk.version ?? 1)
        } catch (error) {
            const results = await Promise.allSettled([
                vectorStore.addKnowledgeChunks(oldWrite.chunks, { ids: oldWrite.ids })
            ])
            this.assertRecoverySucceeded('delete', error, results)
            throw error
        }
    }

    private async cleanupStagedFAQRecord(
        vectorStore: Awaited<ReturnType<KnowledgebaseService['getActiveVectorStore']>>,
        staged: StagedFAQRecord,
        primaryError: unknown
    ) {
        const results = await Promise.allSettled([
            vectorStore.deleteChunks(staged.vectorWrite.ids),
            this.chunkService.deleteWithVersion(staged.id, staged.version)
        ])
        this.assertRecoverySucceeded('create', primaryError, results)
    }

    private async restoreVectors(
        vectorStore: Awaited<ReturnType<KnowledgebaseService['getActiveVectorStore']>>,
        oldWrite: FAQVectorWrite,
        newVectorIds: string[],
        primaryError: unknown
    ) {
        const results = await Promise.allSettled([
            vectorStore.deleteChunks(newVectorIds),
            vectorStore.addKnowledgeChunks(oldWrite.chunks, { ids: oldWrite.ids })
        ])
        this.assertRecoverySucceeded('update', primaryError, results)
    }

    private async rollbackReplacement(
        knowledgebase: IKnowledgebase,
        document: IKnowledgeDocument,
        vectorStore: Awaited<ReturnType<KnowledgebaseService['getActiveVectorStore']>>,
        staged: StagedFAQRecord[],
        deleted: FAQChunkRecord[],
        primaryError: unknown
    ) {
        const results = await Promise.allSettled([
            ...staged.map((current) => this.cleanupStagedFAQRecord(vectorStore, current, primaryError)),
            ...deleted.map((current) =>
                this.createReadyFAQRecord(
                    knowledgebase,
                    document,
                    this.toNormalizedInput(current.metadata),
                    vectorStore,
                    current.chunk.id,
                    current.chunk.version ?? 1
                )
            )
        ])
        this.assertRecoverySucceeded('replace', primaryError, results)
    }

    private assertRecoverySucceeded(
        operation: string,
        primaryError: unknown,
        results: PromiseSettledResult<unknown>[]
    ) {
        const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
        if (!failures.length) return

        const detail = failures.map(getFAQImportErrorMessage).join('; ')
        this.logger.error(
            `FAQ ${operation} recovery failed after '${getFAQImportErrorMessage(primaryError)}': ${detail}`
        )
        throw new InternalServerErrorException({
            message: t('server-ai:Error.KnowledgeFAQRecoveryFailed', {
                defaultValue: 'FAQ data recovery failed. Reprocess the knowledgebase before continuing.'
            }),
            code: 'knowledge_faq_recovery_failed',
            operation
        })
    }

    private async withKnowledgebaseLock<T>(knowledgebaseId: string, operation: () => Promise<T>): Promise<T> {
        if (this.dataSource.options.type === 'postgres') {
            const queryRunner = this.dataSource.createQueryRunner()
            await queryRunner.connect()
            try {
                await queryRunner.query('SELECT pg_advisory_lock(hashtext($1))', [`knowledge-faq:${knowledgebaseId}`])
                return await operation()
            } finally {
                await queryRunner
                    .query('SELECT pg_advisory_unlock(hashtext($1))', [`knowledge-faq:${knowledgebaseId}`])
                    .catch(() => undefined)
                await queryRunner.release()
            }
        }

        const previous = this.localLocks.get(knowledgebaseId) ?? Promise.resolve()
        let releaseLock: () => void = () => undefined
        const current = new Promise<void>((resolve) => {
            releaseLock = resolve
        })
        const queued = previous.then(() => current)
        this.localLocks.set(knowledgebaseId, queued)
        await previous
        try {
            return await operation()
        } finally {
            releaseLock()
            if (this.localLocks.get(knowledgebaseId) === queued) {
                this.localLocks.delete(knowledgebaseId)
            }
        }
    }
}

function getFAQImportErrorMessage(error: unknown) {
    if (error instanceof FAQInputValidationError) {
        return (
            t(`server-ai:Error.KnowledgeFAQValidation.${error.code}`, {
                defaultValue: error.code
            }) || error.code
        )
    }
    if (error instanceof BadRequestException) {
        const response = error.getResponse()
        if (typeof response === 'string') return response
        if (
            typeof response === 'object' &&
            response !== null &&
            'message' in response &&
            typeof response.message === 'string'
        ) {
            return response.message
        }
    }
    return error instanceof Error ? error.message : 'Unknown FAQ import error.'
}

function sameStringSet(left: string[], right: string[]) {
    return left.length === right.length && left.every((value) => right.includes(value))
}

function isFAQRecoveryFailure(error: unknown) {
    if (!(error instanceof InternalServerErrorException)) return false
    const response = error.getResponse()
    return (
        typeof response === 'object' &&
        response !== null &&
        'code' in response &&
        response.code === 'knowledge_faq_recovery_failed'
    )
}
