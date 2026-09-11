import { Document } from '@langchain/core/documents'
import {
    AiModelTypeEnum,
    IKnowledgebase,
    IKnowledgeDocument,
    KnowledgeDocumentProcessingMode,
    KnowledgeDocumentLastIncrementalSync,
    KBDocumentStatusEnum,
    KnowledgeDocumentMetadata
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { UserService } from '@xpert-ai/server-core'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ChunkMetadata, countTextTokens } from '@xpert-ai/plugin-sdk'
import { Job } from 'bull'
import { CopilotTokenRecordCommand } from '../copilot-user'
import { KnowledgebaseService, KnowledgeDocumentStore } from '../knowledgebase/index'
import { KnowledgeDocLoadCommand } from './commands'
import { KnowledgeDerivedIndexPublicationService } from './derived-index-publication.service'
import { IncrementalChunkSyncResult, KnowledgeDocumentService } from './document.service'
import { computeKnowledgeDocumentProcessingHash, resolveKnowledgeDocumentSourceHash } from './document-hash'
import { guardEmbeddingInputDocuments } from './embedding-input-guard'
import { JOB_EMBEDDING_DOCUMENT } from './types'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import { KnowledgeDocumentPublicationWriter, writeKnowledgeDocumentProcessingMetadata } from './document-publication'
import { KnowledgeProcessingReadyService } from './processing-lifecycle.module'

/** Queue payload keeps processing mode durable across the HTTP/background-worker boundary. */
type KnowledgeDocumentJobData = {
    userId: string
    docs: IKnowledgeDocument[]
    mode?: KnowledgeDocumentProcessingMode
}

@Processor({
    name: JOB_EMBEDDING_DOCUMENT
    // scope: Scope.REQUEST
})
export class KnowledgeDocumentConsumer {
    private readonly logger = new Logger(KnowledgeDocumentConsumer.name)

    constructor(
        @Inject(JOB_REF) jobRef: Job,
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly documentService: KnowledgeDocumentService,
        private readonly userService: UserService,
        private readonly commandBus: CommandBus,
        private readonly publicationService: KnowledgeDerivedIndexPublicationService,
        private readonly lifecycle: KnowledgeProcessingReadyService
    ) {}

    @Process({ concurrency: 5 })
    async process(job: Job<KnowledgeDocumentJobData>) {
        await this.lifecycle.waitUntilReady()
        const user = await this.userService.findOne(job.data.userId, { relations: ['role'] })
        const firstDoc = job.data.docs[0]
        if (!firstDoc) {
            return {}
        }

        const context = captureRequestContext({
            user,
            organizationId: firstDoc.organizationId,
            language: user.preferredLanguage
        })

        try {
            // Embedding model creation reads plugin-sdk RequestContext, while older CRUD paths
            // still read server-core context; queued work needs both scopes restored.
            return await runWithCapturedRequestContext(context, () => this.processInRequestContext(job))
        } catch (err) {
            this.logger.error(err)
            await this.markQueuedDocsFailed(job, err)
            throw err
        }
    }

    private async processInRequestContext(job: Job<KnowledgeDocumentJobData>) {
        const knowledgebaseId = job.data.docs[0]?.knowledgebaseId
        const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId, {
            relations: ['copilotModel', 'copilotModel.copilot', 'copilotModel.copilot.modelProvider']
        })

        return this._processJob(knowledgebase, job.data.docs, job)
    }

    private async markQueuedDocsFailed(job: Job<KnowledgeDocumentJobData>, err: unknown) {
        const processBeginAt = new Date()
        await Promise.all(
            job.data.docs.map((doc) =>
                this.documentService.update(doc.id, {
                    status: KBDocumentStatusEnum.ERROR,
                    processBeginAt,
                    processDuration: 0,
                    processDuation: 0,
                    processMsg: getErrorMessage(err),
                    progress: 0
                })
            )
        )
    }

    async _processJob(knowledgebase: IKnowledgebase, docs: IKnowledgeDocument<KnowledgeDocumentMetadata>[], job: Job) {
        const copilot = knowledgebase?.copilotModel?.copilot
        let vectorStore: KnowledgeDocumentStore
        try {
            // const doc = job.data.docs[0]
            vectorStore = await this.knowledgebaseService.getActiveVectorStore(knowledgebase, true)
        } catch (err) {
            const processBeginAt = new Date()
            await Promise.all(
                docs.map((doc) =>
                    this.documentService.update(doc.id, {
                        status: KBDocumentStatusEnum.ERROR,
                        processBeginAt,
                        processDuration: 0,
                        processDuation: 0,
                        processMsg: getErrorMessage(err),
                        progress: 0
                    })
                )
            )
            throw err
        }

        for await (const doc of job.data.docs) {
            const document = await this.documentService.findOne(doc.id, { relations: ['chunks'] })
            let processBeginAt: Date | null = null

            try {
                // Start processing
                processBeginAt = new Date()
                const processingHash = computeKnowledgeDocumentProcessingHash(document)
                const sourceHash = resolveKnowledgeDocumentSourceHash(document)
                await this.documentService.update(document.id, { processBeginAt, processingHash, sourceHash })

                if (
                    document.status === KBDocumentStatusEnum.FINISH &&
                    document.processingHash === processingHash &&
                    document.contentHash
                ) {
                    const sourceTokens = await this.updateSourceTokenCounts(document)
                    const processDuration = new Date().getTime() - processBeginAt.getTime()
                    await this.updateDocumentProcessingMetadata(
                        document.id,
                        {
                            status: KBDocumentStatusEnum.FINISH,
                            processMsg: '',
                            processDuration,
                            processDuation: processDuration,
                            progress: 100,
                            processingHash,
                            sourceHash,
                            tokenNum: sourceTokens
                        },
                        {
                            tokens: sourceTokens,
                            lastIncrementalSync: this.createSkippedIncrementalSyncMetadata(document)
                        }
                    )
                    this.logger.debug(
                        `[Job: entity '${job.id}'] Document '${document.id}' unchanged; skipped embedding.`
                    )
                    await this.publicationService.publish({
                        knowledgebase,
                        documentId: document.id,
                        userId: job.data.userId,
                        contentChanged: false
                    })
                    continue
                }

                const data = await this.commandBus.execute<
                    KnowledgeDocLoadCommand,
                    { chunks: Document<ChunkMetadata>[] }
                >(
                    new KnowledgeDocLoadCommand({
                        doc: document,
                        stage: 'prod',
                        mode: job.data.mode ?? 'full'
                    })
                )

                let chunks = data?.chunks // .map(transformDocument2Chunk)
                let totalTokenUsed = 0
                let embeddingTokenUsed = 0
                let syncResult: IncrementalChunkSyncResult | null = null
                if (chunks) {
                    chunks = guardEmbeddingInputDocuments(
                        chunks,
                        knowledgebase.copilotModel?.options?.context_size ??
                            knowledgebase.copilotModel?.referencedModel?.options?.context_size
                    )
                    this.logger.debug(`Embeddings document '${document.name}' size: ${chunks.length}`)
                    syncResult = await this.documentService.syncChunksIncrementally(
                        { ...document, chunks },
                        vectorStore
                    )
                    document.chunks = syncResult.chunks
                    chunks = syncResult.embeddingChunks as Document<ChunkMetadata>[]
                    totalTokenUsed = await this.updateSourceTokenCounts(document)
                    await this.updateDocumentProcessingMetadata(
                        document.id,
                        {
                            status: KBDocumentStatusEnum.EMBEDDING,
                            progress: 0,
                            draft: null,
                            processingHash,
                            sourceHash,
                            chunkNum: syncResult.chunks.length,
                            tokenNum: totalTokenUsed
                        },
                        { tokens: totalTokenUsed }
                    )
                    const batchSize = knowledgebase.parserConfig?.embeddingBatchSize || 10
                    let count = 0
                    while (batchSize * count < chunks.length) {
                        const batch = chunks.slice(batchSize * count, batchSize * (count + 1))
                        // Embedding usage may count searchContent; source chunk statistics always count pageContent.
                        let tokenUsed = 0
                        batch.forEach((chunk) => {
                            const contentForEmbedding = chunk.metadata?.searchContent ?? chunk.pageContent
                            tokenUsed += countTextTokens(contentForEmbedding)
                        })
                        embeddingTokenUsed += tokenUsed
                        await this.commandBus.execute(
                            new CopilotTokenRecordCommand({
                                tenantId: knowledgebase.tenantId,
                                requestId: `knowledge-document:${job.id}:${document.id}:${count}`,
                                organizationId: knowledgebase.organizationId,
                                userId: job.data.userId,
                                copilotId: copilot.id,
                                tokenUsed,
                                model: vectorStore.embeddingModel,
                                modelType: AiModelTypeEnum.TEXT_EMBEDDING,
                                modelAccess: vectorStore.modelAccess
                            })
                        )
                        await vectorStore.addKnowledgeDocument(document, batch)
                        count++
                        const progress =
                            batchSize * count >= chunks.length
                                ? 100
                                : (((batchSize * count) / chunks.length) * 100).toFixed(1)
                        this.logger.debug(`Embeddings document '${document.name}' progress: ${progress}%`)
                        if (await this.checkIfJobCancelled(doc.id)) {
                            this.logger.debug(`[Job: entity '${job.id}'] Cancelled`)
                            const processDuration = new Date().getTime() - processBeginAt.getTime()
                            await this.documentService.update(doc.id, {
                                status: KBDocumentStatusEnum.CANCEL,
                                processMsg: '',
                                processDuration,
                                processDuation: processDuration,
                                progress: Number(progress),
                                metadata: { ...doc.metadata, tokens: totalTokenUsed }
                            })
                            return
                        }
                        await this.updateDocumentProcessingMetadata(
                            doc.id,
                            {
                                status: KBDocumentStatusEnum.EMBEDDING,
                                progress: Number(progress)
                            },
                            { tokens: totalTokenUsed }
                        )
                    }
                }

                const processDuration = new Date().getTime() - processBeginAt.getTime()
                await this.updateDocumentProcessingMetadata(
                    doc.id,
                    {
                        status: KBDocumentStatusEnum.FINISH,
                        processMsg: '',
                        processDuration,
                        processDuation: processDuration,
                        progress: 100,
                        ...(syncResult ? { contentHash: syncResult.contentHash } : {}),
                        processingHash,
                        sourceHash
                    },
                    {
                        tokens: totalTokenUsed,
                        lastIncrementalSync: syncResult
                            ? this.createIncrementalSyncMetadata(document, syncResult, embeddingTokenUsed)
                            : this.createSkippedIncrementalSyncMetadata(document)
                    },
                    syncResult?.contentChanged === true
                )

                await this.publicationService.publish({
                    knowledgebase,
                    documentId: document.id,
                    userId: job.data.userId,
                    contentChanged: syncResult?.contentChanged === true
                })

                this.logger.debug(`[Job: entity '${job.id}'] End!`)
            } catch (err) {
                this.logger.debug(`[Job: entity '${job.id}'] Error!`)
                const processDuration = processBeginAt ? new Date().getTime() - processBeginAt.getTime() : null
                await this.documentService.update(document.id, {
                    status: KBDocumentStatusEnum.ERROR,
                    processMsg: getErrorMessage(err),
                    processDuration,
                    processDuation: processDuration
                })
                this.logger.warn(`[Job: entity '${job.id}'] Document '${document.id}' failed: ${getErrorMessage(err)}`)
            }
        }

        return {}
    }

    private async updateSourceTokenCounts(document: IKnowledgeDocument) {
        const updates = (document.chunks ?? []).flatMap((chunk) => {
            const tokens = countTextTokens(chunk.pageContent)
            if (chunk.metadata?.tokens === tokens) return []
            chunk.metadata = { ...chunk.metadata, tokens }
            return [{ id: chunk.id, metadata: { chunkId: chunk.metadata.chunkId, tokens } }]
        })
        if (updates.length) await this.documentService.updateChunkMetadataBulk(updates)
        const chunks = await this.documentService.findAllEmbeddingNodes(document)
        // Sum searchable leaves so parent context is not counted twice.
        return chunks.reduce((tokens, chunk) => tokens + countTextTokens(chunk.pageContent), 0)
    }

    private createSkippedIncrementalSyncMetadata(
        document: Pick<IKnowledgeDocument<KnowledgeDocumentMetadata>, 'chunks' | 'chunkNum'>
    ): KnowledgeDocumentLastIncrementalSync {
        const total = document.chunks?.length ?? document.chunkNum ?? 0
        return {
            mode: 'skipped',
            total,
            skipped: total,
            added: 0,
            updated: 0,
            deleted: 0,
            embeddingTokens: 0,
            processedAt: new Date().toISOString()
        }
    }

    private createIncrementalSyncMetadata(
        document: Pick<IKnowledgeDocument<KnowledgeDocumentMetadata>, 'contentHash'>,
        syncResult: IncrementalChunkSyncResult,
        embeddingTokens: number
    ): KnowledgeDocumentLastIncrementalSync {
        const mode = !syncResult.contentChanged ? 'skipped' : document.contentHash ? 'incremental' : 'full'
        return {
            mode,
            total: syncResult.statistics.total,
            skipped: syncResult.statistics.skipped,
            added: syncResult.statistics.added,
            updated: syncResult.statistics.updated,
            deleted: syncResult.statistics.deleted,
            embeddingTokens,
            processedAt: new Date().toISOString()
        }
    }

    private async updateDocumentProcessingMetadata(
        documentId: string,
        updates: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>,
        metadataPatch?: Partial<KnowledgeDocumentMetadata>,
        contentChanged?: boolean
    ) {
        return writeKnowledgeDocumentProcessingMetadata(
            this.documentService as unknown as KnowledgeDocumentPublicationWriter,
            documentId,
            updates,
            metadataPatch,
            contentChanged
        )
    }

    async checkIfJobCancelled(docId: string): Promise<boolean> {
        // Check database/cache for cancellation flag
        const doc = await this.documentService.findOne(docId)
        if (doc) {
            return doc?.status === KBDocumentStatusEnum.CANCEL
        }
        return true
    }
}
