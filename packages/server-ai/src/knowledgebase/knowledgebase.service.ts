import { DocumentInterface } from '@langchain/core/documents'
import { Embeddings } from '@langchain/core/embeddings'
import { AiBusinessRole, IKnowledgebase, mapTranslationLanguage, Metadata } from '@metad/contracts'
import { DATABASE_POOL_TOKEN, RequestContext } from '@metad/server-core'
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { assign, sortBy } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { Pool } from 'pg'
import { In, IsNull, Not, Repository } from 'typeorm'
import { CopilotModelGetEmbeddingsQuery } from '../copilot-model/queries/index'
import { AiModelNotFoundException, CopilotModelNotFoundException, CopilotNotFoundException } from '../core/errors'
import { XpertWorkspaceBaseService } from '../xpert-workspace'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgeSearchQuery } from './queries'
import { KnowledgeDocumentVectorStore } from './vector-store'

@Injectable()
export class KnowledgebaseService extends XpertWorkspaceBaseService<Knowledgebase> {
	readonly #logger = new Logger(KnowledgebaseService.name)

	@Inject(I18nService)
	private readonly i18nService: I18nService

	constructor(
		@InjectRepository(Knowledgebase)
		repository: Repository<Knowledgebase>,
		@Inject(DATABASE_POOL_TOKEN) private readonly pgPool: Pool
	) {
		super(repository)
	}

	async create(entity: Partial<IKnowledgebase>) {
		// Check name
		const exist = await super.findOneOrFail({
			where: { name: entity.name }
		})
		if (exist.success) {
			throw new BadRequestException(
				await this.i18nService.t('xpert.Error.NameExists', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}

		return await super.create(entity)
	}

	/**
	 * To solve the problem that Update cannot create OneToOne relation, it is uncertain whether using save to update might pose risks
	 */
	async update(id: string, entity: Partial<Knowledgebase>) {
		const _entity = await super.findOne(id)
		assign(_entity, entity)
		return await this.repository.save(_entity)
	}

	async test(id: string, options: { query: string; k?: number; filter?: Metadata }) {
		const knowledgebase = await this.findOne(id)
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const results = await this.queryBus.execute<KnowledgeSearchQuery, [DocumentInterface, number][]>(
			new KnowledgeSearchQuery({
				tenantId,
				organizationId,
				knowledgebases: [knowledgebase.id],
				...options
			})
		)

		return results
	}

	async getVectorStore(
		knowledgebaseId: IKnowledgebase | string,
		requiredEmbeddings = false,
		tenantId?: string,
		organizationId?: string
	) {
		let knowledgebase: IKnowledgebase
		if (typeof knowledgebaseId === 'string') {
			if (requiredEmbeddings) {
				knowledgebase = await this.findOne(knowledgebaseId, {
					relations: ['copilotModel', 'copilotModel.copilot', 'copilotModel.copilot.modelProvider', 'documents']
				})
			} else {
				knowledgebase = await this.findOne(knowledgebaseId, { relations: ['copilotModel'] })
			}
		} else {
			knowledgebase = knowledgebaseId
		}

		const copilotModel = knowledgebase.copilotModel
		if (requiredEmbeddings && !copilotModel) {
			throw new CopilotModelNotFoundException(
				await this.i18nService.t('rag.Error.KnowledgebaseNoModel', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: {
						knowledgebase: knowledgebase.name
					}
				})
			)
		}
		const copilot = copilotModel?.copilot
		if (requiredEmbeddings && !copilot) {
			throw new CopilotNotFoundException(`Copilot not set for knowledgebase '${knowledgebase.name}'`)
		}

		let embeddings = null
		if (copilotModel && copilot?.modelProvider) {
			embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
				new CopilotModelGetEmbeddingsQuery(copilot, copilotModel, {
					tokenCallback: (token) => {
						// execution.tokens += (token ?? 0)
					}
				})
			)
		}

		if (requiredEmbeddings && !embeddings) {
			throw new AiModelNotFoundException(
				`Embeddings model '${copilotModel.model || copilot?.copilotModel?.model}' not found for knowledgebase '${knowledgebase.name}'`
			)
		}

		const vectorStore = new KnowledgeDocumentVectorStore(knowledgebase, this.pgPool, embeddings)

		// Create table for vector store if not exist
		await vectorStore.ensureTableInDatabase()

		return vectorStore
	}

	async similaritySearch(
		query: string,
		options?: {
			k?: number
			filter?: KnowledgeDocumentVectorStore['filter']
			score?: number
			tenantId?: string
			organizationId?: string
			knowledgebases?: string[]
		}
	) {
		const { knowledgebases, k, score, filter } = options ?? {}
		const tenantId = options?.tenantId ?? RequestContext.currentTenantId()
		const organizationId = options?.organizationId ?? RequestContext.getOrganizationId()
		const result = await this.findAll({
			where: {
				tenantId,
				organizationId,
				id: knowledgebases ? In(knowledgebases) : Not(IsNull())
			}
		})
		const _knowledgebases = result.items

		const documents: { doc: DocumentInterface<Record<string, any>>; score: number }[] = []
		const kbs = await Promise.all(
			_knowledgebases.map((kb) => {
				return this.getVectorStore(kb.id, true, tenantId, organizationId).then((vectorStore) => {
					return vectorStore.similaritySearchWithScore(query, k, filter)
				})
			})
		)

		kbs.forEach((kb) => {
			kb.forEach(([doc, score]) => {
				documents.push({ doc, score })
			})
		})

		return sortBy(documents, 'score', 'desc')
			.filter(({ score: _score }) => 1 - _score >= (score ?? 0.1))
			.slice(0, k)
			.map(({ doc }) => doc)
	}

	async maxMarginalRelevanceSearch(
		query: string,
		options?: {
			role?: AiBusinessRole
			k: number
			filter: Record<string, any>
			tenantId?: string
			organizationId?: string
		}
	) {
		//
	}
}
