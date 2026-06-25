import { Document } from '@langchain/core/documents'
import {
    IKnowledgebase,
    IKnowledgeDocument,
    KnowledgeDocumentLastIncrementalSync,
    KBDocumentStatusEnum,
    KnowledgeDocumentMetadata
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { runWithRequestContext, UserService } from '@xpert-ai/server-core'
import { JOB_REF, Process, Processor } from '@nestjs/bull'
import { Inject, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ChunkMetadata, countTokensSafe } from '@xpert-ai/plugin-sdk'
import { Job } from 'bull'
import { CopilotTokenRecordCommand } from '../copilot-user'
import { KnowledgeGraphEnqueueCommand } from '../graphrag/commands'
import { KnowledgebaseService, KnowledgeDocumentStore } from '../knowledgebase/index'
import { KnowledgeDocLoadCommand } from './commands'
import { IncrementalChunkSyncResult, KnowledgeDocumentService } from './document.service'
import { computeKnowledgeDocumentProcessingHash, resolveKnowledgeDocumentSourceHash } from './document-hash'
import { JOB_EMBEDDING_DOCUMENT } from './types'

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
        private readonly commandBus: CommandBus
    ) {}

    @Process({ concurrency: 5 })
    async process(job: Job<{ userId: string; docs: IKnowledgeDocument[] }>) {
        const user = await this.userService.findOne(job.data.userId, { relations: ['role'] })
        const firstDoc = job.data.docs[0]
        if (!firstDoc) {
            return {}
        }

        return new Promise((resolve, reject) => {
            runWithRequestContext(
                {
                    user,
                    headers: {
                        ['organization-id']: firstDoc.organizationId,
                        language: user.preferredLanguage
                    }
                },
                () => {
                    this.processInRequestContext(job)
                        .then(resolve)
                        .catch(async (err) => {
                            this.logger.error(err)
                            await this.markQueuedDocsFailed(job, err)
                            reject(err)
                        })
                }
            )
        })
    }

    private async processInRequestContext(job: Job<{ userId: string; docs: IKnowledgeDocument[] }>) {
        const knowledgebaseId = job.data.docs[0]?.knowledgebaseId
        const knowledgebase = await this.knowledgebaseService.findOne(knowledgebaseId, {
            relations: ['copilotModel', 'copilotModel.copilot', 'copilotModel.copilot.modelProvider']
        })

        return this._processJob(knowledgebase, job.data.docs, job)
    }

    private async markQueuedDocsFailed(job: Job<{ userId: string; docs: IKnowledgeDocument[] }>, err: unknown) {
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
                            sourceHash
                        },
                        {
                            lastIncrementalSync: this.createSkippedIncrementalSyncMetadata(document)
                        }
                    )
                    this.logger.debug(
                        `[Job: entity '${job.id}'] Document '${document.id}' unchanged; skipped embedding.`
                    )
                    continue
                }

                const data = await this.commandBus.execute<
                    KnowledgeDocLoadCommand,
                    { chunks: Document<ChunkMetadata>[] }
                >(new KnowledgeDocLoadCommand({ doc: document, stage: 'prod' }))

                let chunks = data?.chunks // .map(transformDocument2Chunk)
                let totalTokenUsed = 0
                let embeddingTokenUsed = 0
                let syncResult: IncrementalChunkSyncResult | null = null
                if (chunks) {
                    this.logger.debug(`Embeddings document '${document.name}' size: ${chunks.length}`)
                    syncResult = await this.documentService.syncChunksIncrementally(
                        { ...document, chunks },
                        vectorStore
                    )
                    document.chunks = syncResult.chunks
                    chunks = syncResult.embeddingChunks as Document<ChunkMetadata>[]
                    totalTokenUsed = await this.countEmbeddingTokens(document)
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
                        // Count and Record token usage for embedding
                        // Use searchContent when present, otherwise fall back to full pageContent
                        let tokenUsed = 0
                        batch.forEach((chunk) => {
                            const contentForEmbedding = chunk.metadata?.searchContent ?? chunk.pageContent
                            chunk.metadata.tokens = countTokensSafe(contentForEmbedding)
                            tokenUsed += chunk.metadata.tokens
                        })
                        embeddingTokenUsed += tokenUsed
                        await this.documentService.updateChunkMetadataBulk(
                            batch.map((chunk) => ({
                                id: chunk.id,
                                metadata: chunk.metadata
                            }))
                        )
                        await this.commandBus.execute(
                            new CopilotTokenRecordCommand({
                                tenantId: knowledgebase.tenantId,
                                organizationId: knowledgebase.organizationId,
                                userId: job.data.userId,
                                copilotId: copilot.id,
                                tokenUsed,
                                model: vectorStore.embeddingModel
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
                    if (syncResult.contentChanged) {
                        await this.enqueueGraphIndex(knowledgebase, document.id, job.data.userId)
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
                    }
                )

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

    private async countEmbeddingTokens(document: IKnowledgeDocument) {
        const chunks = await this.documentService.findAllEmbeddingNodes(document)
        return chunks.reduce((tokens, chunk) => {
            const contentForEmbedding = chunk.metadata?.searchContent ?? chunk.pageContent
            return tokens + countTokensSafe(contentForEmbedding)
        }, 0)
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
        metadataPatch?: Partial<KnowledgeDocumentMetadata>
    ) {
        if (!metadataPatch) {
            return await this.documentService.update(documentId, updates)
        }

        const current = await this.documentService.findOne(documentId, { select: { id: true, metadata: true } })
        return await this.documentService.update(documentId, {
            ...updates,
            metadata: {
                ...(current.metadata ?? {}),
                ...metadataPatch
            }
        })
    }

    private async enqueueGraphIndex(knowledgebase: IKnowledgebase, documentId: string, userId?: string) {
        try {
            await this.commandBus.execute(
                new KnowledgeGraphEnqueueCommand({
                    userId,
                    tenantId: knowledgebase.tenantId,
                    organizationId: knowledgebase.organizationId,
                    knowledgebaseId: knowledgebase.id,
                    documentIds: [documentId],
                    reason: 'document'
                })
            )
        } catch (error) {
            this.logger.warn(`Failed to enqueue GraphRAG index for document '${documentId}': ${getErrorMessage(error)}`)
        }
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
