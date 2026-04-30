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
	KBDocumentStatusEnum,
	KnowledgebaseChannel,
	KnowledgebasePermission,
	KnowledgebaseStatusEnum,
	KnowledgebaseTypeEnum,
	KnowledgeProviderEnum,
	KNOWLEDGE_SOURCES_NAME,
	KnowledgeTask,
	mapTranslationLanguage,
	STATE_VARIABLE_HUMAN,
	WorkflowNodeTypeEnum,
	XpertTypeEnum,
	genXpertTriggerKey,
	IWFNTrigger,
	KnowledgeStructureEnum,
	XpertAgentExecutionStatusEnum,
	classificateDocumentCategory,
	TCopilotModel,
	KnowledgeDocumentMetadata,
	IUser
} from '@xpert-ai/contracts'
import { getErrorMessage, shortuuid } from '@xpert-ai/server-common'
import { IntegrationService, PaginationParams, RequestContext } from '@xpert-ai/server-core'
import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common'
import { Queue } from 'bull'
import { InjectRepository } from '@nestjs/typeorm'
import {
	DocumentSourceRegistry,
	DocumentTransformerRegistry,
	ImageUnderstandingRegistry,
	IRerank,
	KnowledgeStrategyRegistry,
	TextSplitterRegistry,
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { assign, sortBy } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import { DataSource, FindOptionsWhere, In, IsNull, Not, QueryFailedError, Repository } from 'typeorm'
import {
	CopilotModelGetChatModelQuery,
	CopilotModelGetEmbeddingsQuery,
	CopilotModelGetRerankQuery
} from '../copilot-model/queries/index'
import { CopilotGetOneQuery } from '../copilot/queries'
import { AiModelNotFoundException, CopilotModelNotFoundException, CopilotNotFoundException } from '../core/errors'
import { RagCreateVStoreCommand } from '../rag-vstore'
import { XpertWorkspaceAccessService, XpertWorkspaceBaseService } from '../xpert-workspace'
import { GetXpertWorkspaceQuery } from '../xpert-workspace/queries'
import { XpertService } from '../xpert/xpert.service'
import { Knowledgebase } from './knowledgebase.entity'
import {
	createEmbeddingCollectionName,
	createEmbeddingFingerprint,
	resolveEmbeddingModelUpdateState,
	TResolvedEmbeddingModelTarget
} from './embedding-state'
import { KnowledgeSearchQuery } from './queries'
import { KnowledgebaseTask, KnowledgebaseTaskService } from './task'
import { KnowledgeDocumentStore, TEmbeddingVectorMetadata } from './vector-store'
import { VOLUME_CLIENT, VolumeClient } from '../shared'
import { KnowledgeDocumentService } from '../knowledge-document/document.service'
import { KnowledgeDocumentChunk } from '../knowledge-document/chunk/chunk.entity'
import { TDocChunkMetadata } from '../knowledge-document/types'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution'
import { PluginPermissionsCommand } from './commands'
import { XpertEnqueueTriggerDispatchCommand } from '../xpert/commands'
import { JOB_REBUILD_KNOWLEDGEBASE_EMBEDDING, TKnowledgebaseRebuildEmbeddingJob } from './types'

type TEmbeddingCopilotModel = Partial<TCopilotModel> & { id?: string }

function getQueryFailedErrorCode(error: QueryFailedError) {
	const driverError: unknown = error.driverError
	if (!driverError || typeof driverError !== 'object') {
		return null
	}
	if ('code' in driverError && (typeof driverError.code === 'string' || typeof driverError.code === 'number')) {
		return driverError.code
	}
	if ('errno' in driverError && (typeof driverError.errno === 'string' || typeof driverError.errno === 'number')) {
		return driverError.errno
	}
	return null
}

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

	@Inject(KnowledgeStrategyRegistry)
	private readonly knowledgeStrategyRegistry: KnowledgeStrategyRegistry

	@Inject(XpertService)
	private readonly xpertService: XpertService

	@Inject(VOLUME_CLIENT)
	private readonly volumeClient: VolumeClient

	constructor(
		@InjectRepository(Knowledgebase)
		repository: Repository<Knowledgebase>,
		workspaceAccessService: XpertWorkspaceAccessService,
		private readonly integrationService: IntegrationService,
		private readonly taskService: KnowledgebaseTaskService,
		private readonly dataSource: DataSource,
		@InjectQueue(JOB_REBUILD_KNOWLEDGEBASE_EMBEDDING)
		private readonly rebuildQueue: Queue<TKnowledgebaseRebuildEmbeddingJob>
	) {
		super(repository, workspaceAccessService)
	}

	/**
	 * Override getAllByWorkspace to include knowledgebases with Public/Organization permissions
	 * from other workspaces in the same organization
	 */
	async getAllByWorkspace(workspaceId: string, data: PaginationParams<Knowledgebase>, published: boolean, user: IUser) {
		const { relations, order, take } = data ?? {}
		let { where } = data ?? {}
		where = where ?? {}
		const organizationId = RequestContext.getOrganizationId() ?? IsNull()
		
		if (workspaceId === 'null' || workspaceId === 'undefined' || !workspaceId) {
			where = {
				...(<FindOptionsWhere<Knowledgebase>>where),
				workspaceId: IsNull(),
				createdById: user.id
			}
			if (published) {
				where.publishAt = Not(IsNull())
			}
			return this.findAll({
				where,
				relations,
				order,
				take
			})
		} else {
			const workspace = await this.queryBus.execute(new GetXpertWorkspaceQuery(user, { id: workspaceId }))
			if (!workspace) {
				throw new NotFoundException(`Not found or no auth for xpert workspace '${workspaceId}'`)
			}

			// Build where conditions array to include:
			// 1. Knowledgebases that belong to this workspace
			// 2. Public knowledgebases from any workspace in the same organization
			// 3. Organization knowledgebases from other workspaces in the same organization
			const whereConditions: FindOptionsWhere<Knowledgebase>[] = [
				{
					...(<FindOptionsWhere<Knowledgebase>>where),
					workspaceId: workspaceId
				}
			]

			// Add Public knowledgebases from any workspace (excluding those already in this workspace)
			// Note: Using Not(In([workspaceId])) to exclude the current workspace
			whereConditions.push({
				...(<FindOptionsWhere<Knowledgebase>>where),
				permission: KnowledgebasePermission.Public,
				organizationId: organizationId,
				workspaceId: Not(In([workspaceId]))
			})

			// Add Organization knowledgebases from other workspaces in the same organization
			whereConditions.push({
				...(<FindOptionsWhere<Knowledgebase>>where),
				permission: KnowledgebasePermission.Organization,
				organizationId: organizationId,
				workspaceId: Not(In([workspaceId]))
			})

			// Apply published filter if needed
			if (published) {
				whereConditions.forEach(condition => {
					condition.publishAt = Not(IsNull())
				})
			}

			return this.findAll({
				where: whereConditions,
				relations,
				order,
				take
			})
		}
	}

	async create(entity: Partial<IKnowledgebase>) {
		// Check name
		const exist = await super.findOneOrFailByOptions({
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
		const _entity = await super.findOne(id, {
			relations: [
				'copilotModel',
				'copilotModel.copilot',
				'copilotModel.copilot.modelProvider',
				'pendingCopilotModel',
				'pendingCopilotModel.copilot',
				'pendingCopilotModel.copilot.modelProvider'
			]
		})
		
		// Check name uniqueness if name is being changed
		if (entity.name && entity.name !== _entity.name) {
			const tenantId = RequestContext.currentTenantId()
			const organizationId = RequestContext.getOrganizationId()
			
			// Check if another knowledgebase with the same name exists (excluding current one)
			const exist = await this.repository.findOne({
				where: {
					tenantId,
					organizationId,
					name: entity.name,
					id: Not(id) // Exclude current knowledgebase
				}
			})
			
			if (exist) {
				throw new BadRequestException(
					this.i18nService.t('xpert.Error.NameExists', {
						lang: mapTranslationLanguage(RequestContext.getLanguageCode())
					})
				)
			}
		}
		
		try {
			const hasCopilotModel = Object.prototype.hasOwnProperty.call(entity, 'copilotModel')
			const hasCopilotModelId = Object.prototype.hasOwnProperty.call(entity, 'copilotModelId')
			const hasEmbeddingModelChange = hasCopilotModel || hasCopilotModelId
			let embeddingPatch: Partial<Knowledgebase> = {}
			if (hasEmbeddingModelChange) {
				if (_entity.status === KnowledgebaseStatusEnum.REBUILDING) {
					throw new BadRequestException('Embedding rebuild is running')
				}
				if (!hasCopilotModel && entity.copilotModelId !== _entity.copilotModelId) {
					throw new BadRequestException('copilotModel is required when changing embedding model')
				}
				if (hasCopilotModel) {
					const target = await this.resolveEmbeddingModelTarget(id, entity.copilotModel ?? null, entity.copilotModelId ?? null)
					embeddingPatch = resolveEmbeddingModelUpdateState(_entity, target) as Partial<Knowledgebase>
				}
			}
			assign(_entity, entity, embeddingPatch)
			const saved = await super.save(_entity)
			if (embeddingPatch.status === KnowledgebaseStatusEnum.REBUILD_REQUIRED) {
				return await this.startEmbeddingRebuild(id)
			}
			return saved
		} catch (error) {
			// Catch database unique constraint errors as a fallback
			// PostgreSQL error code for unique violation: 23505
			// MySQL error code for duplicate entry: 1062
			if (error instanceof QueryFailedError) {
				const errorCode = getQueryFailedErrorCode(error)
				if (errorCode === '23505' || errorCode === 1062 || 
					error.message?.includes('duplicate key') || 
					error.message?.includes('UNIQUE constraint') ||
					error.message?.includes('Duplicate entry')) {
					throw new BadRequestException(
						this.i18nService.t('xpert.Error.NameExists', {
							lang: mapTranslationLanguage(RequestContext.getLanguageCode())
						})
					)
				}
			}
			// Re-throw other errors
			throw error
		}
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
	async test(id: string, options: { query: string; k?: number; filter?: KnowledgeDocumentMetadata }) {
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

	async assertNotRebuilding(knowledgebaseId: string) {
		const knowledgebase = await this.findOne(knowledgebaseId)
		if (knowledgebase.status === KnowledgebaseStatusEnum.REBUILDING) {
			throw new BadRequestException('Embedding rebuild is running')
		}
	}

	private clearPendingEmbeddingModelFields() {
		return {
			pendingCopilotModel: null,
			pendingCopilotModelId: null,
			pendingEmbeddingCollectionName: null,
			pendingEmbeddingModelFingerprint: null,
			pendingEmbeddingDimensions: null,
			pendingEmbeddingRevision: null,
			rebuildTaskId: null,
			embeddingRebuildError: null
		}
	}

	async cancelPendingEmbeddingModel(id: string) {
		const knowledgebase = await this.findOne(id, {
			relations: this.getPendingVectorStoreRelations()
		})
		if (knowledgebase.status === KnowledgebaseStatusEnum.REBUILDING) {
			throw new BadRequestException('Embedding rebuild is running')
		}

		assign(knowledgebase, {
			...this.clearPendingEmbeddingModelFields(),
			status: KnowledgebaseStatusEnum.READY
		})
		return this.save(knowledgebase)
	}

	async startEmbeddingRebuild(id: string) {
		const knowledgebase = await this.findOne(id, {
			relations: [
				'copilotModel',
				'copilotModel.copilot',
				'copilotModel.copilot.modelProvider',
				...this.getPendingVectorStoreRelations()
			]
		})

		if (knowledgebase.status === KnowledgebaseStatusEnum.REBUILDING) {
			throw new BadRequestException('Embedding rebuild is already running')
		}
		if (!knowledgebase.pendingCopilotModel || !knowledgebase.pendingEmbeddingModelFingerprint) {
			throw new BadRequestException('Pending embedding model is required for rebuild')
		}

		if (knowledgebase.pendingEmbeddingModelFingerprint === knowledgebase.embeddingModelFingerprint) {
			assign(knowledgebase, {
				...this.clearPendingEmbeddingModelFields(),
				status: KnowledgebaseStatusEnum.READY
			})
			return this.save(knowledgebase)
		}

		if (
			knowledgebase.status !== KnowledgebaseStatusEnum.REBUILD_REQUIRED &&
			knowledgebase.status !== KnowledgebaseStatusEnum.REBUILD_FAILED
		) {
			throw new BadRequestException(`Embedding rebuild cannot start from status '${knowledgebase.status ?? KnowledgebaseStatusEnum.READY}'`)
		}

		const rebuildTaskId = shortuuid()
		const pendingEmbeddingRevision = (knowledgebase.pendingEmbeddingRevision ?? knowledgebase.embeddingRevision ?? 0) + 1
		assign(knowledgebase, {
			status: KnowledgebaseStatusEnum.REBUILDING,
			rebuildTaskId,
			pendingEmbeddingRevision,
			embeddingRebuildError: null
		})
		const saved = await this.save(knowledgebase)

		await this.rebuildQueue.add({
			userId: RequestContext.currentUserId(),
			tenantId: knowledgebase.tenantId,
			organizationId: knowledgebase.organizationId,
			knowledgebaseId: id,
			rebuildTaskId,
			pendingEmbeddingRevision
		})

		return saved
	}

	private assertCurrentRebuildTask(
		knowledgebase: IKnowledgebase,
		rebuildTaskId: string,
		pendingEmbeddingRevision: number
	) {
		if (
			knowledgebase.status !== KnowledgebaseStatusEnum.REBUILDING ||
			knowledgebase.rebuildTaskId !== rebuildTaskId ||
			knowledgebase.pendingEmbeddingRevision !== pendingEmbeddingRevision
		) {
			throw new BadRequestException('Embedding rebuild task is stale')
		}
	}

	async processEmbeddingRebuildJob(data: TKnowledgebaseRebuildEmbeddingJob) {
		const knowledgebase = await this.findOne(data.knowledgebaseId, {
			relations: this.getPendingVectorStoreRelations()
		})
		this.assertCurrentRebuildTask(knowledgebase, data.rebuildTaskId, data.pendingEmbeddingRevision)

		const vectorStore = await this.getPendingVectorStoreForRebuild(knowledgebase)
		await vectorStore.clear()

		const chunkRepository = this.dataSource.getRepository(KnowledgeDocumentChunk)
		const chunks = await chunkRepository.find({
			where: {
				knowledgebaseId: data.knowledgebaseId
			},
			relations: ['parent'],
			order: {
				createdAt: 'ASC'
			}
		})

		const embeddingChunks = await this.documentService.findAllEmbeddingNodes({ chunks } as IKnowledgeDocument)
		const missingContent = embeddingChunks.find((chunk) => !chunk.pageContent)
		if (missingContent) {
			throw new BadRequestException(`Chunk '${missingContent.id}' has no pageContent for embedding rebuild`)
		}

		const batchSize = knowledgebase.parserConfig?.embeddingBatchSize || 10
		let count = 0
		while (batchSize * count < embeddingChunks.length) {
			const batch = embeddingChunks.slice(batchSize * count, batchSize * (count + 1))
			await vectorStore.addKnowledgeChunks(batch, {
				ids: batch.map((chunk) => chunk.id)
			})
			count++
		}

		return this.promoteEmbeddingRebuild(data.knowledgebaseId, data.rebuildTaskId, data.pendingEmbeddingRevision)
	}

	async markEmbeddingRebuildFailed(data: TKnowledgebaseRebuildEmbeddingJob, error: string) {
		const knowledgebase = await this.findOne(data.knowledgebaseId)
		if (
			knowledgebase.rebuildTaskId !== data.rebuildTaskId ||
			knowledgebase.pendingEmbeddingRevision !== data.pendingEmbeddingRevision
		) {
			this.#logger.warn(`Skip stale embedding rebuild failure for knowledgebase '${data.knowledgebaseId}'`)
			return knowledgebase
		}

		return this.update(data.knowledgebaseId, {
			status: KnowledgebaseStatusEnum.REBUILD_FAILED,
			embeddingRebuildError: error
		})
	}

	private async promoteEmbeddingRebuild(
		knowledgebaseId: string,
		rebuildTaskId: string,
		pendingEmbeddingRevision: number
	) {
		let oldCollectionName: string | null = null
		let oldCopilotModel: TEmbeddingCopilotModel | null = null
		let promotedCollectionName: string | null = null

		const promoted = await this.dataSource.transaction(async (manager) => {
			const knowledgebaseRepository = manager.getRepository(Knowledgebase)
			const knowledgebase = await knowledgebaseRepository.findOne({
				where: { id: knowledgebaseId },
				relations: [
					'copilotModel',
					'copilotModel.copilot',
					'copilotModel.copilot.modelProvider',
					...this.getPendingVectorStoreRelations()
				]
			})
			if (!knowledgebase) {
				throw new NotFoundException(`Knowledgebase '${knowledgebaseId}' not found`)
			}
			this.assertCurrentRebuildTask(knowledgebase, rebuildTaskId, pendingEmbeddingRevision)
			if (!knowledgebase.pendingCopilotModel || !knowledgebase.pendingEmbeddingCollectionName) {
				throw new BadRequestException('Pending embedding model is required for promote')
			}

			oldCollectionName = knowledgebase.embeddingCollectionName ?? null
			oldCopilotModel = knowledgebase.copilotModel ?? null
			promotedCollectionName = knowledgebase.pendingEmbeddingCollectionName

			assign(knowledgebase, {
				copilotModel: knowledgebase.pendingCopilotModel,
				copilotModelId: knowledgebase.pendingCopilotModelId,
				embeddingCollectionName: knowledgebase.pendingEmbeddingCollectionName,
				embeddingModelFingerprint: knowledgebase.pendingEmbeddingModelFingerprint,
				embeddingDimensions: knowledgebase.pendingEmbeddingDimensions,
				embeddingRevision: knowledgebase.pendingEmbeddingRevision,
				...this.clearPendingEmbeddingModelFields(),
				status: KnowledgebaseStatusEnum.READY
			})

			const saved = await knowledgebaseRepository.save(knowledgebase)
			const chunkRepository = manager.getRepository(KnowledgeDocumentChunk)
			const chunks = await chunkRepository.find({
				where: {
					knowledgebaseId
				}
			})
			chunks.forEach((chunk) => {
				chunk.metadata ??= {} as TDocChunkMetadata
				chunk.metadata.model = this.getEmbeddingModelName(saved.copilotModel)
				chunk.metadata.provider = this.getEmbeddingProviderName(saved.copilotModel)
				chunk.metadata.embeddingModelFingerprint = saved.embeddingModelFingerprint
				chunk.metadata.embeddingDimensions = saved.embeddingDimensions
				chunk.metadata.embeddingRevision = saved.embeddingRevision
			})
			if (chunks.length) {
				await chunkRepository.save(chunks)
			}

			return saved
		})

		if (oldCollectionName && oldCollectionName !== promotedCollectionName) {
			this.cleanupEmbeddingCollection(promoted, oldCopilotModel, oldCollectionName).catch((error) => {
				this.#logger.warn(`Failed to cleanup old embedding collection '${oldCollectionName}': ${getErrorMessage(error)}`)
			})
		}

		return promoted
	}

	private async cleanupEmbeddingCollection(
		knowledgebase: IKnowledgebase,
		copilotModel: TEmbeddingCopilotModel | null,
		collectionName: string
	) {
		const vectorStore = await this.createVectorStoreForModel({
			knowledgebase,
			copilotModel,
			collectionName,
			requiredEmbeddings: false,
			rerankEnabled: false,
			embeddingMetadata: {
				provider: this.getEmbeddingProviderName(copilotModel),
				model: this.getEmbeddingModelName(copilotModel),
				embeddingModelFingerprint: knowledgebase.embeddingModelFingerprint ?? null,
				embeddingDimensions: knowledgebase.embeddingDimensions ?? null,
				embeddingRevision: knowledgebase.embeddingRevision ?? null,
				vectorIdCollectionName: collectionName
			}
		})
		await vectorStore.clear()
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
		const triggerKey = genXpertTriggerKey()
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
						key: triggerKey,
						type: 'workflow',
						position: { x: 20, y: 320 },
						entity: {
							key: triggerKey,
							title: 'Trigger',
							type: WorkflowNodeTypeEnum.TRIGGER,
							from: 'chat'
						} as IWFNTrigger
					},
					{
						key: sourceKey,
						type: 'workflow',
						position: { x: 300, y: 320 },
						entity: {
							key: sourceKey,
							title: 'Documents Source',
							type: WorkflowNodeTypeEnum.SOURCE,
							provider: 'local-file'
						} as IWFNSource
					},
					{
						key: knowledgebaseKey,
						type: 'workflow',
						position: { x: 680, y: 320 },
						entity: {
							key: knowledgebaseKey,
							title: 'Knowledge Base',
							type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
							structure: KnowledgeStructureEnum.General,
						} as IWFNKnowledgeBase
					}
				],
				connections: [
					{
						type: 'edge',
						key: `${triggerKey}/${sourceKey}`,
						from: triggerKey,
						to: sourceKey
					}
				]
			}
		})
	}

	async getVisionModel(knowledgebaseId: string, visionModel: TCopilotModel) {
		if (!visionModel) {
			const knowledgebase = await this.findOne(knowledgebaseId, { relations: ['visionModel', 'visionModel.copilot'] })
			visionModel = knowledgebase.visionModel
		}
		// Workflow nodes usually persist only copilotId, not the eager-loaded copilot relation.
		if (!visionModel?.copilot && !visionModel?.copilotId) {
			throw new BadRequestException(t('server-ai:Error.KBReqVisionModel'))
		}
		const chatModel = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
			new CopilotModelGetChatModelQuery(visionModel?.copilot ?? null, visionModel, {
				usageCallback: (token) => {
					// execution.tokens += (token ?? 0)
				}
			})
		)

		return chatModel
	}

	private getActiveVectorStoreRelations(requiredEmbeddings: boolean) {
		return requiredEmbeddings
			? [
					'rerankModel',
					'rerankModel.copilot',
					'rerankModel.copilot.modelProvider',
					'copilotModel',
					'copilotModel.copilot',
					'copilotModel.copilot.modelProvider',
					'documents'
				]
			: ['copilotModel', 'copilotModel.copilot', 'copilotModel.copilot.modelProvider']
	}

	private getPendingVectorStoreRelations() {
		return [
			'pendingCopilotModel',
			'pendingCopilotModel.copilot',
			'pendingCopilotModel.copilot.modelProvider'
		]
	}

	private async findKnowledgebaseForActiveVectorStore(knowledgebaseId: IKnowledgebase | string, requiredEmbeddings: boolean) {
		let knowledgebase: IKnowledgebase
		if (typeof knowledgebaseId === 'string') {
			knowledgebase = await this.findOne(knowledgebaseId, {
				relations: this.getActiveVectorStoreRelations(requiredEmbeddings)
			})
		} else {
			knowledgebase = knowledgebaseId
		}

		return knowledgebase
	}

	private async findKnowledgebaseForPendingVectorStore(knowledgebaseId: IKnowledgebase | string) {
		if (typeof knowledgebaseId === 'string') {
			return this.findOne(knowledgebaseId, {
				relations: this.getPendingVectorStoreRelations()
			})
		}

		return knowledgebaseId
	}

	private async ensureCopilotModel(model: TEmbeddingCopilotModel | null | undefined) {
		if (!model) {
			return null
		}

		if (model.copilot?.modelProvider || !model.copilotId) {
			return model
		}

		const copilot = await this.queryBus.execute(
			new CopilotGetOneQuery(RequestContext.currentTenantId(), model.copilotId, ['modelProvider'])
		)
		return {
			...model,
			copilot
		}
	}

	private getEmbeddingModelName(copilotModel: TEmbeddingCopilotModel | null | undefined) {
		return copilotModel?.model || copilotModel?.copilot?.copilotModel?.model || null
	}

	private getEmbeddingProviderName(copilotModel: TEmbeddingCopilotModel | null | undefined) {
		return copilotModel?.copilot?.modelProvider?.providerName ?? copilotModel?.copilot?.modelProvider?.providerType ?? null
	}

	private resolveConfiguredEmbeddingDimensions(copilotModel: TEmbeddingCopilotModel | null | undefined) {
		const dimensions = copilotModel?.options?.dimensions
		if (typeof dimensions === 'number') {
			return dimensions
		}

		const dimension = copilotModel?.options?.dimension
		return typeof dimension === 'number' ? dimension : null
	}

	private async resolveEmbeddingDimensions(copilotModel: TEmbeddingCopilotModel) {
		const configuredDimensions = this.resolveConfiguredEmbeddingDimensions(copilotModel)
		if (configuredDimensions) {
			return configuredDimensions
		}

		const copilot = copilotModel.copilot
		if (!copilot) {
			throw new CopilotNotFoundException(`Copilot not set for embedding model '${this.getEmbeddingModelName(copilotModel)}'`)
		}

		const embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
			new CopilotModelGetEmbeddingsQuery(copilot, copilotModel as TCopilotModel, {
				tokenCallback: () => {
					//
				}
			})
		)
		const probe = await embeddings.embedQuery('xpert embedding dimension probe')
		return probe.length
	}

	private async resolveEmbeddingModelTarget(
		knowledgebaseId: string,
		copilotModel: TEmbeddingCopilotModel | null,
		copilotModelId?: string | null
	): Promise<TResolvedEmbeddingModelTarget> {
		const resolvedModel = await this.ensureCopilotModel(copilotModel)
		if (!resolvedModel) {
			throw new BadRequestException('Embedding model is required')
		}

		const dimensions = await this.resolveEmbeddingDimensions(resolvedModel)
		const fingerprint = createEmbeddingFingerprint({
			provider: this.getEmbeddingProviderName(resolvedModel),
			model: this.getEmbeddingModelName(resolvedModel),
			dimensions,
			options: resolvedModel.options ?? null,
			providerConfig: {
				providerId: resolvedModel.copilot?.modelProvider?.id ?? null,
				providerName: resolvedModel.copilot?.modelProvider?.providerName ?? null,
				providerType: resolvedModel.copilot?.modelProvider?.providerType ?? null,
				options: resolvedModel.copilot?.modelProvider?.options ?? null
			}
		})

		return {
			copilotModel: resolvedModel,
			copilotModelId: copilotModelId ?? resolvedModel.id ?? null,
			collectionName: createEmbeddingCollectionName(knowledgebaseId, fingerprint),
			fingerprint,
			dimensions
		}
	}

	async resolveEmbeddingModelTargetForComparison(
		knowledgebaseId: string,
		copilotModel: TEmbeddingCopilotModel | null,
		copilotModelId?: string | null
	) {
		return this.resolveEmbeddingModelTarget(knowledgebaseId, copilotModel, copilotModelId)
	}

	private async ensureLegacyActiveEmbeddingState(knowledgebase: IKnowledgebase, requiredEmbeddings: boolean) {
		if (!requiredEmbeddings || knowledgebase.embeddingCollectionName || !knowledgebase.copilotModel) {
			return
		}

		const target = await this.resolveEmbeddingModelTarget(
			knowledgebase.id,
			knowledgebase.copilotModel,
			knowledgebase.copilotModelId
		)
		const patch: Partial<Knowledgebase> = {
			embeddingCollectionName: knowledgebase.id,
			embeddingModelFingerprint: target.fingerprint,
			embeddingDimensions: target.dimensions,
			embeddingRevision: knowledgebase.embeddingRevision ?? 1,
			status: (knowledgebase.status as KnowledgebaseStatusEnum) ?? KnowledgebaseStatusEnum.READY
		}
		await this.repository.update(knowledgebase.id, patch)
		assign(knowledgebase, patch)
	}

	private async createVectorStoreForModel(options: {
		knowledgebase: IKnowledgebase
		copilotModel: TEmbeddingCopilotModel | null | undefined
		collectionName: string
		requiredEmbeddings: boolean
		rerankEnabled: boolean
		embeddingMetadata: TEmbeddingVectorMetadata
	}) {
		const { knowledgebase, collectionName, requiredEmbeddings, rerankEnabled, embeddingMetadata } = options
		const copilotModel = await this.ensureCopilotModel(options.copilotModel)
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
				new CopilotModelGetEmbeddingsQuery(copilot, copilotModel as TCopilotModel, {
					tokenCallback: (token) => {
						// execution.tokens += (token ?? 0)
					}
				})
			)
		}

		if (requiredEmbeddings && !embeddings) {
			throw new AiModelNotFoundException(
				`Embeddings model '${this.getEmbeddingModelName(copilotModel)}' not found for knowledgebase '${knowledgebase.name}'`
			)
		}

		let rerankModel: IRerank = null
		if (rerankEnabled && knowledgebase.rerankModel) {
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
				collectionName
			})
		)
		const vStore = new KnowledgeDocumentStore(
			{
				...knowledgebase,
				copilotModel: copilotModel as TCopilotModel,
				copilotModelId: copilotModel?.id ?? knowledgebase.copilotModelId
			},
			store,
			rerankModel,
			embeddingMetadata
		)

		// const vectorStore = new KnowledgeDocumentVectorStore(knowledgebase, this.pgPool, embeddings, rerankModel)

		// // Create table for vector store if not exist
		// await vectorStore.ensureTableInDatabase()

		return vStore
	}

	async getActiveVectorStore(knowledgebaseId: IKnowledgebase | string, requiredEmbeddings = false) {
		const knowledgebase = await this.findKnowledgebaseForActiveVectorStore(knowledgebaseId, requiredEmbeddings)
		await this.ensureLegacyActiveEmbeddingState(knowledgebase, requiredEmbeddings)
		const copilotModel = knowledgebase.copilotModel
		const collectionName = knowledgebase.embeddingCollectionName ?? knowledgebase.id
		return this.createVectorStoreForModel({
			knowledgebase,
			copilotModel,
			collectionName,
			requiredEmbeddings,
			rerankEnabled: true,
			embeddingMetadata: {
				provider: this.getEmbeddingProviderName(copilotModel),
				model: this.getEmbeddingModelName(copilotModel),
				embeddingModelFingerprint: knowledgebase.embeddingModelFingerprint ?? null,
				embeddingDimensions: knowledgebase.embeddingDimensions ?? null,
				embeddingRevision: knowledgebase.embeddingRevision ?? null,
				vectorIdCollectionName: collectionName
			}
		})
	}

	async getPendingVectorStoreForRebuild(knowledgebaseId: IKnowledgebase | string) {
		const knowledgebase = await this.findKnowledgebaseForPendingVectorStore(knowledgebaseId)
		if (!knowledgebase.pendingCopilotModel || !knowledgebase.pendingEmbeddingCollectionName) {
			throw new BadRequestException('Pending embedding model is required for rebuild')
		}

		return this.createVectorStoreForModel({
			knowledgebase,
			copilotModel: knowledgebase.pendingCopilotModel,
			collectionName: knowledgebase.pendingEmbeddingCollectionName,
			requiredEmbeddings: true,
			rerankEnabled: false,
			embeddingMetadata: {
				provider: this.getEmbeddingProviderName(knowledgebase.pendingCopilotModel),
				model: this.getEmbeddingModelName(knowledgebase.pendingCopilotModel),
				embeddingModelFingerprint: knowledgebase.pendingEmbeddingModelFingerprint ?? null,
				embeddingDimensions: knowledgebase.pendingEmbeddingDimensions ?? null,
				embeddingRevision: knowledgebase.pendingEmbeddingRevision ?? null,
				vectorIdCollectionName: knowledgebase.pendingEmbeddingCollectionName
			}
		})
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
				return this.getActiveVectorStore(kb.id, true).then((vectorStore) => {
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

	// Pipeline

	/**
	 * Create a new task for a knowledgebase.
	 * If the task status is running, start immediately.
	 */
	async createTask(knowledgebaseId: string, task: Partial<IKnowledgebaseTask>) {
		if (task.status === 'running') {
			await this.assertNotRebuilding(knowledgebaseId)
		}
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
	async processTask(knowledgebaseId: string, taskId: string, inputs: { sources?: { [key: string]: { documents: string[] } }; stage: 'preview' | 'prod'; options?: any; isDraft?: boolean }) {
		await this.assertNotRebuilding(knowledgebaseId)
		const kb = await this.findOne(knowledgebaseId, { relations: ['pipeline'] })
		const execution = await this.commandBus.execute(
					new XpertAgentExecutionUpsertCommand({
						// threadId: conversation.threadId,
						status: XpertAgentExecutionStatusEnum.RUNNING
					})
				)
		await this.taskService.update(taskId, { status: 'running', executionId: execution.id })
		const sources = inputs.sources ? Object.keys(inputs.sources) : null

		await this.commandBus.execute(
			new XpertEnqueueTriggerDispatchCommand(kb.pipelineId, RequestContext.currentUserId(), {
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
			}, {
				isDraft: inputs.isDraft,
				from: 'knowledge',
				executionId: execution.id
			})
		)
	}

	async previewFile(id: string, filePath: string) {
		const extension = filePath.split('.').pop().toLowerCase()
		try {
			const results = await this.transformDocuments(id, {provider: 'default', config: {}} as IWFNProcessor, false, [
				{
					filePath,
					name: filePath.split('/').pop(),
					type: extension,
					category: classificateDocumentCategory({type: extension})
				}
			])
			return results[0].chunks
		} catch (error) {
			throw new InternalServerErrorException(getErrorMessage(error))
		}
	}

	async transformDocuments(knowledgebaseId: string, entity: IWFNProcessor, isDraft: boolean, input: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>[]) {
		const strategy = this.docTransformerRegistry.get(entity.provider) 
		
		const permissions = await this.commandBus.execute(new PluginPermissionsCommand(strategy.permissions, {
			knowledgebaseId: knowledgebaseId,
			integrationId: entity.integrationId,
			folder: ''
		}))
		
		const results = await strategy.transformDocuments(input, {
			...(entity.config ?? {}),
			stage: isDraft ? 'test' : 'prod',
			tempDir: (
				await this.volumeClient
					.resolve({
						tenantId: RequestContext.currentTenantId(),
						catalog: 'knowledges',
						userId: RequestContext.currentUserId(),
						knowledgeId: knowledgebaseId
					})
					.ensureRoot()
			).path('tmp'),
			permissions
		})

		return results
	}
}
