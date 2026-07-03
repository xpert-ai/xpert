import { Document } from '@langchain/core/documents'
import { EmbeddingsInterface } from '@langchain/core/embeddings'
import { VectorStore } from '@langchain/core/vectorstores'
import { AiProviderRole, ICopilot, TCopilotModel } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CopilotOneByRoleQuery } from '../copilot'
import { CopilotModelGetEmbeddingsQuery } from '../copilot-model'
import { createEmbeddingFingerprint } from '../knowledgebase/embedding-state'
import { RagCreateVStoreCommand } from '../rag-vstore'
import { FileAsset, FileChunk, FileEmbedding } from './entities'

type FileVectorCollectionScope = {
    type: 'xpert' | 'project' | 'tenant'
    id: string
}

type FileVectorTarget = {
    collectionName: string
    collectionScope: FileVectorCollectionScope
    fingerprint: string
    dimensions: number | null
    provider: string | null
    model: string | null
    embeddings: EmbeddingsInterface
}

type StoredFileEmbeddingMetadata = {
    collectionName?: string
    collectionScope?: FileVectorCollectionScope
}

@Injectable()
export class FileUnderstandingVectorService {
    readonly #logger = new Logger(FileUnderstandingVectorService.name)

    constructor(
        @InjectRepository(FileEmbedding)
        private readonly fileEmbeddingRepository: Repository<FileEmbedding>,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    async indexChunks(asset: FileAsset, chunks: FileChunk[]) {
        this.#logger.debug(
            `[FILE_VECTOR_DEBUG][index:called] fileAssetId=${asset.id} chunks=${chunks.length} tenantId=${asset.tenantId ?? 'unknown'} organizationId=${asset.organizationId ?? 'unknown'} xpertId=${asset.xpertId ?? 'none'} projectId=${asset.projectId ?? 'none'}`
        )
        if (!chunks.length) {
            this.#logger.debug(`[FILE_VECTOR_DEBUG][index:skip] fileAssetId=${asset.id} reason=no-chunks`)
            return []
        }

        const target = await this.resolveVectorTarget(asset).catch((error) => {
            this.#logger.warn(
                `[FILE_VECTOR_DEBUG][index:skip] fileAssetId=${asset.id} reason=resolve-vector-target-error error=${getErrorMessage(error)}`
            )
            return null
        })
        if (!target) {
            this.#logger.debug(`[FILE_VECTOR_DEBUG][index:skip] fileAssetId=${asset.id} reason=no-vector-target`)
            return []
        }

        try {
            const vectorStore = await this.createVectorStore(target.collectionName, target.embeddings)
            const ids = chunks.map((chunk) => chunk.id)
            this.#logger.debug(
                `[FILE_VECTOR_DEBUG][index:start] fileAssetId=${asset.id} collectionName=${target.collectionName} scope=${target.collectionScope.type}:${target.collectionScope.id} chunks=${chunks.length} vectorIds=${ids.join(',')} provider=${target.provider ?? 'unknown'} model=${target.model ?? 'unknown'} fingerprint=${target.fingerprint} dimensions=${target.dimensions ?? 'unknown'}`
            )
            await vectorStore.addDocuments(
                chunks.map(
                    (chunk) =>
                        new Document({
                            pageContent: chunk.content,
                            metadata: compactRecord({
                                tenantId: chunk.tenantId,
                                organizationId: chunk.organizationId,
                                fileAssetId: asset.id,
                                xpertId: asset.xpertId,
                                projectId: asset.projectId,
                                artifactId: chunk.artifactId,
                                chunkId: chunk.id,
                                orderNo: chunk.orderNo,
                                anchor: chunk.anchor,
                                enabled: true
                            })
                        })
                ),
                { ids }
            )
            this.#logger.debug(
                `[FILE_VECTOR_DEBUG][index:done] fileAssetId=${asset.id} collectionName=${target.collectionName} chunks=${chunks.length}`
            )

            const embeddedAt = new Date().toISOString()
            return await this.fileEmbeddingRepository.save(
                chunks.map((chunk) =>
                    this.fileEmbeddingRepository.create({
                        tenantId: chunk.tenantId,
                        organizationId: chunk.organizationId,
                        fileAssetId: asset.id,
                        chunkId: chunk.id,
                        provider: target.provider,
                        model: target.model,
                        vectorId: chunk.id,
                        metadata: {
                            collectionName: target.collectionName,
                            collectionScope: target.collectionScope,
                            fingerprint: target.fingerprint,
                            dimensions: target.dimensions,
                            fileAssetId: asset.id,
                            orderNo: chunk.orderNo,
                            anchor: chunk.anchor,
                            embeddedAt
                        }
                    })
                )
            )
        } catch (error) {
            this.#logger.warn(`Failed to index file vectors for ${asset.id}: ${getErrorMessage(error)}`)
            return []
        }
    }

    async searchChunkIds(asset: FileAsset, query: string, limit: number) {
        this.#logger.debug(
            `[FILE_VECTOR_DEBUG][search:called] fileAssetId=${asset.id} tenantId=${asset.tenantId ?? 'unknown'} organizationId=${asset.organizationId ?? 'unknown'} xpertId=${asset.xpertId ?? 'none'} projectId=${asset.projectId ?? 'none'} query="${query}" limit=${limit}`
        )
        const target = await this.resolveVectorTarget(asset).catch((error) => {
            this.#logger.warn(
                `[FILE_VECTOR_DEBUG][search:skip] fileAssetId=${asset.id} reason=resolve-vector-target-error error=${getErrorMessage(error)}`
            )
            return null
        })
        if (!target) {
            this.#logger.debug(`[FILE_VECTOR_DEBUG][search:skip] fileAssetId=${asset.id} reason=no-vector-target`)
            return []
        }

        const embeddings = await this.fileEmbeddingRepository.find({
            where: { fileAssetId: asset.id },
            select: {
                chunkId: true,
                vectorId: true,
                metadata: true
            }
        })
        const indexedChunkIds = new Set(
            embeddings
                .filter((embedding) => readCollectionName(embedding.metadata) === target.collectionName)
                .map((embedding) => embedding.chunkId)
                .filter(Boolean)
        )
        this.#logger.debug(
            `[FILE_VECTOR_DEBUG][search:prepared] fileAssetId=${asset.id} collectionName=${target.collectionName} indexedChunks=${indexedChunkIds.size} query="${query}" limit=${limit}`
        )
        if (!indexedChunkIds.size) {
            this.#logger.debug(
                `[FILE_VECTOR_DEBUG][search:skip] fileAssetId=${asset.id} collectionName=${target.collectionName} reason=no-indexed-chunks-for-collection`
            )
            return []
        }

        try {
            const vectorStore = await this.createVectorStore(target.collectionName, target.embeddings)
            const filter = compactRecord({
                tenantId: asset.tenantId,
                organizationId: asset.organizationId,
                fileAssetId: asset.id,
                enabled: true
            })
            this.#logger.debug(
                `[FILE_VECTOR_DEBUG][search:vector:start] fileAssetId=${asset.id} collectionName=${target.collectionName} filter=${JSON.stringify(filter)}`
            )
            const results = await vectorStore.similaritySearchWithScore(query, limit, filter)
            const chunkIds = uniqueStrings(
                results
                    .map(([doc]) => readString(doc.metadata?.chunkId))
                    .filter((chunkId): chunkId is string => !!chunkId && indexedChunkIds.has(chunkId))
            )
            this.#logger.debug(
                `[FILE_VECTOR_DEBUG][search:vector:done] fileAssetId=${asset.id} collectionName=${target.collectionName} rawResults=${results.length} matchedChunkIds=${chunkIds.length} chunkIds=${chunkIds.join(',')}`
            )
            return chunkIds
        } catch (error) {
            this.#logger.warn(`Failed to search file vectors for ${asset.id}: ${getErrorMessage(error)}`)
            return []
        }
    }

    async deleteFileVectors(fileAssetId: string, asset?: FileAsset | null) {
        const embeddings = await this.fileEmbeddingRepository.find({
            where: { fileAssetId },
            select: {
                vectorId: true,
                metadata: true
            }
        })
        if (!embeddings.length) {
            return
        }

        const vectorIdsByCollection = new Map<string, string[]>()
        for (const embedding of embeddings) {
            const collectionName = readCollectionName(embedding.metadata)
            if (!collectionName || !embedding.vectorId) {
                continue
            }
            const ids = vectorIdsByCollection.get(collectionName) ?? []
            ids.push(embedding.vectorId)
            vectorIdsByCollection.set(collectionName, ids)
        }

        await Promise.all(
            Array.from(vectorIdsByCollection.entries()).map(async ([collectionName, ids]) => {
                try {
                    const embeddingsModel = asset ? await this.resolveEmbeddings(asset).catch(() => null) : null
                    const vectorStore = await this.createVectorStore(
                        collectionName,
                        embeddingsModel?.embeddings ?? null
                    )
                    await vectorStore.delete({ ids: uniqueStrings(ids) })
                } catch (error) {
                    this.#logger.warn(
                        `Failed to delete file vectors for ${fileAssetId} in ${collectionName}: ${getErrorMessage(error)}`
                    )
                }
            })
        )
    }

    private async resolveVectorTarget(asset: FileAsset): Promise<FileVectorTarget | null> {
        const embeddings = await this.resolveEmbeddings(asset)
        if (!embeddings?.copilotModel || !embeddings.embeddings) {
            return null
        }

        const dimensions = await this.resolveEmbeddingDimensions(embeddings.embeddings, embeddings.copilotModel)
        const provider = getEmbeddingProviderName(embeddings.copilotModel)
        const model = getEmbeddingModelName(embeddings.copilotModel)
        const fingerprint = createEmbeddingFingerprint({
            provider,
            model,
            dimensions,
            options: embeddings.copilotModel.options ?? null,
            providerConfig: {
                providerId: embeddings.copilot?.modelProvider?.id ?? null,
                providerName: embeddings.copilot?.modelProvider?.providerName ?? null,
                providerType: embeddings.copilot?.modelProvider?.providerType ?? null,
                options: embeddings.copilot?.modelProvider?.options ?? null
            }
        })
        const collectionScope = resolveCollectionScope(asset)
        return {
            collectionName: createFileVectorCollectionName(collectionScope, fingerprint),
            collectionScope,
            fingerprint,
            dimensions,
            provider,
            model,
            embeddings: embeddings.embeddings
        }
    }

    private async resolveEmbeddings(asset: FileAsset) {
        if (!asset.tenantId) {
            return null
        }
        const copilot = await this.queryBus.execute<CopilotOneByRoleQuery, ICopilot | null>(
            new CopilotOneByRoleQuery(asset.tenantId, asset.organizationId, AiProviderRole.Embedding, [
                'copilotModel',
                'modelProvider'
            ])
        )
        if (!copilot?.enabled || !copilot.copilotModel || !copilot.modelProvider) {
            return null
        }

        const embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, EmbeddingsInterface>(
            new CopilotModelGetEmbeddingsQuery(copilot, copilot.copilotModel, {
                tokenCallback: () => {
                    //
                }
            })
        )
        const copilotModel = {
            ...copilot.copilotModel,
            copilot
        } as TCopilotModel
        return {
            copilot,
            copilotModel,
            embeddings
        }
    }

    private async resolveEmbeddingDimensions(embeddings: EmbeddingsInterface, copilotModel: TCopilotModel) {
        const configuredDimensions = readConfiguredDimensions(copilotModel)
        if (configuredDimensions) {
            return configuredDimensions
        }
        const probe = await embeddings.embedQuery('xpert file understanding dimension probe')
        return probe.length
    }

    private async createVectorStore(collectionName: string, embeddings: EmbeddingsInterface | null) {
        return await this.commandBus.execute<RagCreateVStoreCommand, VectorStore>(
            new RagCreateVStoreCommand(embeddings as EmbeddingsInterface, { collectionName })
        )
    }
}

function resolveCollectionScope(asset: FileAsset): FileVectorCollectionScope {
    if (asset.xpertId) {
        return { type: 'xpert', id: asset.xpertId }
    }
    if (asset.projectId) {
        return { type: 'project', id: asset.projectId }
    }
    return { type: 'tenant', id: asset.tenantId ?? 'unknown' }
}

function createFileVectorCollectionName(scope: FileVectorCollectionScope, fingerprint: string) {
    return `file-understanding:${scope.type}:${scope.id}:${fingerprint}`
}

function getEmbeddingModelName(copilotModel: TCopilotModel | null | undefined) {
    return copilotModel?.model || copilotModel?.copilot?.copilotModel?.model || null
}

function getEmbeddingProviderName(copilotModel: TCopilotModel | null | undefined) {
    return (
        copilotModel?.copilot?.modelProvider?.providerName ?? copilotModel?.copilot?.modelProvider?.providerType ?? null
    )
}

function readConfiguredDimensions(copilotModel: TCopilotModel) {
    const dimensions = copilotModel.options?.dimensions
    if (typeof dimensions === 'number') {
        return dimensions
    }
    const dimension = copilotModel.options?.dimension
    return typeof dimension === 'number' ? dimension : null
}

function readCollectionName(metadata?: Record<string, unknown>) {
    return readString((metadata as StoredFileEmbeddingMetadata | undefined)?.collectionName)
}

function readString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values))
}

function compactRecord(input: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null))
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}
