import { buildQuestionVectors } from '../../knowledge-document/questions/question-vectors'
import { recordRebuiltQuestionVectors } from '../../knowledge-document/questions/question-rebuild'
import { questionSourceHash } from '../../knowledge-document/questions/question-generation'

import {
    DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG,
    IKnowledgebase,
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    KnowledgebaseStatusEnum,
    KnowledgebaseTypeEnum
} from '@xpert-ai/contracts'
import { getErrorMessage, shortuuid } from '@xpert-ai/server-common'

import { BadRequestException, Logger, NotFoundException } from '@nestjs/common'
import { Queue } from 'bull'

import { assign } from 'lodash'

import { DataSource } from 'typeorm'

import { Knowledgebase } from '../persistence/knowledgebase.entity'

import { buildFAQVectorWriteFromMetadata, resolveFAQEmbeddingContextSize } from '../faq/faq-vector'
import { isKnowledgeFAQChunkMetadata } from '../faq/faq-projection'

import { KnowledgeDocumentService } from '../../knowledge-document/document.service'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { TDocChunkMetadata } from '../../knowledge-document/types'

import { TKnowledgebaseRebuildEmbeddingJob } from '../shared/types'

import { RequestContext } from '@xpert-ai/plugin-sdk'

import type { KnowledgebaseService } from '../management/knowledgebase.service'

import { TEmbeddingCopilotModel } from './knowledgebase-model-policy'

interface KnowledgebaseRebuildOperationsContext {
    logger: Logger
    assertKnowledgebaseWriteAccess: KnowledgebaseService['assertKnowledgebaseWriteAccess']
    createVectorStoreForModel: KnowledgebaseService['createVectorStoreForModel']
    dataSource: DataSource
    documentService: KnowledgeDocumentService
    findOne: KnowledgebaseService['findOne']
    getEmbeddingModelName: KnowledgebaseService['getEmbeddingModelName']
    getEmbeddingProviderName: KnowledgebaseService['getEmbeddingProviderName']
    getPendingVectorStoreForRebuild: KnowledgebaseService['getPendingVectorStoreForRebuild']
    getPendingVectorStoreRelations: KnowledgebaseService['getPendingVectorStoreRelations']
    rebuildQueue: Queue<TKnowledgebaseRebuildEmbeddingJob>
    save: KnowledgebaseService['save']
    update: KnowledgebaseService['update']
}

export class KnowledgebaseRebuildOperations {
    constructor(private readonly context: KnowledgebaseRebuildOperationsContext) {}

    async assertNotRebuilding(knowledgebaseId: string) {
        const knowledgebase = await this.context.findOne(knowledgebaseId)
        if (knowledgebase.status === KnowledgebaseStatusEnum.REBUILDING) {
            throw new BadRequestException('Embedding rebuild is running')
        }
    }

    clearPendingEmbeddingModelFields() {
        return {
            pendingCopilotModel: null,
            pendingCopilotModelId: null,
            pendingEmbeddingCollectionName: null,
            pendingEmbeddingModelFingerprint: null,
            pendingEmbeddingDimensions: null,
            pendingEmbeddingRevision: null,
            rebuildTaskId: null,
            embeddingRebuildError: null
        }
    }

    async cancelPendingEmbeddingModel(id: string) {
        const knowledgebase = await this.context.assertKnowledgebaseWriteAccess(id, {
            relations: this.context.getPendingVectorStoreRelations()
        })
        if (knowledgebase.status === KnowledgebaseStatusEnum.REBUILDING) {
            throw new BadRequestException('Embedding rebuild is running')
        }

        assign(knowledgebase, {
            ...this.clearPendingEmbeddingModelFields(),
            status: KnowledgebaseStatusEnum.READY
        })
        return this.context.save(knowledgebase)
    }

    async startEmbeddingRebuild(id: string) {
        const knowledgebase = await this.context.assertKnowledgebaseWriteAccess(id, {
            relations: [
                'copilotModel',
                'copilotModel.copilot',
                'copilotModel.copilot.modelProvider',
                ...this.context.getPendingVectorStoreRelations()
            ]
        })

        if (knowledgebase.status === KnowledgebaseStatusEnum.REBUILDING) {
            throw new BadRequestException('Embedding rebuild is already running')
        }
        if (!knowledgebase.pendingCopilotModel || !knowledgebase.pendingEmbeddingModelFingerprint) {
            throw new BadRequestException('Pending embedding model is required for rebuild')
        }

        if (knowledgebase.pendingEmbeddingModelFingerprint === knowledgebase.embeddingModelFingerprint) {
            assign(knowledgebase, {
                ...this.clearPendingEmbeddingModelFields(),
                status: KnowledgebaseStatusEnum.READY
            })
            return this.context.save(knowledgebase)
        }

        if (
            knowledgebase.status !== KnowledgebaseStatusEnum.REBUILD_REQUIRED &&
            knowledgebase.status !== KnowledgebaseStatusEnum.REBUILD_FAILED
        ) {
            throw new BadRequestException(
                `Embedding rebuild cannot start from status '${knowledgebase.status ?? KnowledgebaseStatusEnum.READY}'`
            )
        }

        const rebuildTaskId = shortuuid()
        const pendingEmbeddingRevision =
            (knowledgebase.pendingEmbeddingRevision ?? knowledgebase.embeddingRevision ?? 0) + 1
        assign(knowledgebase, {
            status: KnowledgebaseStatusEnum.REBUILDING,
            rebuildTaskId,
            pendingEmbeddingRevision,
            embeddingRebuildError: null
        })
        const saved = await this.context.save(knowledgebase)

        await this.context.rebuildQueue.add({
            userId: RequestContext.currentUserId(),
            tenantId: knowledgebase.tenantId,
            organizationId: knowledgebase.organizationId,
            knowledgebaseId: id,
            rebuildTaskId,
            pendingEmbeddingRevision
        })

        return saved
    }

    assertCurrentRebuildTask(knowledgebase: IKnowledgebase, rebuildTaskId: string, pendingEmbeddingRevision: number) {
        if (
            knowledgebase.status !== KnowledgebaseStatusEnum.REBUILDING ||
            knowledgebase.rebuildTaskId !== rebuildTaskId ||
            knowledgebase.pendingEmbeddingRevision !== pendingEmbeddingRevision
        ) {
            throw new BadRequestException('Embedding rebuild task is stale')
        }
    }

    async processEmbeddingRebuildJob(data: TKnowledgebaseRebuildEmbeddingJob) {
        const knowledgebase = await this.context.findOne(data.knowledgebaseId, {
            relations: this.context.getPendingVectorStoreRelations()
        })
        this.assertCurrentRebuildTask(knowledgebase, data.rebuildTaskId, data.pendingEmbeddingRevision)

        const vectorStore = await this.context.getPendingVectorStoreForRebuild(knowledgebase)
        await vectorStore.clear()

        const chunkRepository = this.context.dataSource.getRepository(KnowledgeDocumentChunk)
        const chunks = await chunkRepository.find({
            where: {
                knowledgebaseId: data.knowledgebaseId
            },
            relations: ['parent', 'document'],
            order: {
                createdAt: 'ASC'
            }
        })

        const embeddingChunks = await this.context.documentService.findAllEmbeddingNodes({
            chunks
        } as IKnowledgeDocument)
        const missingContent = embeddingChunks.find((chunk) => !chunk.pageContent)
        if (missingContent) {
            throw new BadRequestException(`Chunk '${missingContent.id}' has no pageContent for embedding rebuild`)
        }

        const questionRebuilds: Array<{
            chunk: IKnowledgeDocumentChunk<TDocChunkMetadata>
            write: ReturnType<typeof buildQuestionVectors>
        }> = []
        const embeddingItems =
            knowledgebase.type === KnowledgebaseTypeEnum.FAQ
                ? embeddingChunks.flatMap((chunk) => {
                      if (
                          !chunk.id ||
                          !chunk.document ||
                          !isKnowledgeFAQChunkMetadata(chunk.metadata) ||
                          chunk.metadata.vectorSyncStatus === 'pending' ||
                          chunk.metadata.vectorSyncStatus === 'failed'
                      ) {
                          return []
                      }
                      const write = buildFAQVectorWriteFromMetadata({
                          knowledgebase,
                          document: chunk.document,
                          faqId: chunk.id,
                          metadata: chunk.metadata,
                          config: knowledgebase.faqConfig ?? DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG,
                          embeddingContextSize: resolveFAQEmbeddingContextSize(knowledgebase, 'pending')
                      })
                      return write.chunks.map((item, index) => ({ chunk: item, id: write.ids[index] }))
                  })
                : embeddingChunks.flatMap((chunk) => {
                      const source = { chunk, id: chunk.id }
                      const state = chunk.metadata?.questionGeneration
                      if (
                          !chunk.document ||
                          state?.status !== 'ready' ||
                          state.sourceHash !== questionSourceHash(chunk)
                      )
                          return [source]
                      const write = buildQuestionVectors(
                          chunk.document,
                          chunk,
                          state,
                          vectorStore.embeddingModelContextSize
                      )
                      questionRebuilds.push({ chunk, write })
                      return [source, ...write.chunks.map((item, index) => ({ chunk: item, id: write.ids[index] }))]
                  })

        const batchSize = knowledgebase.parserConfig?.embeddingBatchSize || 10
        let count = 0
        while (batchSize * count < embeddingItems.length) {
            const batch = embeddingItems.slice(batchSize * count, batchSize * (count + 1))
            await vectorStore.addKnowledgeChunks(
                batch.map(({ chunk }) => chunk),
                {
                    ids: batch.map(({ id }) => id)
                }
            )
            count++
        }

        for (const { chunk, write } of questionRebuilds) {
            await recordRebuiltQuestionVectors(chunkRepository, chunk, write)
        }
        return this.promoteEmbeddingRebuild(data.knowledgebaseId, data.rebuildTaskId, data.pendingEmbeddingRevision)
    }

    async markEmbeddingRebuildFailed(data: TKnowledgebaseRebuildEmbeddingJob, error: string) {
        const knowledgebase = await this.context.findOne(data.knowledgebaseId)
        if (
            knowledgebase.rebuildTaskId !== data.rebuildTaskId ||
            knowledgebase.pendingEmbeddingRevision !== data.pendingEmbeddingRevision
        ) {
            this.context.logger.warn(`Skip stale embedding rebuild failure for knowledgebase '${data.knowledgebaseId}'`)
            return knowledgebase
        }

        return this.context.update(data.knowledgebaseId, {
            status: KnowledgebaseStatusEnum.REBUILD_FAILED,
            embeddingRebuildError: error
        })
    }

    async promoteEmbeddingRebuild(knowledgebaseId: string, rebuildTaskId: string, pendingEmbeddingRevision: number) {
        let oldCollectionName: string | null = null
        let oldCopilotModel: TEmbeddingCopilotModel | null = null
        let promotedCollectionName: string | null = null

        const promoted = await this.context.dataSource.transaction(async (manager) => {
            const knowledgebaseRepository = manager.getRepository(Knowledgebase)
            const knowledgebase = await knowledgebaseRepository.findOne({
                where: { id: knowledgebaseId },
                relations: [
                    'copilotModel',
                    'copilotModel.copilot',
                    'copilotModel.copilot.modelProvider',
                    ...this.context.getPendingVectorStoreRelations()
                ]
            })
            if (!knowledgebase) {
                throw new NotFoundException(`Knowledgebase '${knowledgebaseId}' not found`)
            }
            this.assertCurrentRebuildTask(knowledgebase, rebuildTaskId, pendingEmbeddingRevision)
            if (!knowledgebase.pendingCopilotModel || !knowledgebase.pendingEmbeddingCollectionName) {
                throw new BadRequestException('Pending embedding model is required for promote')
            }

            oldCollectionName = knowledgebase.embeddingCollectionName ?? null
            oldCopilotModel = knowledgebase.copilotModel ?? null
            promotedCollectionName = knowledgebase.pendingEmbeddingCollectionName

            assign(knowledgebase, {
                copilotModel: knowledgebase.pendingCopilotModel,
                copilotModelId: knowledgebase.pendingCopilotModelId,
                embeddingCollectionName: knowledgebase.pendingEmbeddingCollectionName,
                embeddingModelFingerprint: knowledgebase.pendingEmbeddingModelFingerprint,
                embeddingDimensions: knowledgebase.pendingEmbeddingDimensions,
                embeddingRevision: knowledgebase.pendingEmbeddingRevision,
                ...this.clearPendingEmbeddingModelFields(),
                status: KnowledgebaseStatusEnum.READY
            })

            const saved = await knowledgebaseRepository.save(knowledgebase)
            const chunkRepository = manager.getRepository(KnowledgeDocumentChunk)
            const chunks = await chunkRepository.find({
                where: {
                    knowledgebaseId
                }
            })
            chunks.forEach((chunk) => {
                chunk.metadata ??= {} as TDocChunkMetadata
                chunk.metadata.model = this.context.getEmbeddingModelName(saved.copilotModel)
                chunk.metadata.provider = this.context.getEmbeddingProviderName(saved.copilotModel)
                chunk.metadata.embeddingModelFingerprint = saved.embeddingModelFingerprint
                chunk.metadata.embeddingDimensions = saved.embeddingDimensions
                chunk.metadata.embeddingRevision = saved.embeddingRevision
            })
            if (chunks.length) {
                await chunkRepository.save(chunks)
            }

            return saved
        })

        if (oldCollectionName && oldCollectionName !== promotedCollectionName) {
            this.cleanupEmbeddingCollection(promoted, oldCopilotModel, oldCollectionName).catch((error) => {
                this.context.logger.warn(
                    `Failed to cleanup old embedding collection '${oldCollectionName}': ${getErrorMessage(error)}`
                )
            })
        }

        return promoted
    }

    async cleanupEmbeddingCollection(
        knowledgebase: IKnowledgebase,
        copilotModel: TEmbeddingCopilotModel | null,
        collectionName: string
    ) {
        const vectorStore = await this.context.createVectorStoreForModel({
            knowledgebase,
            copilotModel,
            collectionName,
            requiredEmbeddings: false,
            rerankEnabled: false,
            embeddingMetadata: {
                provider: this.context.getEmbeddingProviderName(copilotModel),
                model: this.context.getEmbeddingModelName(copilotModel),
                embeddingModelFingerprint: knowledgebase.embeddingModelFingerprint ?? null,
                embeddingDimensions: knowledgebase.embeddingDimensions ?? null,
                embeddingRevision: knowledgebase.embeddingRevision ?? null,
                vectorIdCollectionName: collectionName
            }
        })
        await vectorStore.clear()
    }
}
