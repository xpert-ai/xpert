import { sortChunksByDocumentOrder } from '../document-chunk-order'
import { questionVectorIds } from '../questions/question-vectors'
import { questionSourceHash } from '../questions/question-generation'
import {
    IKnowledgeDocument,
    IKnowledgeDocumentChunk,
    KnowledgeStructureEnum,
    VectorTypeEnum
} from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ChunkMetadata, mergeParentChildChunks, RequestContext } from '@xpert-ai/plugin-sdk'
import { Document } from 'langchain/document'
import { compact, uniq } from 'lodash'
import { FindOptionsWhere, In, Raw, Repository } from 'typeorm'
import { KnowledgebaseService } from '../../knowledgebase/management/knowledgebase.service'
import type { TVectorSearchParams } from '../../knowledgebase/embedding/vector-store'
import { KnowledgeDocument } from '../document.entity'
import { KnowledgeDocumentPage } from '../../core/entities/internal'
import { KnowledgeDocumentChunkService } from './chunk.service'
import { computeKnowledgeDocumentChunkHash, computeKnowledgeDocumentContentHash } from '../document-hash'
import { TDocChunkMetadata } from '../types'
import { KnowledgeDerivedIndexPublicationService } from '../derived-index-publication.service'
import { KnowledgeDocumentPublicationWriter, writeKnowledgeDocumentPublication } from '../document-publication'
import { protectTableChunkMetadata } from '../table-metadata-input'
import { validateMetadataAgainstSchema } from '../metadata/document-metadata'
import { assertExpectedVersion } from '../document-version'
import { getChunkLogicalId } from './chunk-identity'
import type { KnowledgeDocumentService } from '../document.service'

function includesChunk(chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[], targetChunkId: string) {
    return chunks.some((chunk) => chunk.id === targetChunkId || String(chunk.metadata?.chunkId ?? '') === targetChunkId)
}

function requiresChunkReembedding(entity: Partial<IKnowledgeDocumentChunk>) {
    return (
        entity.pageContent !== undefined ||
        (entity.metadata && Object.prototype.hasOwnProperty.call(entity.metadata, 'searchContent'))
    )
}

export class DocumentChunks {
    constructor(
        private readonly documents: Pick<
            KnowledgeDocumentService,
            'findOne' | 'getDocumentVectorStore' | 'findAll' | 'update'
        >,
        private readonly chunkService: KnowledgeDocumentChunkService,
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly pageRepository: Repository<KnowledgeDocumentPage>,
        private readonly derivedIndexPublicationService: KnowledgeDerivedIndexPublicationService
    ) {}

    /**
     * Find all chunks of a document, filter by metadata
     *
     * @param id Document ID
     * @param params Vector Search Params
     * @returns
     */
    async getChunks(id: string, params: TVectorSearchParams) {
        const targetChunkId = params.targetChunkId?.trim()
        if (targetChunkId) {
            const page = await this.getChunks(id, { ...params, targetChunkId: undefined })
            const stored = await this.chunkService.findAll({
                where: [
                    { documentId: id, id: targetChunkId },
                    {
                        documentId: id,
                        metadata: Raw((alias) => `${alias} ->> 'chunkId' = :targetChunkId`, { targetChunkId })
                    }
                ] as FindOptionsWhere<IKnowledgeDocumentChunk<TDocChunkMetadata>>[],
                relations: ['document'],
                select: {
                    document: {
                        id: true,
                        name: true,
                        sourceType: true,
                        type: true,
                        category: true,
                        fileUrl: true
                    }
                },
                take: 1,
                skip: 0
            })
            if (stored.items.length) {
                const target = stored.items[0] as IKnowledgeDocumentChunk<TDocChunkMetadata>
                return {
                    ...page,
                    items: includesChunk(page.items, targetChunkId) ? page.items : [target, ...page.items]
                }
            }

            const document = await this.documents.findOne(id, {
                relations: ['knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot']
            })
            const vectorStore = await this.knowledgebaseService.getActiveVectorStore(document.knowledgebase, true)
            const vectorResult = await vectorStore.getChunks(id, {
                take: 1,
                skip: 0,
                filter: { chunkId: targetChunkId }
            })
            const items = await this.attachStoredChunkState(
                vectorResult.items as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
            )
            return {
                ...page,
                items: items[0] && !includesChunk(page.items, targetChunkId) ? [items[0], ...page.items] : page.items
            }
        }

        if (!params.search) {
            const chunks = await this.chunkService.findAll({
                where: {
                    ...(params.filter ?? {}),
                    documentId: id
                },
                relations: ['document'],
                select: {
                    document: {
                        id: true,
                        name: true,
                        sourceType: true,
                        type: true,
                        category: true,
                        fileUrl: true
                    }
                },
                order: { createdAt: 'ASC' },
                skip: params.skip,
                take: params.take
            })

            return {
                ...chunks,
                items: sortChunksByDocumentOrder(chunks.items as IKnowledgeDocumentChunk<TDocChunkMetadata>[])
            }
        }
        const document = await this.documents.findOne(id, {
            relations: ['knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot']
        })
        const vectorStore = await this.knowledgebaseService.getActiveVectorStore(document.knowledgebase, true)

        if (document.knowledgebase.structure === KnowledgeStructureEnum.ParentChild && !params.search) {
            const pages = await this.pageRepository.find({
                where: { tenantId: document.tenantId, documentId: document.id },
                take: params.take,
                skip: params.skip,
                order: { createdAt: 'DESC' }
            })
            const pageTotal = await this.pageRepository.count({
                where: { tenantId: document.tenantId, documentId: document.id }
            })
            return {
                items: pages,
                total: pageTotal
            }
        } else {
            let sourceChunkIds: string[] | undefined
            if (vectorStore.vectorStoreType === VectorTypeEnum.MILVUS) {
                const { items: sources } = await this.chunkService.findAll({
                    where: { documentId: id },
                    select: { id: true }
                })
                sourceChunkIds = sources.map((chunk) => chunk.id)
            }
            const result = await vectorStore.getChunks(id, { ...params, sourceChunkIds })
            const items = await this.attachStoredChunkState(
                result.items as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
            )
            const resultWithStoredChunkState = {
                ...result,
                items
            }
            // @todo
            if (document.knowledgebase.structure === KnowledgeStructureEnum.ParentChild) {
                const ids = uniq(compact(items.map((item) => item.metadata?.pageId).filter(Boolean) as string[]))
                if (ids.length) {
                    const pages = await this.pageRepository.find({
                        where: {
                            tenantId: document.tenantId,
                            documentId: document.id,
                            id: In(ids)
                        },
                        take: params.take,
                        skip: params.skip,
                        order: { createdAt: 'DESC' }
                    })
                    return {
                        items: mergeParentChildChunks(pages, items as Document<ChunkMetadata>[])
                    }
                }
            }

            return resultWithStoredChunkState
        }
    }

    private async attachStoredChunkState(chunks: IKnowledgeDocumentChunk<TDocChunkMetadata>[]) {
        const ids = uniq(compact(chunks.map((chunk) => getChunkLogicalId(chunk))))
        if (!ids.length) {
            return chunks
        }

        const { items } = await this.chunkService.findAll({
            where: { id: In(ids) },
            select: {
                id: true,
                version: true,
                contentHash: true
            }
        })
        const storedById = new Map(items.map((chunk) => [chunk.id, chunk]))

        return chunks.map((chunk) => {
            const storedId = getChunkLogicalId(chunk)
            const stored = storedId ? storedById.get(storedId) : null
            if (!stored) {
                return chunk
            }

            return {
                ...chunk,
                id: stored.id,
                version: stored.version,
                contentHash: stored.contentHash
            }
        })
    }

    /**
     * Create a chunk in document.
     *
     * @param id Document ID
     * @param entity Chunk entity
     */
    async createChunk(id: string, entity: IKnowledgeDocumentChunk) {
        const { vectorStore, document } = await this.documents.getDocumentVectorStore(id)
        const metadata = {
            ...(entity.metadata ?? {})
        } as TDocChunkMetadata
        delete metadata.questionGeneration
        delete metadata.questionGenerationId
        delete metadata.questionSourceChunkId
        delete metadata.generatedQuestionId
        protectTableChunkMetadata(metadata)
        validateMetadataAgainstSchema(metadata, document.knowledgebase?.metadataSchema, 'chunk')
        const contentHash = computeKnowledgeDocumentChunkHash({
            pageContent: entity.pageContent,
            metadata
        } as IKnowledgeDocumentChunk<TDocChunkMetadata>)
        const chunk = await this.chunkService.create({
            pageContent: entity.pageContent,
            documentId: id,
            knowledgebaseId: document.knowledgebaseId,
            metadata,
            contentHash
        })
        await vectorStore.addKnowledgeDocument(document, [chunk])
        await this.refreshDocumentContentHash(id)
        await this.publishChunkMutation(document)
        return chunk
    }

    /**
     * Update a chunk in document.
     *
     * @param documentId Document ID
     * @param id Chunk ID
     * @param entity Chunk entity
     * @returns
     */
    async updateChunk(documentId: string, id: string, entity: IKnowledgeDocumentChunk) {
        try {
            const { vectorStore, document } = await this.documents.getDocumentVectorStore(documentId)
            const current = await this.assertChunkBelongsToDocument(documentId, id)
            const chunk = await this.mergeChunkUpdate(id, entity, current)
            validateMetadataAgainstSchema(chunk.metadata, document.knowledgebase?.metadataSchema, 'chunk')
            const result = await this.chunkService.updateChunk(id, chunk)
            if (requiresChunkReembedding(entity)) {
                if (questionSourceHash(current) !== questionSourceHash(chunk)) {
                    await vectorStore.deleteChunks(questionVectorIds([current]))
                }
                await vectorStore.updateChunk(
                    id,
                    {
                        metadata: chunk.metadata,
                        pageContent: chunk.pageContent
                    },
                    document
                )
            } else {
                await vectorStore.partialUpdateFilterAttributes(document, [chunk])
            }
            await this.refreshDocumentContentHash(documentId)
            await this.publishChunkMutation(document)
            return result
        } catch (err) {
            throw new BadRequestException(err.message)
        }
    }

    async updateChunkWithVersion(documentId: string, id: string, entity: IKnowledgeDocumentChunk) {
        const expectedVersion = entity.version
        assertExpectedVersion(expectedVersion)
        const { vectorStore, document } = await this.documents.getDocumentVectorStore(documentId)
        const current = await this.assertChunkBelongsToDocument(documentId, id)
        const chunk = await this.mergeChunkUpdate(id, entity, current)
        validateMetadataAgainstSchema(chunk.metadata, document.knowledgebase?.metadataSchema, 'chunk')
        const result = await this.chunkService.updateWithVersion(id, chunk, expectedVersion)
        if (requiresChunkReembedding(entity)) {
            if (questionSourceHash(current) !== questionSourceHash(chunk)) {
                await vectorStore.deleteChunks(questionVectorIds([current]))
            }
            await vectorStore.updateChunk(
                id,
                {
                    metadata: chunk.metadata,
                    pageContent: chunk.pageContent
                },
                document
            )
        } else {
            await vectorStore.partialUpdateFilterAttributes(document, [chunk])
        }
        await this.refreshDocumentContentHash(documentId)
        await this.publishChunkMutation(document)
        return result
    }

    /**
     * Delete chunk by id in document.
     *
     * @param documentId Document ID
     * @param id Chunk ID
     * @returns
     */
    async deleteChunk(documentId: string, id: string) {
        const { vectorStore, document } = await this.documents.getDocumentVectorStore(documentId)
        const current = await this.assertChunkBelongsToDocument(documentId, id)
        // Delete entity
        await this.chunkService.delete(id)
        // Delete vector
        await vectorStore.deleteChunks(questionVectorIds([current]))
        await vectorStore.deleteChunk(id)
        await this.refreshDocumentContentHash(documentId)
        await this.publishChunkMutation(document)
    }

    async deleteChunkWithVersion(documentId: string, id: string, expectedVersion?: number) {
        assertExpectedVersion(expectedVersion)
        const { vectorStore, document } = await this.documents.getDocumentVectorStore(documentId)
        const current = await this.assertChunkBelongsToDocument(documentId, id)
        await this.chunkService.deleteWithVersion(id, expectedVersion)
        await vectorStore.deleteChunks(questionVectorIds([current]))
        await vectorStore.deleteChunk(id)
        await this.refreshDocumentContentHash(documentId)
        await this.publishChunkMutation(document)
    }

    private async assertChunkBelongsToDocument(documentId: string, id: string) {
        const chunk = await this.chunkService.findOne(id)
        if (chunk.documentId !== documentId) {
            throw new NotFoundException(`Knowledge document chunk '${id}' was not found in document '${documentId}'`)
        }
        return chunk
    }

    private async mergeChunkUpdate(
        id: string,
        entity: Partial<IKnowledgeDocumentChunk>,
        current?: IKnowledgeDocumentChunk
    ) {
        const stored = current ?? (await this.chunkService.findOne(id))
        const metadata = {
            ...(stored.metadata ?? {}),
            ...(entity.metadata ?? {})
        } as TDocChunkMetadata
        metadata.questionGeneration = stored.metadata?.questionGeneration
        delete metadata.questionGenerationId
        delete metadata.questionSourceChunkId
        delete metadata.generatedQuestionId
        const pageContent = entity.pageContent ?? stored.pageContent
        protectTableChunkMetadata(metadata, stored.metadata, pageContent !== stored.pageContent)
        const merged = {
            ...stored,
            id,
            pageContent,
            metadata
        } as IKnowledgeDocumentChunk<TDocChunkMetadata>
        merged.contentHash = computeKnowledgeDocumentChunkHash(merged)
        return merged
    }

    private async refreshDocumentContentHash(documentId: string) {
        const { items } = await this.chunkService.findAll({
            where: { documentId },
            order: { createdAt: 'ASC' }
        })
        const chunks = items.map((chunk) => ({
            ...chunk,
            contentHash: chunk.contentHash ?? computeKnowledgeDocumentChunkHash(chunk)
        }))
        await writeKnowledgeDocumentPublication(
            this.documents as unknown as KnowledgeDocumentPublicationWriter,
            documentId,
            {
                contentHash: computeKnowledgeDocumentContentHash(chunks),
                chunkNum: chunks.length
            },
            true
        )
    }

    private publishChunkMutation(document: KnowledgeDocument) {
        return this.derivedIndexPublicationService.publish({
            knowledgebase: document.knowledgebase,
            documentId: document.id,
            userId: RequestContext.currentUserId(),
            contentChanged: true
        })
    }

    async findAllEmbeddingNodes(document: IKnowledgeDocument) {
        return this.chunkService.findAllEmbeddingNodes(document.chunks)
    }

    async updateChunkMetadataBulk(chunks: Pick<IKnowledgeDocumentChunk, 'id' | 'metadata'>[]) {
        const ids = chunks.map((chunk) => chunk.id).filter((id): id is string => !!id)
        if (!ids.length) return []
        const { items: currentChunks } = await this.chunkService.findAll({ where: { id: In(ids) } })
        const currentById = new Map(currentChunks.map((chunk) => [chunk.id, chunk]))
        const documentIds = uniq(
            currentChunks.map((chunk) => chunk.documentId).filter((documentId): documentId is string => !!documentId)
        )
        const { items: documents } = await this.documents.findAll({
            where: { id: In(documentIds) },
            relations: ['knowledgebase']
        })
        const documentById = new Map(documents.map((document) => [document.id, document]))
        const merged = chunks.map((chunk) => {
            const current = currentById.get(chunk.id)
            if (!current) throw new NotFoundException(`Knowledge chunk '${chunk.id}' was not found.`)
            const metadata = { ...(current.metadata ?? {}), ...(chunk.metadata ?? {}) } as TDocChunkMetadata
            metadata.questionGeneration = current.metadata?.questionGeneration
            delete metadata.questionGenerationId
            delete metadata.questionSourceChunkId
            delete metadata.generatedQuestionId
            const document = documentById.get(current.documentId)
            validateMetadataAgainstSchema(metadata, document?.knowledgebase?.metadataSchema, 'chunk')
            return { ...current, metadata }
        })
        const result = await this.chunkService.updateMetadataBulk(merged)
        for (const document of documents) {
            if ((document.knowledgebase?.vectorStore ?? environment.vectorStore) !== VectorTypeEnum.MILVUS) continue
            const documentChunks = merged.filter((chunk) => chunk.documentId === document.id)
            if (!documentChunks.length) continue
            const vectorStore = await this.knowledgebaseService.getActiveVectorStore(document.knowledgebaseId, true)
            await vectorStore.partialUpdateFilterAttributes(document, documentChunks)
        }
        return result
    }
}
