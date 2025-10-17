import { DocumentInterface } from '@langchain/core/documents'
import { Embeddings } from '@langchain/core/embeddings'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { VectorStore } from '@langchain/core/vectorstores'
import {
	AiBusinessRole,
	channelName,
	DocumentMetadata,
	genPipelineKnowledgeBaseKey,
	genPipelineSourceKey,
	IKnowledgebase,
	IKnowledgebaseTask,
	IKnowledgeDocument,
	IWFNKnowledgeBase,
	IWFNProcessor,
	IWFNSource,
	IXpert,
	KBDocumentStatusEnum,
	KnowledgebaseChannel,
	KnowledgebaseTypeEnum,
	KnowledgeProviderEnum,
	KNOWLEDGE_SOURCES_NAME,
	KnowledgeTask,
	mapTranslationLanguage,
	Metadata,
	STATE_VARIABLE_HUMAN,
	WorkflowNodeTypeEnum,
	XpertTypeEnum
} from '@metad/contracts'
import { getErrorMessage, shortuuid } from '@metad/server-common'
import { IntegrationService, PaginationParams, RequestContext } from '@metad/server-core'
import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import {
	DocumentSourceRegistry,
	DocumentTransformerRegistry,
	FileSystemPermission,
	ImageUnderstandingRegistry,
	KnowledgeStrategyRegistry,
	TextSplitterRegistry,
	XpFileSystem
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { assign, sortBy } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm'
import { IRerank } from '../ai-model/types/rerank'
import {
	CopilotModelGetChatModelQuery,
	CopilotModelGetEmbeddingsQuery,
	CopilotModelGetRerankQuery
} from '../copilot-model/queries/index'
import { AiModelNotFoundException, CopilotModelNotFoundException, CopilotNotFoundException } from '../core/errors'
import { RagCreateVStoreCommand } from '../rag-vstore'
import { XpertWorkspaceBaseService } from '../xpert-workspace'
import { EventName_XpertPublished } from '../xpert/types'
import { XpertService } from '../xpert/xpert.service'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgeSearchQuery } from './queries'
import { KnowledgebaseTask, KnowledgebaseTaskService } from './task'
import { KnowledgeDocumentStore } from './vector-store'
import { sandboxVolumeUrl, VolumeClient } from '../shared'
import { KnowledgeDocumentService } from '../knowledge-document/document.service'

@Injectable()
export class KnowledgebaseService extends XpertWorkspaceBaseService<Knowledgebase> {
	readonly #logger = new Logger(KnowledgebaseService.name)

	@Inject(I18nService)
	private readonly i18nService: I18nService

	@Inject(KnowledgeDocumentService)
	private readonly documentService: KnowledgeDocumentService

	@Inject(TextSplitterRegistry)
	private readonly textSplitterRegistry: TextSplitterRegistry

	@Inject(DocumentTransformerRegistry)
	private readonly docTransformerRegistry: DocumentTransformerRegistry

	@Inject(ImageUnderstandingRegistry)
	private readonly understandingRegistry: ImageUnderstandingRegistry

	@Inject(DocumentSourceRegistry)
	private readonly docSourceRegistry: DocumentSourceRegistry

	@Inject(XpertService)
	private readonly xpertService: XpertService

	constructor(
		@InjectRepository(Knowledgebase)
		repository: Repository<Knowledgebase>,
		private readonly integrationService: IntegrationService,
		private readonly taskService: KnowledgebaseTaskService,
		private readonly knowledgeStrategyRegistry: KnowledgeStrategyRegistry
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
				this.i18nService.t('xpert.Error.NameExists', {
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

	async searchExternalKnowledgebase(
		entity: Partial<IKnowledgebase>,
		query: string,
		k: number,
		filter?: Record<string, string>
	) {
		const integration = await this.integrationService.findOne(entity.integrationId)
		const knowledgeStrategy = this.knowledgeStrategyRegistry.get(
			integration.provider as unknown as KnowledgeProviderEnum
		)
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
		return await knowledgeStrategy.execute(integration, {
			query,
			k,
			filter,
			options: { knowledgebaseId: entity.extKnowledgebaseId }
		})
	}

	/**
	 * To solve the problem that Update cannot create OneToOne relation, it is uncertain whether using save to update might pose risks
	 */
	async update(id: string, entity: Partial<Knowledgebase>) {
		const _entity = await super.findOne(id)
		assign(_entity, entity)
		return await this.repository.save(_entity)
	}

	async getTextSplitterStrategies() {
		return this.textSplitterRegistry.list().map((strategy) => strategy.meta)
	}

	async getDocumentTransformerStrategies() {
		return this.docTransformerRegistry.list().map((strategy) => {
			return {
				meta: strategy.meta,
				integration: strategy.permissions?.find((permission) => permission.type === 'integration'),
			}
		})
	}

	async getUnderstandingStrategies() {
		return this.understandingRegistry
			.list()
			.map((strategy) => ({
				meta: strategy.meta,
				requireVisionModel: strategy.permissions?.some((permission) => permission.type === 'llm')
			}))
	}

	async getDocumentSourceStrategies() {
		return this.docSourceRegistry
			.list()
			.map((strategy) => ({
				meta: strategy.meta,
				integration: strategy.permissions?.find((permission) => permission.type === 'integration')
			}))
	}

	/**
	 * Test the hitting effect of the Knowledge based on the given query text.
	 * 
	 * @param id Knowledgebase ID
	 * @param options Query options
	 * @returns Document chunks
	 */
	async test(id: string, options: { query: string; k?: number; filter?: Metadata }) {
		const knowledgebase = await this.findOne(id)
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()

		const results = await this.queryBus.execute<KnowledgeSearchQuery, DocumentInterface<DocumentMetadata>[]>(
			new KnowledgeSearchQuery({
				tenantId,
				organizationId,
				knowledgebases: [knowledgebase.id],
				source: 'hit_testing',
				...options
			})
		)

		return results
	}

	/**
	 * Init a pipeline (xpert) for knowledgebase
	 *
	 * @param id
	 * @returns
	 */
	async createPipeline(id: string) {
		const knowledgebase = await this.findOne(id)
		const sourceKey = genPipelineSourceKey()
		const knowledgebaseKey = genPipelineKnowledgeBaseKey()
		return await this.xpertService.create({
			name: `${knowledgebase.name} Pipeline - ${shortuuid()}`,
			workspaceId: knowledgebase.workspaceId,
			type: XpertTypeEnum.Knowledge,
			latest: true,
			knowledgebase: {
				id: knowledgebase.id
			},
			agent: {
				key: shortuuid(),
				options: {
					hidden: true
				}
			},
			draft: {
				nodes: [
					{
						key: sourceKey,
						type: 'workflow',
						position: { x: 100, y: 300 },
						entity: {
							key: sourceKey,
							title: 'Source',
							type: WorkflowNodeTypeEnum.SOURCE,
							provider: 'local-file'
						} as IWFNSource
					},
					{
						key: knowledgebaseKey,
						type: 'workflow',
						position: { x: 580, y: 300 },
						entity: {
							key: knowledgebaseKey,
							title: 'Knowledge Base',
							type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE
						} as IWFNKnowledgeBase
					}
				]
			}
		})
	}

	async getVisionModel(knowledgebaseId: string) {
		const knowledgebase = await this.findOne(knowledgebaseId, { relations: ['visionModel', 'visionModel.copilot'] })
		if (!knowledgebase?.visionModel?.copilot) {
			throw new BadRequestException(t('server-ai:Error.KBReqVisionModel'))
		}
		const copilot = knowledgebase.visionModel.copilot
		const chatModel = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
			new CopilotModelGetChatModelQuery(copilot, knowledgebase.visionModel, {
				usageCallback: (token) => {
					// execution.tokens += (token ?? 0)
				}
			})
		)

		return chatModel
	}

	async getVectorStore(knowledgebaseId: IKnowledgebase | string, requiredEmbeddings = false) {
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

		const store = await this.commandBus.execute(
			new RagCreateVStoreCommand(embeddings, {
				collectionName: knowledgebase.id
			})
		)
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
				return this.getVectorStore(kb.id, true).then((vectorStore) => {
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

	/**
	 * Handle knowledgebase related xpert published event, update knowledgebase config from knowledge pipeline
	 *
	 * @param xpert The knowledgebase related xpert
	 * @returns
	 */
	@OnEvent(EventName_XpertPublished)
	async handle(xpert: IXpert) {
		if (xpert.type !== XpertTypeEnum.Knowledge) return

		const knowledgebaseNode = xpert.graph.nodes.find(
			(node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.KNOWLEDGE_BASE
		)
		if (!knowledgebaseNode) return

		const knowledgebaseEntity = knowledgebaseNode.entity as IWFNKnowledgeBase
		if (!xpert.knowledgebase?.id) return

		this.#logger.log(`Clear knowledgebase ${knowledgebaseEntity.id} documents cache after published`)

		await this.update(xpert.knowledgebase.id, {
			copilotModel: knowledgebaseEntity.copilotModel,
			rerankModel: knowledgebaseEntity.rerankModel
		})
	}

	// Pipeline

	/**
	 * Create a new task for a knowledgebase.
	 * If the task status is running, start immediately.
	 */
	async createTask(knowledgebaseId: string, task: Partial<IKnowledgebaseTask>) {
		const {id} = await this.taskService.createTask(knowledgebaseId, task)
		const _task = await this.taskService.findOne(id, { relations: ['documents'] })
		if (task.status === 'running') {
			_task.documents.forEach((doc) => {
				doc.status = KBDocumentStatusEnum.WAITING
				doc.processMsg = null
			})
			// Update task status to running
			await this.documentService.save(_task.documents)
			// Start immediately
			await this.processTask(knowledgebaseId, _task.id, {
				sources: _task.documents?.reduce((obj, doc) => ({
					...obj,
					[doc.sourceConfig.key]: {
						documents: [...(obj[doc.sourceConfig.key]?.documents ?? []), doc.id]
					}
				}), {}),
				stage: 'prod'
			})
		}
		return _task
	}

	async getTask(knowledgebaseId: string, taskId: string, params?: PaginationParams<KnowledgebaseTask>) {
		const where = { ...(params?.where ?? {}), id: taskId, knowledgebaseId } as FindOptionsWhere<KnowledgebaseTask>

		return this.taskService.findOneByOptions({
			...(params ?? {}),
			where
		})
	}

	/**
	 * Process a task, start the knowledge ingestion pipeline
	 */
	async processTask(knowledgebaseId: string, taskId: string, inputs: { sources?: { [key: string]: { documents: string[] } }; stage: 'preview' | 'prod'; options?: any }) {
		const kb = await this.findOne(knowledgebaseId, { relations: ['pipeline'] })
		await this.taskService.update(taskId, { status: 'running' })
		const sources = inputs.sources ? Object.keys(inputs.sources) : null
		await this.xpertService.addTriggerJob(
			kb.pipelineId,
			RequestContext.currentUserId(),
			
			{
				[STATE_VARIABLE_HUMAN]: {
					input: 'Process knowledges pipeline',
				},
				[KnowledgebaseChannel]: {
					knowledgebaseId: knowledgebaseId,
					[KnowledgeTask]: taskId,
					[KNOWLEDGE_SOURCES_NAME]: sources,
					stage: inputs.stage
				},
				...(sources ?? []).reduce((obj, key) => ({ ...obj, [channelName(key)]: { documents: inputs.sources[key].documents } }), {})
			},
			{
				trigger: null,
				isDraft: inputs.stage === 'preview',
				from: 'knowledge'
			}
		)
	}

	async previewFile(id: string, filePath: string) {
		try {
			const results = await this.transformDocuments(id, {provider: 'default', config: {}} as IWFNProcessor, false, [
				{
					filePath,
					name: filePath.split('/').pop()
				}
			])
			return results[0].chunks[0]
		} catch (error) {
			throw new InternalServerErrorException(getErrorMessage(error))
		}
	}

	async transformDocuments(knowledgebaseId: string, entity: IWFNProcessor, isDraft: boolean, input: Partial<IKnowledgeDocument<Metadata>>[]) {
		const strategy = this.docTransformerRegistry.get(entity.provider) 
		
		const permissions = {}
		const volumeClient = new VolumeClient({
			tenantId: RequestContext.currentTenantId(),
			catalog: 'knowledges',
			userId: RequestContext.currentUserId(),
			knowledgeId: knowledgebaseId
		})
		const fsPermission = strategy.permissions?.find(
			(permission) => permission.type === 'filesystem'
		) as FileSystemPermission
		if (fsPermission) {
			permissions['fileSystem'] = new XpFileSystem(
				fsPermission,
				volumeClient.getVolumePath(''),
				sandboxVolumeUrl(`/knowledges/${knowledgebaseId}/`)
			)
		}

		// Integration
		const integrationPermission = strategy.permissions?.find(
			(permission) => permission.type === 'integration'
		)
		if (integrationPermission && entity.integrationId) {
			let integration = null
			try {
				integration = await this.integrationService.findOne(entity.integrationId)
			} catch (error) {
				throw new BadRequestException(t('server-ai:Error.IntegrationNotFound', { id: entity.integrationId }))
			}
			permissions['integration'] = integration
		}
		const results = await strategy.transformDocuments(input, {
			...(entity.config ?? {}),
			stage: isDraft ? 'test' : 'prod',
			tempDir: volumeClient.getVolumePath('tmp'),
			permissions
		})

		return results
	}
}
