import { DocumentInterface } from '@langchain/core/documents'
import { RequestContext } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { sortBy } from 'lodash'
import { In, IsNull, Not } from 'typeorm'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeSearchQuery } from '../knowledge.query'

@QueryHandler(KnowledgeSearchQuery)
export class KnowledgeSearchQueryHandler implements IQueryHandler<KnowledgeSearchQuery> {
	private readonly logger = new Logger(KnowledgeSearchQueryHandler.name)

	constructor(private readonly knowledgebaseService: KnowledgebaseService) {}

	public async execute(command: KnowledgeSearchQuery): Promise<{ doc: DocumentInterface; score: number; relevanceScore?: number }[]> {
		const { knowledgebases, query, k, score, filter } = command.input
		const tenantId = command.input.tenantId ?? RequestContext.currentTenantId()
		const organizationId = command.input.organizationId ?? RequestContext.getOrganizationId()
		const result = await this.knowledgebaseService.findAll({
			where: {
				tenantId,
				organizationId,
				id: knowledgebases ? In(knowledgebases) : Not(IsNull())
			}
		})
		const _knowledgebases = result.items

		const documents: { doc: DocumentInterface<Record<string, any>>; score: number }[] = []
		const kbs = await Promise.all(
			_knowledgebases.map(async (kb) => {
				const vectorStore = await this.knowledgebaseService.getVectorStore(
					kb.id,
					true,
					tenantId,
					organizationId
				)
				this.logger.debug(
					`SimilaritySearch question='${query}' kb='${kb.name}' in ai provider='${kb.copilotModel?.copilot?.modelProvider?.providerName}' and model='${vectorStore.embeddingModel}'`
				)
				const items = await vectorStore.similaritySearchWithScore(query, k, filter)
				// Rerank the documents if a rerank model is set
				if (kb.rerankModelId) {
					const docs = items.map(([doc, score]) => doc)
					const rerankedDocs = await vectorStore.rerank(docs, query, { topN: k || 1000 })
					return rerankedDocs.map(({ index, relevanceScore }) => {
						return {
							doc: docs[index],
							score: items[index][1],
							relevanceScore
						}
					})
				}

				return items.map(([doc, score]) => ({doc, score}))
					.filter(({ score: _score }) => 1 - _score >= (score ?? kb.similarityThreshold ?? 0.5))
			})
		)

		kbs.forEach((items) => {
			items.forEach((item) => {
				if (item.score > (score ?? 0.5)) {
					documents.push(item)
				}
			})
		})

		return sortBy(documents, 'score', 'desc').slice(0, k || 1000)
	}
}
