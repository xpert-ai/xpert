import { DocumentInterface } from '@langchain/core/documents'
import { Embeddings } from '@langchain/core/embeddings'
import { VectorStore } from '@langchain/core/vectorstores'
import { AiBusinessRole, IKnowledgebase, KnowledgebaseTypeEnum, KnowledgeProviderEnum, mapTranslationLanguage, Metadata } from '@metad/contracts'
import { IntegrationService, RequestContext } from '@metad/server-core'
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { assign, sortBy } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { In, IsNull, Not, Repository } from 'typeorm'
import { CopilotModelGetEmbeddingsQuery, CopilotModelGetRerankQuery } from '../copilot-model/queries/index'
import { AiModelNotFoundException, CopilotModelNotFoundException, CopilotNotFoundException } from '../core/errors'
import { XpertWorkspaceBaseService } from '../xpert-workspace'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgeSearchQuery } from './queries'
import { KnowledgeDocumentStore } from './vector-store'
import { IRerank } from '../ai-model/types/rerank'
import { RagCreateVStoreCommand } from '../rag-vstore'
import { KnowledgeStrategyRegistry } from '@xpert-ai/plugin-sdk'

@Injectable()
export class KnowledgebaseService extends XpertWorkspaceBaseService<Knowledgebase> {
	readonly #logger = new Logger(KnowledgebaseService.name)

	@Inject(I18nService)
	private readonly i18nService: I18nService

	constructor(
		@InjectRepository(Knowledgebase)
		repository: Repository<Knowledgebase>,
		private readonly integrationService: IntegrationService,
		private readonly knowledgeStrategyRegistry: KnowledgeStrategyRegistry,
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

	async createExternal(entity: Partial<IKnowledgebase>) {
		// Test external integration
		if (!entity.integrationId) {
			throw new BadRequestException(
				await this.i18nService.t('xpert.Error.ExternalIntegrationRequired', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode())
				})
			)
		}
		
		await this.searchExternalKnowledgebase(entity, 'test', 1, {})

		return this.create({
			...entity,
			type: KnowledgebaseTypeEnum.External
		})
	}

	async searchExternalKnowledgebase(entity: Partial<IKnowledgebase>, query: string, k: number, filter?: Record<string, string>) {
		const integration = await this.integrationService.findOne(entity.integrationId)
		const knowledgeStrategy = this.knowledgeStrategyRegistry.get(integration.provider as unknown as KnowledgeProviderEnum)
		if (!knowledgeStrategy) {
			throw new BadRequestException(
				await this.i18nService.t('xpert.Error.KnowledgeStrategyNotFound', {
					lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
					args: {
						provider: integration.provider
					}
				})
			)
		}
		return await knowledgeStrategy.execute(integration, {query, k, filter, options: {knowledgebaseId: entity.extKnowledgebaseId}})
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
	) {
		let knowledgebase: IKnowledgebase
		if (typeof knowledgebaseId === 'string') {
			if (requiredEmbeddings) {
				knowledgebase = await this.findOne(knowledgebaseId, {
					relations: [
						'rerankModel',
						'rerankModel.copilot',
						'rerankModel.copilot.modelProvider',
						'copilotModel',
						'copilotModel.copilot',
						'copilotModel.copilot.modelProvider',
						'documents'
					]
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

		let rerankModel: IRerank = null
		if (knowledgebase.rerankModel) {
			rerankModel = await this.queryBus.execute<CopilotModelGetRerankQuery, IRerank>(
				new CopilotModelGetRerankQuery(knowledgebase.rerankModel.copilot, knowledgebase.rerankModel, {
					tokenCallback: (token) => {
						// execution.tokens += (token ?? 0)
					}
				})
			)
			if (!rerankModel) {
				throw new AiModelNotFoundException(
					`Rerank model '${knowledgebase.rerankModel.model || knowledgebase.rerankModel.copilot?.copilotModel?.model}' not found for knowledgebase '${knowledgebase.name}'`
				)
			}
		}

		const store = await this.commandBus.execute(new RagCreateVStoreCommand(embeddings, {
			collectionName: knowledgebase.id,
		}))
		const vStore = new KnowledgeDocumentStore(knowledgebase, store, rerankModel)

		// const vectorStore = new KnowledgeDocumentVectorStore(knowledgebase, this.pgPool, embeddings, rerankModel)

		// // Create table for vector store if not exist
		// await vectorStore.ensureTableInDatabase()

		return vStore
	}

	async similaritySearch(
		query: string,
		options?: {
			k?: number
			filter?: VectorStore['FilterType']
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
				return this.getVectorStore(kb.id, true,).then((vectorStore) => {
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
