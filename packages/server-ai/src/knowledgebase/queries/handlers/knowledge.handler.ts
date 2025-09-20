import { DocumentInterface } from '@langchain/core/documents'
import { IKnowledgebase, KnowledgebaseTypeEnum } from '@metad/contracts'
import { getPythonErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { InternalServerErrorException, Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { sortBy } from 'lodash'
import { In, IsNull, Not } from 'typeorm'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeSearchQuery } from '../knowledge.query'

@QueryHandler(KnowledgeSearchQuery)
export class KnowledgeSearchQueryHandler implements IQueryHandler<KnowledgeSearchQuery> {
	private readonly logger = new Logger(KnowledgeSearchQueryHandler.name)

	constructor(private readonly knowledgebaseService: KnowledgebaseService) {}

	public async execute(
		command: KnowledgeSearchQuery
	): Promise<{ doc: DocumentInterface; score: number; relevanceScore?: number }[]> {
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

		const documents: { doc: DocumentInterface<Record<string, any>>; score: number }[] = []
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
			docs.filter(({ score: _score }) => _score >= (score ?? kb.recall?.score ?? 0.5)).forEach(
				(item) => {
					documents.push(item)
				}
			)
		})

		return sortBy(documents, 'score').reverse().slice(0, topK)
	}

	async similaritySearchWithScore(kb: IKnowledgebase, query: string, k: number, filter?: Record<string, any>) {
		const vectorStore = await this.knowledgebaseService.getVectorStore(kb.id, true)
		this.logger.debug(
			`SimilaritySearch question='${query}' kb='${kb.name}' in ai provider='${kb.copilotModel?.copilot?.modelProvider?.providerName}' and model='${vectorStore.embeddingModel}'`
		)
		const items = await vectorStore.similaritySearchWithScore(query, k, filter)
		// Rerank the documents if a rerank model is set
		if (kb.rerankModelId) {
			const docs = items.map(([doc, score]) => doc)
			try {
				const rerankedDocs = await vectorStore.rerank(docs, query, { topN: k || 1000 })
				return rerankedDocs.map(({ index, relevanceScore }) => {
					return {
						doc: docs[index],
						score: 1 - items[index][1],
						relevanceScore
					}
				})
			} catch (error) {
				throw new InternalServerErrorException(getPythonErrorMessage(error))
			}
		}

		return items.map(([doc, score]) => ({ doc, score: 1 - score }))
	}
}
