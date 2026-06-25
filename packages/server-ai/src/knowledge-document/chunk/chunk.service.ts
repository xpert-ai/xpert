import { IKnowledgeDocumentChunk } from '@xpert-ai/contracts'
import { RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { KnowledgeDocumentChunk } from './chunk.entity'
import { TDocChunkMetadata } from '../types'

function assertExpectedVersion(version: number | null | undefined) {
    if (!Number.isInteger(version) || version <= 0) {
        throw new BadRequestException('version is required')
    }
}

@Injectable()
export class KnowledgeDocumentChunkService extends TenantOrganizationAwareCrudService<KnowledgeDocumentChunk> {
    readonly #logger = new Logger(KnowledgeDocumentChunkService.name)

    @Inject(DataSource)
    private readonly dataSource: DataSource

    constructor(
        @InjectRepository(KnowledgeDocumentChunk)
        repo: Repository<KnowledgeDocumentChunk>
    ) {
        super(repo)
    }

    async findAncestors(id: string) {
        const treeRepo = this.dataSource.getTreeRepository(KnowledgeDocumentChunk)
        const entity = await treeRepo.findOneBy({ id })
        const parents = await treeRepo.findAncestors(entity, { depth: 5 })
        return parents
    }

    async deleteByDocumentId(documentId: string) {
        return super.delete({ documentId })
    }

    async updateWithVersion(id: string, entity: Partial<IKnowledgeDocumentChunk>, expectedVersion: number) {
        assertExpectedVersion(expectedVersion)
        const changes = { ...entity }
        delete changes.version
        const patch = {
            ...changes,
            id,
            updatedById: RequestContext.currentUserId()
        } as QueryDeepPartialEntity<KnowledgeDocumentChunk>
        const result = await this.repository.update({ id, version: expectedVersion }, patch)
        if (!result.affected) {
            throw new ConflictException('Knowledge document chunk has been modified. Refresh and try again.')
        }
        return result
    }

    async deleteWithVersion(id: string, expectedVersion: number) {
        assertExpectedVersion(expectedVersion)
        const result = await this.repository.delete({ id, version: expectedVersion })
        if (!result.affected) {
            throw new ConflictException('Knowledge document chunk has been modified. Refresh and try again.')
        }
        return result
    }

    /**
     * Create or update chunks in batches.
     *
     * @param chunks
     * @returns
     */
    async upsertBulk(chunks: IKnowledgeDocumentChunk[]) {
        const entities: KnowledgeDocumentChunk[] = []
        const chunkMap = new Map<string, IKnowledgeDocumentChunk>()
        chunks.forEach((chunk) => {
            if (chunk.metadata.chunkId) {
                chunkMap.set(chunk.metadata.chunkId, chunk)
            }
        })

        // Helper to ensure parent is created first
        const getOrCreateParent = async (chunk: IKnowledgeDocumentChunk): Promise<IKnowledgeDocumentChunk | null> => {
            if (chunk.metadata.parentId) {
                const parentChunk = chunkMap.get(chunk.metadata.parentId)
                if (!parentChunk) return null

                if (parentChunk.id) {
                    return parentChunk
                }

                const parentEntity = await getOrCreateChunk(parentChunk)
                chunkMap.set(chunk.metadata.parentId, parentEntity)
                return parentEntity
            }
            return null
        }

        // Cache created entities to avoid duplicate creation
        const entityCache = new Map<string, KnowledgeDocumentChunk>()

        const getOrCreateChunk = async (chunk: IKnowledgeDocumentChunk): Promise<KnowledgeDocumentChunk> => {
            if (chunk.id && entityCache.has(chunk.id)) {
                return entityCache.get(chunk.id)
            }

            let entity: KnowledgeDocumentChunk
            const parent = await getOrCreateParent(chunk)

            if (chunk.id) {
                await this.update(chunk.id, { ...chunk, parent })
                entity = await this.findOneByOptions({
                    where: { id: chunk.id },
                    relations: ['parent'],
                    select: {
                        parent: {
                            id: true
                        }
                    }
                })
            } else {
                entity = await this.create({ ...chunk, parent })
            }

            if (entity.id) {
                entityCache.set(entity.id, entity)
            }
            return entity
        }

        for (const chunk of chunks) {
            const entity = await getOrCreateChunk(chunk)
            entities.push(entity)
            chunkMap.set(chunk.metadata.chunkId, entity)
        }

        return entities
    }

    findAllLeaves(chunks: IKnowledgeDocumentChunk[]) {
        const leaves: IKnowledgeDocumentChunk[] = []
        chunks.forEach((chunk) => {
            const isLeaf = !chunks.some((c) => c.parent && c.parent.id === chunk.id)
            if (isLeaf) {
                leaves.push(chunk)
            }
        })
        return leaves as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    }

    /**
     * Find all chunks that need embedding.
     *
     * @param chunks Embedding candidate chunks
     */
    findAllEmbeddingNodes(chunks: IKnowledgeDocumentChunk[]) {
        const originalChunks = chunks.filter(
            (chunk) => !chunk.metadata.mediaType || chunk.metadata.mediaType === 'text'
        )
        const mediaChunks = chunks.filter((chunk) => chunk.metadata.mediaType && chunk.metadata.mediaType !== 'text')

        const embeddingChunks: IKnowledgeDocumentChunk[] = []

        // For original text chunks, only keep leaf nodes for embedding
        const textLeaves = this.findAllLeaves(originalChunks)
        embeddingChunks.push(...textLeaves)

        // For media chunks, keep all for embedding
        embeddingChunks.push(...mediaChunks)

        return embeddingChunks
    }
}
