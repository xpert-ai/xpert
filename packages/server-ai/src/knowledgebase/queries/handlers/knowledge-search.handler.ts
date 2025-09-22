import { DocumentInterface } from '@langchain/core/documents'
import { DocumentMetadata, IKnowledgebase, KnowledgebaseTypeEnum, KnowledgeChunkStructureEnum } from '@metad/contracts'
import { getPythonErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { InternalServerErrorException, Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Document } from 'langchain/document'
import { sortBy } from 'lodash'
import { In, IsNull, Not, Repository } from 'typeorm'
import { KnowledgeDocumentPage } from '../../../core/entities/internal'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeSearchQuery } from '../knowledge-search.query'

@QueryHandler(KnowledgeSearchQuery)
export class KnowledgeSearchQueryHandler implements IQueryHandler<KnowledgeSearchQuery> {
	private readonly logger = new Logger(KnowledgeSearchQueryHandler.name)

	@InjectRepository(KnowledgeDocumentPage)
	private readonly pageRepository: Repository<KnowledgeDocumentPage>

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
					docs = await this.similaritySearchWithScore(kb, query, k ?? kb.recall.topK ?? 1000, filter)
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
		// Parent-child
		if (kb.chunkStructure === KnowledgeChunkStructureEnum.ParentChild) {
			const ids = items.map(([doc]) => doc.metadata?.pageId).filter(Boolean) as string[]
			const pages = await this.pageRepository.find({
				where: {
					tenantId: kb.tenantId,
					knowledgebaseId: kb.id,
					id: In(ids)
				}
			})

			return pages.map((page) => {
				const matchedItems = items.filter(([doc]) => doc.metadata?.pageId === page.id).map(([doc, score]) => ({
							...doc,
							metadata: { 
								...doc.metadata,
								score: 1 - score
							}
						}))
				const maxScore = matchedItems.length > 0 ? Math.max(...matchedItems.map((doc) => doc.metadata.score)) : 0
				return new Document({
					id: page.id,
					pageContent: page.pageContent,
					metadata: {
						...page.metadata,
						score: maxScore,
						children: matchedItems
					}
				})
			})
		}
		// Rerank the documents if a rerank model is set
		if (kb.rerankModelId) {
			const docs = items.map(([doc, score]) => doc)
			try {
				const rerankedDocs = await vectorStore.rerank(docs, query, { topN: k || 1000 })
				return rerankedDocs.map(({ index, relevanceScore }) => {
					return {
						...docs[index],
						metadata: { ...docs[index].metadata, ...{ score: 1 - items[index][1], relevanceScore } }
					}
				})
			} catch (error) {
				throw new InternalServerErrorException(getPythonErrorMessage(error))
			}
		}

		return items.map(([doc, score]) => ({ ...doc, metadata: { ...doc.metadata, score: 1 - score } }))
	}
}
