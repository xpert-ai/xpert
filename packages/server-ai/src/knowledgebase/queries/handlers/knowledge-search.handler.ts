import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata, IKnowledgebase, IKnowledgeDocumentChunk, KnowledgebaseTypeEnum } from '@metad/contracts'
import { getPythonErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { Inject, InternalServerErrorException, Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { Document } from '@langchain/core/documents'
import { sortBy } from 'lodash'
import { In, IsNull, Not, Raw, Repository } from 'typeorm'
import { KnowledgeDocumentPage } from '../../../core/entities/internal'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeSearchQuery } from '../knowledge-search.query'
import { KnowledgeRetrievalLogService } from '../../logs'
import { KnowledgeDocumentChunkService } from '../../../knowledge-document/chunk/chunk.service'

@QueryHandler(KnowledgeSearchQuery)
export class KnowledgeSearchQueryHandler implements IQueryHandler<KnowledgeSearchQuery> {
	private readonly logger = new Logger(KnowledgeSearchQueryHandler.name)

	/**
	 * @deprecated use chunks
	 */
	@InjectRepository(KnowledgeDocumentPage)
	private readonly pageRepository: Repository<KnowledgeDocumentPage>

	@Inject(KnowledgeRetrievalLogService)
	private readonly retrievalLogService: KnowledgeRetrievalLogService

	@Inject(KnowledgeDocumentChunkService)
	private readonly chunkService: KnowledgeDocumentChunkService

	constructor(private readonly knowledgebaseService: KnowledgebaseService) {}

	public async execute(command: KnowledgeSearchQuery): Promise<DocumentInterface<DocumentMetadata>[]> {
		const { knowledgebases, query, k, score, filter } = command.input
		const tenantId = command.input.tenantId ?? RequestContext.currentTenantId()
		const organizationId = command.input.organizationId ?? RequestContext.getOrganizationId()
		const topK = k ?? 1000

		const result = await this.knowledgebaseService.findAll({
			where: {
				tenantId,
				organizationId,
				id: knowledgebases ? In(knowledgebases) : Not(IsNull())
			}
		})
		const _knowledgebases = result.items

		const documents: DocumentInterface<DocumentMetadata>[] = []
		const kbs = await Promise.all(
			_knowledgebases.map(async (kb) => {
				let docs = []
				if (kb.type === KnowledgebaseTypeEnum.External) {
					const { chunks } = await this.knowledgebaseService.searchExternalKnowledgebase(
						kb,
						query,
						topK,
						filter
					)
					docs = chunks.map(([doc, score]) => ({ doc, score }))
				} else {
					docs = await this.similaritySearchWithScore(kb, query, k ?? kb.recall?.topK ?? 1000, filter)
				}

				// Log the retrieval results
				try {
					await this.retrievalLogService.create({
						query,
						source: command.input.source,
						knowledgebaseId: kb.id,
						hitCount: docs.length,
						requestId: command.input.id,
					})
				} catch (error) {
					this.logger.error(`Failed to log retrieval results: ${getPythonErrorMessage(error)}`)
				}

				return {
					kb,
					docs
				}
			})
		)

		kbs.forEach(({ kb, docs }) => {
			docs.filter((doc) => doc.metadata.score >= (score ?? kb.recall?.score ?? 0.5)).forEach((item) => {
				documents.push(item)
			})
		})

		return sortBy(documents, 'metadata.score').reverse().slice(0, topK)
	}

	/**
	 * Built-in knowledge base vector search
	 */
	async similaritySearchWithScore(
		kb: IKnowledgebase,
		query: string,
		k: number,
		filter?: Record<string, any>
	): Promise<Document[]> {
		const vectorStore = await this.knowledgebaseService.getVectorStore(kb.id, true)
		this.logger.debug(
			`SimilaritySearch question='${query}' kb='${kb.name}' in ai provider='${kb.copilotModel?.copilot?.modelProvider?.providerName}' and model='${vectorStore.embeddingModel}'`
		)
		const items = await vectorStore.similaritySearchWithScore(query, k, filter)
		const chunkMap = new Map<string, Document<ChunkMetadata>>()
		const parentChunkIds = new Set<string>()
		const chunkIds: string[] = []
		const docs: IKnowledgeDocumentChunk<ChunkMetadata>[] = []
		items.forEach(([doc, score]) => {
				doc.metadata.score = 1 - score
				chunkMap.set(doc.metadata.chunkId, doc as Document<ChunkMetadata>)
				if (doc.metadata.parentId) {
					parentChunkIds.add(doc.metadata.parentId)
				} else {
					// docs.push(doc as Document<ChunkMetadata>)
					chunkIds.push(doc.metadata.chunkId)
				}
			})
		if (chunkIds.length > 0) {
			const { items: chunks } = await this.chunkService.findAll({
					where: {
						knowledgebaseId: kb.id,
						metadata: Raw((alias) => `${alias} ->> 'chunkId' = ANY(:ids)`, {
							ids: Array.from(chunkIds)
						}),
					},
					relations: ['document'],
					select: {
						document: {
							id: true,
							name: true,
							sourceType: true,
							type: true,
							category: true,
						}
					}
				})
			chunks.forEach((chunk) => {
				const doc = chunkMap.get(chunk.metadata.chunkId)
				if (doc) {
					chunk.metadata.score = doc.metadata.score
				}
				docs.push(chunk)
			})
		}
		if (parentChunkIds.size > 0) {
			const { items: chunks } = await this.chunkService.findAll({
					where: {
						knowledgebaseId: kb.id,
						metadata: Raw((alias) => `${alias} ->> 'chunkId' = ANY(:ids)`, {
							ids: Array.from(parentChunkIds)
						}),
					},
					relations: ['children', 'document'],
					select: {
						document: {
							id: true,
							name: true,
							sourceType: true,
							type: true,
							category: true,
						}
					}
				})
			chunks.forEach((chunk) => {
				chunk.children.forEach((child) => {
					const doc = chunkMap.get(child.metadata.chunkId)
					if (doc) {
						child.metadata.score = doc.metadata.score
						if (!chunk.metadata.score || chunk.metadata.score < doc.metadata.score) {
							chunk.metadata.score = doc.metadata.score
						}
					}
				})
			})
			docs.push(...chunks)
		}
		
		// Parent-child
		// if (kb.chunkStructure === KnowledgeChunkStructureEnum.ParentChild) {
		// const ids = items.map(([doc]) => doc.metadata?.pageId).filter(Boolean) as string[]
		// if (ids.length > 0) {
		// 	const pages = await this.pageRepository.find({
		// 		where: {
		// 			tenantId: kb.tenantId,
		// 			knowledgebaseId: kb.id,
		// 			id: In(ids)
		// 		}
		// 	})
		// 	docs = mergePageChunks(
		// 		pages.map((_) => new Document({..._, metadata: {..._.metadata, children: null}})),
		// 		docs as Document<ChunkMetadata>[]
		// 	)
		// }

		// Rerank the documents if a rerank model is set
		if (kb.rerankModelId) {
			try {
				const rerankedDocs = await vectorStore.rerank(docs, query, { topN: k || 1000 })
				return rerankedDocs.map(({ index, relevanceScore }) => {
					return {
						...docs[index],
						metadata: { ...docs[index].metadata, relevanceScore }
					}
				})
			} catch (error) {
				throw new InternalServerErrorException(getPythonErrorMessage(error))
			}
		}

		return docs
	}
}

// /**
//  * 
//  * @deprecated use chunks
//  * @param pages 
//  * @param chunks 
//  * @returns 
//  */
// function mergePageChunks(pages: KnowledgeDocumentPage[], chunks: Document<ChunkMetadata>[]): Document[] {
// 	const chunkMap = new Map<string, Document<ChunkMetadata>>()
// 	for (const page of pages) {
// 		chunkMap.set(page.metadata.chunkId, page)
// 	}
// 	for (const child of chunks) {
// 		if (!child.metadata.parentId) {
// 			if (chunkMap.has(child.metadata.chunkId)) {
// 				console.warn(`Duplicate chunkId found: ${child.metadata.chunkId}, skipping...`)
// 				continue
// 			}
// 			chunkMap.set(child.metadata.chunkId, child)
// 			continue
// 		}
// 		const parent = chunkMap.get(child.metadata.parentId)
// 		if (parent) {
// 			if (!parent.metadata.children) {
// 				parent.metadata.children = []
// 			}
// 			parent.metadata.children.push(child)
// 		} else {
// 			chunkMap.set(child.metadata.chunkId, child)
// 		}
// 	}
// 	return Array.from(chunkMap.values()).map((chunk) => {
// 		return chunk.metadata.children?.length ? new Document({
// 			id: chunk.id,
// 			pageContent: chunk.pageContent,
// 			metadata: {
// 				...chunk.metadata,
// 				score: Math.max(...chunk.metadata.children.map(c => c.metadata.score))
// 			}
// 		}) : chunk
// 	})
// }
