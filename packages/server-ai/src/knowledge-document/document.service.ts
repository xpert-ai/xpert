import { IDocChunkMetadata, IKnowledgeDocument, IKnowledgeDocumentChunk, IKnowledgeDocumentPage, KBDocumentStatusEnum, KDocumentSourceType, KnowledgeStructureEnum } from '@metad/contracts'
import { RequestContext, StorageFileService, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { BadRequestException, forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { InjectQueue } from '@nestjs/bull'
import { ChunkMetadata, countTokensSafe, DocumentSourceRegistry, mergeParentChildChunks, TextSplitterRegistry } from '@xpert-ai/plugin-sdk'
import { Queue } from 'bull'
import { Document } from 'langchain/document'
import { compact, uniq } from 'lodash-es'
import { DataSource, DeepPartial, In, Repository } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import { KnowledgebaseService, KnowledgeDocumentStore, TVectorSearchParams } from '../knowledgebase'
import { KnowledgeDocument } from './document.entity'
import { LoadStorageFileCommand } from '../shared'
import { KnowledgeDocumentPage } from '../core/entities/internal'
import { KnowledgeDocumentChunkService } from './chunk/chunk.service'


@Injectable()
export class KnowledgeDocumentService extends TenantOrganizationAwareCrudService<KnowledgeDocument> {
	readonly #logger = new Logger(KnowledgeDocumentService.name)

	@InjectRepository(KnowledgeDocumentPage)
	private readonly pageRepository: Repository<KnowledgeDocumentPage>

	@Inject(DocumentSourceRegistry)
	private readonly docSourceRegistry: DocumentSourceRegistry;

	@Inject(TextSplitterRegistry)
	private readonly textSplitterRegistry: TextSplitterRegistry

	@Inject(KnowledgeDocumentChunkService)
	private readonly chunkService: KnowledgeDocumentChunkService

	constructor(
		@InjectRepository(KnowledgeDocument)
		readonly repo: Repository<KnowledgeDocument>,

		private readonly dataSource: DataSource,

		private readonly storageFileService: StorageFileService,

		@Inject(forwardRef(() => KnowledgebaseService))
		private readonly knowledgebaseService: KnowledgebaseService,
		
		private readonly commandBus: CommandBus,
		@InjectQueue('embedding-document') private docQueue: Queue
	) {
		super(repo)
	}

	async findAncestors(id: string) {
		const treeRepo = this.dataSource.getTreeRepository(KnowledgeDocument)
		const entity = await treeRepo.findOneBy({ id })
		const parents = await treeRepo.findAncestors(entity, {depth: 5})
		return parents
	}

	/**
	 */
	async createDocument(document: Partial<IKnowledgeDocument>): Promise<KnowledgeDocument> {
		// Complete file type
		if (!document.type) {
			if (document.storageFileId) {
				const storageFile = await this.storageFileService.findOne(document.storageFileId)
				const fileType = storageFile.originalName.split('.').pop()
				document.type = fileType
			} else if (document.options?.url) {
				document.type = 'html'
			}
		}
		
		const doc = await this.create({
			...document,
		})
		// Init folder path for document entity
		const parents = await this.findAncestors(doc.id)
		const folder = parents.map((i) => i.sourceType === KDocumentSourceType.FOLDER ? i.name : i.id).join('/')
		doc.folder = folder
		await this.repository.save(doc)
		
		return doc
	}

	/**
	 * Create documents in bulk.
	 * 
	 * @param documents 
	 * @returns 
	 */
	async createBulk(documents: Partial<IKnowledgeDocument>[]): Promise<KnowledgeDocument[]> {
		if (!documents?.length) {
			return []
		}

		// Update chunkStructure
		const textSplitterType = documents[0].parserConfig?.textSplitterType
		if (textSplitterType) {
			const textSplitterStrategy = this.textSplitterRegistry.get(textSplitterType)
			if (textSplitterStrategy) {
				const structure = textSplitterStrategy.structure
				const knowledgebase = await this.knowledgebaseService.findOneByIdString(documents[0].knowledgebaseId)
				if (knowledgebase.structure && knowledgebase.structure !== structure) {
					throw new BadRequestException(`Inconsistent chunk structure between knowledgebase (${knowledgebase.structure}) and document (${structure})`)
				}
				if (!knowledgebase.structure) {
					await this.knowledgebaseService.update(knowledgebase.id, { structure })
				}
			}
		}

		return await Promise.all(documents.map((document) => this.createDocument(document)))
	}

	async updateBulk(entities: Partial<IKnowledgeDocument>[]): Promise<void> {
		if (!entities?.length) {
			return
		}
		await Promise.all(entities.map((entity) => this.update(entity.id, entity)))
	}

	async deleteBulk(ids: string[]): Promise<void> {
		await this.repository.delete(ids)
	}

	async save(document: DeepPartial<KnowledgeDocument>)
	async save(document: DeepPartial<KnowledgeDocument>[])
	async save(document) {
		return await this.repository.save(document)
	}

	/**
	 * @deprecated use Chunks
	 */
	async createPageBulk(documentId: string, pages: Partial<IKnowledgeDocumentPage<ChunkMetadata>>[]) {
		return await this.pageRepository.save(pages.map((page) => ({ ...page, documentId })))
	}

	/**
	 * @deprecated use Chunks
	 */
	async deletePage(documentId: string, id: string) {
		const document = await this.findOne(documentId, {
			relations: ['pages', 'knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot']
		})
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase)
		await vectorStore.delete({ filter: { docPageId: id, knowledgeId: documentId } })

		document.pages = document.pages.filter((_) => _.id !== id)
		await this.save(document)
	}

	/**
	 * Find all chunks of a document, filter by metadata
	 * 
	 * @param id Document ID
	 * @param params Vector Search Params
	 * @returns 
	 */
	async getChunks(id: string, params: TVectorSearchParams) {
		if (!params.search) {
			const chunks = await this.chunkService.findAll({
				where: {
					...(params.filter ?? {}),
					documentId: id,
				},
				relations: ['document'],
				select: {
					document: {
						id: true,
						name: true,
						sourceType: true,
						type: true,
						category: true,
						fileUrl: true,
					}
				},
				skip: params.skip,
				take: params.take,
			})

			return chunks
		}
		const document = await this.findOne(id, {
			relations: ['knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot']
		})
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase, true)
		
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
			const result = await vectorStore.getChunks(id, params)
			// @todo
			if (document.knowledgebase.structure === KnowledgeStructureEnum.ParentChild) {
				const ids = uniq(compact(result.items.map((item) => item.metadata?.pageId).filter(Boolean) as string[]))
				if (ids.length) {
					const pages = await this.pageRepository.find({
						where: {
							tenantId: document.tenantId,
							documentId: document.id,
							id: In(ids) 
						},
						take: params.take,
						skip: params.skip,
						order: { createdAt: 'DESC' },
					})
					return {
						items: mergeParentChildChunks(pages, result.items as Document<ChunkMetadata>[]),
					}
				}
			}

			return result
		}
	}

	/**
	 * Create a chunk in document.
	 * 
	 * @param id Document ID
	 * @param entity Chunk entity
	 */
	async createChunk(id: string, entity: IKnowledgeDocumentChunk) {
		const { vectorStore, document } = await this.getDocumentVectorStore(id)
		const chunk = await this.chunkService.create({
			...entity,
			documentId: id,
			knowledgebaseId: document.knowledgebaseId,
			metadata: {
				...(entity.metadata ?? {}),
				chunkId: entity.metadata?.chunkId || uuidv4() // Ensure chunkId exists
			}
		})
		await vectorStore.addKnowledgeDocument(document, [chunk])
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
			const { vectorStore, document } = await this.getDocumentVectorStore(documentId)
			await this.chunkService.update(id, entity)
			return await vectorStore.updateChunk(id, {
				metadata: entity.metadata,
				pageContent: entity.pageContent
			}, document)
		} catch (err) {
			throw new BadRequestException(err.message)
		}
	}

	/**
	 * Delete chunk by id in document.
	 * 
	 * @param documentId Document ID
	 * @param id Chunk ID
	 * @returns 
	 */
	async deleteChunk(documentId: string, id: string) {
		const { vectorStore, document } = await this.getDocumentVectorStore(documentId)
		// Delete entity
		await this.chunkService.delete(id)
		// Delete vector
		await vectorStore.deleteChunk(id)
	}

	/**
	 * Cover chunks of a document. record tokens of each chunk.
	 */
	async coverChunks(document: IKnowledgeDocument, vectorStore: KnowledgeDocumentStore) {
		await this.chunkService.deleteByDocumentId(document.id)
		return await this.chunkService.upsertBulk(document.chunks.map((_) => {
			return {
				..._,
				metadata: {
					..._.metadata,
					tokens: countTokensSafe(_.pageContent)
				},
				documentId: document.id,
				knowledgebaseId: document.knowledgebaseId
			} as IKnowledgeDocumentChunk
		}))
	}

	async findAllEmbeddingNodes(document: IKnowledgeDocument) {
		return this.chunkService.findAllEmbeddingNodes(document.chunks)
	}

	async getDocumentVectorStore(id: string) {
		const document = await this.findOne(id, {
			relations: ['knowledgebase', 'knowledgebase.copilotModel', 'knowledgebase.copilotModel.copilot']
		})
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase)
		return { document, vectorStore }
	}

	async previewFile(id: string) {
		try {
			const docs = await this.commandBus.execute<LoadStorageFileCommand, Document[]>(
				new LoadStorageFileCommand(id)
			)
			// Limit the size of the data returned for preview
			return docs.map((doc) => ({
				...doc,
				pageContent: doc.pageContent.length > 10000 ? doc.pageContent.slice(0, 10000) + ' ...' : doc.pageContent
			}))
		} catch (err) {
			throw new BadRequestException(err.message)
		}
	}

	/**
	 * Start processing documents which is not in RUNNING status
	 */
	async startProcessing(ids: string[], kbId?: string) {
		const userId = RequestContext.currentUserId()
		const where = kbId ? { knowledgebaseId: kbId, id: In(ids) } : {id: In(ids)}
		const { items } = await this.findAll({
			where
		})

		const docs = items.filter((doc) => doc.status !== KBDocumentStatusEnum.RUNNING)

		const job = await this.docQueue.add({
			userId,
			docs
		})

		docs.forEach((item) => {
			item.jobId = job.id as string
			item.status = KBDocumentStatusEnum.RUNNING
			item.processMsg = ''
			item.progress = 0
		})

		return await this.save(docs)
	}

	async delete(id: string) {
		const document = await this.findOne(id, {
			relations: ['knowledgebase', 'knowledgebase.documents'],
			select: {
				knowledgebase: { id: true, documentNum: true, documents: { id: true, sourceType: true } }
			}
		})
		const vectorStore = await this.knowledgebaseService.getVectorStore(document.knowledgebase, false)
		await vectorStore.deleteKnowledgeDocument(document)

		document.knowledgebase.documentNum = document.knowledgebase.documents.filter((doc) => doc.sourceType !== KDocumentSourceType.FOLDER).length - 1
		await this.knowledgebaseService.update(document.knowledgebaseId, {
			documentNum: document.knowledgebase.documentNum
		})

		const result = await super.delete(id)
		return result
	}

	// Document source connection
	async connectDocumentSource(type: string, config: any) {
		const documentSource = this.docSourceRegistry.get(type)
		if (!documentSource) {
			throw new BadRequestException(`Document source '${type}' not found`)
		}

		try {
			const docs = await documentSource.test(config)
			
			return docs
		} catch (err) {
			this.#logger.error(`Failed to connect document source '${type}'`, err)
			throw new BadRequestException(`Failed to connect document source '${type}': ${err.message}`)
		}
	}
}
