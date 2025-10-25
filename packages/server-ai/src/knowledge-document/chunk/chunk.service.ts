import { IKnowledgeDocumentChunk } from '@metad/contracts'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { KnowledgeDocumentChunk } from './chunk.entity'
import { TDocChunkMetadata } from '../types'

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

    /**
     * Create or update chunks in batches.
     * 
     * @param chunks 
     * @returns 
     */
    async upsertBulk(chunks: IKnowledgeDocumentChunk[]) {
        const entities: KnowledgeDocumentChunk[] = []
        const chunkMap = new Map<string, IKnowledgeDocumentChunk>()
        chunks.forEach(chunk => {
            if (chunk.metadata.chunkId) {
                chunkMap.set(chunk.metadata.chunkId, chunk)
            }
        })

        // Helper to ensure parent is created first
        const getOrCreateParent = async (chunk: IKnowledgeDocumentChunk): Promise<IKnowledgeDocumentChunk | null> => {
            if (chunk.metadata.parentId) {
                const parentChunk = chunkMap.get(chunk.metadata.parentId)
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
                            id: true,
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
        chunks.forEach(chunk => {
            const isLeaf = !chunks.some(c => c.parent && c.parent.id === chunk.id)
            if (isLeaf) {
                leaves.push(chunk)
            }
        })
        return leaves as IKnowledgeDocumentChunk<TDocChunkMetadata>[]
    }
}
