import { Embeddings } from '@langchain/core/embeddings'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import {
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
    KnowledgeDocumentProcessingMode,
    KDocumentSourceType,
    IUser,
    IModelAccessResolution,
    TKBRetrievalSettings,
    KnowledgeFilterSources,
    KnowledgeGraphStatus,
    KNOWLEDGE_PROCESSING_MODE_NAME,
    KBMetadataFieldDef,
    MetadataFieldType,
    KnowledgeFilterJSONValue
} from '@xpert-ai/contracts'
import { getErrorMessage, shortuuid } from '@xpert-ai/server-common'
import { IntegrationService, PaginationParams, RequestContext } from '@xpert-ai/server-core'
import { InjectQueue } from '@nestjs/bull'
import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException
} from '@nestjs/common'
import { Queue } from 'bull'
import { InjectRepository } from '@nestjs/typeorm'
import {
    DocumentSourceRegistry,
    DocumentTransformerRegistry,
    ImageUnderstandingRegistry,
    IRerank,
    KnowledgeStrategyRegistry,
    TextSplitterRegistry
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { assign } from 'lodash'
import { I18nService } from 'nestjs-i18n'
import path from 'node:path'
import {
    DataSource,
    DeleteResult,
    FindOptionsSelect,
    FindOneOptions,
    FindOptionsWhere,
    In,
    IsNull,
    Not,
    QueryFailedError,
    Repository,
    SaveOptions
} from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
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
import { KnowledgeSearchResult } from './queries/knowledge-search.query'
import { KnowledgebaseTask, KnowledgebaseTaskService } from './task'
import { KnowledgeDocumentStore, TEmbeddingVectorMetadata } from './vector-store'
import { KnowledgeWorkAreaResolver } from '../shared/volume/work-area'
import { VolumeSubtreeClient } from '../shared/volume/volume-subtree'
import { KnowledgeDocumentService } from '../knowledge-document/document.service'
import { KnowledgeDocumentChunk } from '../knowledge-document/chunk/chunk.entity'
import { TDocChunkMetadata } from '../knowledge-document/types'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution'
import { PluginPermissionsCommand } from './commands'
import { XpertEnqueueTriggerDispatchCommand, XpertPublishTriggersCommand } from '../xpert/commands'
import { JOB_REBUILD_KNOWLEDGEBASE_EMBEDDING, TKnowledgebaseRebuildEmbeddingJob } from './types'
import { KnowledgebaseDetailDTO } from './dto'
import { KnowledgeFilterFieldDefinition } from './filter'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries'

type TEmbeddingCopilotModel = Partial<TCopilotModel> & { id?: string }
type TKnowledgebaseModelContext = {
    xpertId?: string
    threadId?: string
}

function escapeKnowledgeFilterOptionLike(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

const KNOWLEDGEBASE_DETAIL_RELATIONS = ['copilotModel', 'chatModel', 'rerankModel', 'visionModel', 'xperts', 'pipeline']

const KNOWLEDGEBASE_SAFE_READ_RELATIONS = new Set(['createdBy'])

const KNOWLEDGEBASE_TASK_RELATIONS = new Set(['documents'])

function knowledgebaseTaskAccessDenied() {
    return new ForbiddenException(
        t('server-ai:Error.KnowledgebaseTaskAccessDenied', {
            defaultValue: 'You do not have access to this knowledgebase task'
        })
    )
}

function knowledgebaseAccessDenied() {
    return new ForbiddenException(
        t('server-ai:Error.KnowledgebaseAccessDenied', {
            defaultValue: 'You do not have access to this knowledgebase'
        })
    )
}

function assertSafeKnowledgebaseTaskRelations(relations: unknown): asserts relations is string[] | undefined {
    if (relations === undefined) {
        return
    }

    if (
        !Array.isArray(relations) ||
        relations.some((relation) => typeof relation !== 'string' || !KNOWLEDGEBASE_TASK_RELATIONS.has(relation))
    ) {
        throw knowledgebaseTaskAccessDenied()
    }
}

const KNOWLEDGEBASE_MODEL_DETAIL_SELECT = {
    id: true,
    modelType: true,
    model: true,
    copilotId: true,
    referencedId: true,
    options: true
}

const KNOWLEDGEBASE_DETAIL_SELECT: FindOptionsSelect<Knowledgebase> = {
    id: true,
    name: true,
    type: true,
    structure: true,
    language: true,
    avatar: true,
    description: true,
    applicationTags: true,
    permission: true,
    copilotModelId: true,
    chatModelId: true,
    rerankModelId: true,
    visionModelId: true,
    documentNum: true,
    tokenNum: true,
    chunkNum: true,
    recall: true,
    parserConfig: true,
    status: true,
    embeddingRebuildError: true,
    metadataSchema: true,
    apiEnabled: true,
    incrementalSyncEnabled: true,
    graphRag: true,
    graphStatus: true,
    graphRevision: true,
    graphIndexError: true,
    workspaceId: true,
    pipelineId: true,
    integrationId: true,
    copilotModel: KNOWLEDGEBASE_MODEL_DETAIL_SELECT,
    chatModel: KNOWLEDGEBASE_MODEL_DETAIL_SELECT,
    rerankModel: KNOWLEDGEBASE_MODEL_DETAIL_SELECT,
    visionModel: KNOWLEDGEBASE_MODEL_DETAIL_SELECT,
    xperts: {
        id: true,
        slug: true,
        name: true,
        description: true
    },
    pipeline: {
        id: true,
        publishAt: true,
        version: true
    }
}

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

    @Inject(KnowledgeWorkAreaResolver)
    private readonly knowledgeWorkAreaResolver: KnowledgeWorkAreaResolver

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
    async getAllByWorkspace(
        workspaceId: string,
        data: Partial<PaginationParams<Knowledgebase>> | undefined,
        published: boolean,
        user: IUser
    ) {
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
                whereConditions.forEach((condition) => {
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
        const input = { ...entity }
        delete input.id
        delete input.createdById
        delete input.createdBy
        delete input.updatedById
        delete input.updatedBy
        delete input.tenantId
        delete input.tenant
        delete input.organizationId
        delete input.organization
        delete input.createdAt
        delete input.updatedAt
        delete input.deletedAt

        // Check name
        const exist = await super.findOneOrFailByOptions({
            where: { name: input.name }
        })
        if (exist.success) {
            throw new BadRequestException(
                this.i18nService.t('xpert.Error.NameExists', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                })
            )
        }

        if (Object.prototype.hasOwnProperty.call(input, 'metadataSchema')) {
            input.metadataSchema = this.validateAndNormalizeMetadataSchema(input.metadataSchema)
        }
        if (Object.prototype.hasOwnProperty.call(input, 'applicationTags')) {
            input.applicationTags = this.normalizeApplicationTags(input.applicationTags)
        }
        return await super.create(input)
    }

    async findOneByIdString(id: string, options?: FindOneOptions<Knowledgebase>): Promise<Knowledgebase> {
        const accessSelect = addKnowledgebaseAccessSelect(options)
        const knowledgebase = await super.findOneByIdString(id, accessSelect.options)
        this.assertKnowledgebaseCrudReadAccess(knowledgebase)
        return stripKnowledgebaseAccessSelect(knowledgebase, accessSelect)
    }

    getSafeReadRelations(relations: unknown): string[] | undefined {
        if (relations === undefined) {
            return undefined
        }
        if (
            !Array.isArray(relations) ||
            relations.some(
                (relation) => typeof relation !== 'string' || !KNOWLEDGEBASE_SAFE_READ_RELATIONS.has(relation)
            )
        ) {
            throw knowledgebaseAccessDenied()
        }
        return relations
    }

    async findOneDetail(id: string) {
        const knowledgebase = await this.findOneByIdString(id, {
            relations: KNOWLEDGEBASE_DETAIL_RELATIONS,
            select: KNOWLEDGEBASE_DETAIL_SELECT
        })

        return new KnowledgebaseDetailDTO(knowledgebase)
    }

    async delete(criteria: string | FindOptionsWhere<Knowledgebase>): Promise<DeleteResult> {
        if (typeof criteria !== 'string') {
            return super.delete(criteria)
        }

        const knowledgebase = await this.assertKnowledgebaseWriteAccess(criteria, {
            relations: ['pipeline']
        })
        await this.cleanupPipelineBeforeDelete(knowledgebase)

        return super.delete(criteria)
    }

    async softDelete(criteria: string | number | FindOptionsWhere<Knowledgebase>) {
        if (typeof criteria === 'string') {
            await this.assertKnowledgebaseWriteAccess(criteria)
        }
        return super.softDelete(criteria)
    }

    async softRemove(id: Knowledgebase['id'], options?: FindOneOptions<Knowledgebase>, saveOptions?: SaveOptions) {
        await this.assertKnowledgebaseWriteAccess(id, options)
        return super.softRemove(id, options, saveOptions)
    }

    async softRecover(id: Knowledgebase['id'], options?: FindOneOptions<Knowledgebase>, saveOptions?: SaveOptions) {
        await this.assertKnowledgebaseWriteAccess(id, options)
        return super.softRecover(id, options, saveOptions)
    }

    private async cleanupPipelineBeforeDelete(knowledgebase: Knowledgebase): Promise<void> {
        const pipeline = knowledgebase.pipeline
        if (!pipeline?.id) {
            return
        }

        if (pipeline.publishAt && pipeline.graph?.nodes?.length) {
            await this.commandBus.execute(
                new XpertPublishTriggersCommand(
                    {
                        ...pipeline,
                        graph: {
                            nodes: [],
                            connections: []
                        }
                    },
                    {
                        strict: false,
                        previousGraph: pipeline.graph
                    }
                )
            )
        }

        await this.xpertService.updateXpert(pipeline.id, {
            active: false,
            publishAt: null,
            deletedAt: new Date()
        })
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
    // Isolate TypeORM's recursive update type; business callers use the shallow method to keep ts-node inference bounded.
    async update(id: string, entity: QueryDeepPartialEntity<Knowledgebase> & Partial<Knowledgebase>) {
        return this.updateKnowledgebase(id, entity)
    }

    async updateKnowledgebase(id: string, entity: Partial<Knowledgebase>) {
        const _entity = await this.assertKnowledgebaseWriteAccess(id, {
            relations: [
                'copilotModel',
                'copilotModel.copilot',
                'copilotModel.copilot.modelProvider',
                'chatModel',
                'chatModel.copilot',
                'chatModel.copilot.modelProvider',
                'pendingCopilotModel',
                'pendingCopilotModel.copilot',
                'pendingCopilotModel.copilot.modelProvider'
            ]
        })
        const changes = { ...entity }
        delete changes.id
        delete changes.tenantId
        delete changes.tenant
        delete changes.organizationId
        delete changes.organization
        delete changes.createdById
        delete changes.createdBy
        delete changes.updatedById
        delete changes.updatedBy
        delete changes.createdAt
        delete changes.updatedAt
        delete changes.deletedAt
        if (changes.workspaceId && changes.workspaceId !== _entity.workspaceId) {
            throw new BadRequestException('workspaceId cannot be changed after a knowledgebase is created')
        }
        delete changes.workspaceId
        if (
            Object.prototype.hasOwnProperty.call(changes, 'workspace') &&
            (changes.workspace?.id ?? null) !== (_entity.workspaceId ?? null)
        ) {
            throw new BadRequestException('workspace cannot be changed after a knowledgebase is created')
        }
        delete changes.workspace

        // Check name uniqueness if name is being changed
        if (changes.name && changes.name !== _entity.name) {
            const tenantId = RequestContext.currentTenantId()
            const organizationId = RequestContext.getOrganizationId()

            // Check if another knowledgebase with the same name exists (excluding current one)
            const exist = await this.repository.findOne({
                where: {
                    tenantId,
                    organizationId,
                    name: changes.name,
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
            if (Object.prototype.hasOwnProperty.call(changes, 'metadataSchema')) {
                changes.metadataSchema = this.validateAndNormalizeMetadataSchema(changes.metadataSchema)
            }
            if (Object.prototype.hasOwnProperty.call(entity, 'applicationTags')) {
                entity.applicationTags = this.normalizeApplicationTags(entity.applicationTags)
            }
            const hasCopilotModel = Object.prototype.hasOwnProperty.call(entity, 'copilotModel')
            const hasCopilotModelId = Object.prototype.hasOwnProperty.call(entity, 'copilotModelId')
            const hasEmbeddingModelChange = hasCopilotModel || hasCopilotModelId
            let embeddingPatch: Partial<Knowledgebase> = {}
            if (hasEmbeddingModelChange) {
                if (_entity.status === KnowledgebaseStatusEnum.REBUILDING) {
                    throw new BadRequestException('Embedding rebuild is running')
                }
                if (!hasCopilotModel && changes.copilotModelId !== _entity.copilotModelId) {
                    throw new BadRequestException('copilotModel is required when changing embedding model')
                }
                if (hasCopilotModel) {
                    const target = await this.resolveEmbeddingModelTarget(
                        id,
                        changes.copilotModel ?? null,
                        changes.copilotModelId ?? null
                    )
                    embeddingPatch = resolveEmbeddingModelUpdateState(_entity, target) as Partial<Knowledgebase>
                }
            }
            if (Object.prototype.hasOwnProperty.call(changes, 'graphRag')) {
                const nextGraphEnabled = changes.graphRag?.enabled === true
                const currentGraphEnabled = _entity.graphRag?.enabled === true
                if (!nextGraphEnabled) {
                    changes.graphStatus = KnowledgeGraphStatus.DISABLED
                    changes.graphIndexError = null
                } else if (!currentGraphEnabled || _entity.graphStatus === KnowledgeGraphStatus.DISABLED) {
                    changes.graphStatus = KnowledgeGraphStatus.REBUILD_REQUIRED
                    changes.graphIndexError = null
                }
            }
            assign(_entity, changes, embeddingPatch)
            _entity.updatedById = RequestContext.currentUserId()
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
                if (
                    errorCode === '23505' ||
                    errorCode === 1062 ||
                    error.message?.includes('duplicate key') ||
                    error.message?.includes('UNIQUE constraint') ||
                    error.message?.includes('Duplicate entry')
                ) {
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

    /**
     * Normalizes machine-readable application classifications at the write
     * boundary. Limits prevent unbounded JSON metadata while preserving stable
     * exact-match tags for plugin discovery.
     */
    private normalizeApplicationTags(value: unknown): string[] {
        if (!Array.isArray(value)) return []
        return [
            ...new Set(
                value
                    .filter((item): item is string => typeof item === 'string')
                    .map((item) => item.trim())
                    .filter(Boolean)
            )
        ].slice(0, 32)
    }

    private validateAndNormalizeMetadataSchema(schema?: KBMetadataFieldDef[] | null): KBMetadataFieldDef[] {
        if (schema == null) return []
        if (!Array.isArray(schema) || schema.length > 100) {
            throw new BadRequestException('Metadata schema must contain at most 100 fields.')
        }
        const allowedTypes = new Set<MetadataFieldType>([
            'string',
            'number',
            'boolean',
            'enum',
            'datetime',
            'string[]',
            'number[]',
            'object'
        ])
        const keys = new Set<string>()
        return schema.map((definition, index) => {
            if (!definition || typeof definition !== 'object') {
                throw new BadRequestException(`Metadata schema field ${index + 1} is invalid.`)
            }
            const key = typeof definition.key === 'string' ? definition.key.trim() : ''
            if (!key || key.length > 128 || !/^[\p{L}\p{N}_-]+$/u.test(key)) {
                throw new BadRequestException(
                    `Metadata field key '${key}' must be 1-128 letters, numbers, underscores or hyphens.`
                )
            }
            if (keys.has(key)) {
                throw new BadRequestException(`Duplicate metadata field key '${key}'.`)
            }
            keys.add(key)
            if (!allowedTypes.has(definition.type)) {
                throw new BadRequestException(`Unsupported metadata type '${definition.type}' for '${key}'.`)
            }
            if (definition.scope !== undefined && !['document', 'chunk'].includes(definition.scope)) {
                throw new BadRequestException(`Unsupported metadata scope '${definition.scope}' for '${key}'.`)
            }
            if (definition.description && definition.description.length > 512) {
                throw new BadRequestException(`Metadata field '${key}' description exceeds 512 characters.`)
            }
            let enumValues: string[] | undefined
            if (definition.type === 'enum') {
                if (!Array.isArray(definition.enumValues) || !definition.enumValues.length) {
                    throw new BadRequestException(`Enum metadata field '${key}' requires enumValues.`)
                }
                if (definition.enumValues.some((value) => typeof value !== 'string')) {
                    throw new BadRequestException(`Enum values for metadata field '${key}' must be strings.`)
                }
                enumValues = [...new Set(definition.enumValues.map((value) => value.trim()))]
                if (
                    enumValues.length > 100 ||
                    enumValues.some((value) => !value || value.length > 512) ||
                    enumValues.length !== definition.enumValues.length
                ) {
                    throw new BadRequestException(`Enum values for metadata field '${key}' are invalid or duplicated.`)
                }
            }
            return {
                ...definition,
                key,
                scope: definition.scope ?? 'document',
                ...(enumValues ? { enumValues } : { enumValues: undefined })
            }
        })
    }

    async getTextSplitterStrategies() {
        return this.textSplitterRegistry.list().map((strategy) => strategy.meta)
    }

    async getDocumentTransformerStrategies() {
        return this.docTransformerRegistry.list().map((strategy) => {
            return {
                meta: strategy.meta,
                integration: strategy.permissions?.find((permission) => permission.type === 'integration')
            }
        })
    }

    async getUnderstandingStrategies() {
        return this.understandingRegistry.list().map((strategy) => ({
            meta: strategy.meta,
            requireVisionModel: strategy.permissions?.some((permission) => permission.type === 'llm')
        }))
    }

    async getDocumentSourceStrategies() {
        return this.docSourceRegistry.list().map((strategy) => ({
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
    async test(
        id: string,
        options: {
            query: string
            k?: number
            score?: number
            filters?: KnowledgeFilterSources
            variables?: Record<string, unknown>
            retrieval?: TKBRetrievalSettings
        }
    ) {
        const knowledgebase = await this.findOne(id)
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()

        const results = await this.queryBus.execute<KnowledgeSearchQuery, KnowledgeSearchResult>(
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

    async countStructuredFilterCandidates(
        knowledgebaseId: string,
        compiled: { sql: string; parameters: unknown[] }
    ): Promise<{ candidateDocumentCount: number; candidateChunkCount: number }> {
        const sql = compiled.sql.replace(/\$(\d+)/g, (_match, index) => `$${Number(index) + 1}`)
        const [row] = await this.dataSource.query(
            `SELECT
                COUNT(DISTINCT d."id")::int AS "candidateDocumentCount",
                COUNT(DISTINCT c."id")::int AS "candidateChunkCount"
             FROM "knowledge_document" d
             INNER JOIN "knowledge_document_chunk" c ON c."documentId" = d."id"
             WHERE d."knowledgebaseId" = $1
               AND c."knowledgebaseId" = $1
               AND COALESCE(d."disabled", FALSE) = FALSE
               AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
               AND (${sql})`,
            [knowledgebaseId, ...compiled.parameters]
        )
        return {
            candidateDocumentCount: Number(row?.candidateDocumentCount ?? 0),
            candidateChunkCount: Number(row?.candidateChunkCount ?? 0)
        }
    }

    /**
     * Returns logical folder paths that contain chunks eligible under a validated
     * fixed filter. The knowledgebase, tenant, and organization predicates are
     * mandatory and values are always bound parameters.
     */
    async listStructuredFilterFolderCandidates(
        knowledgebaseId: string,
        tenantId: string,
        organizationId: string,
        compiled: { sql: string; parameters: unknown[] }
    ): Promise<Array<{ folderPath: string; directDocumentCount: number }>> {
        const sql = compiled.sql.replace(/\$(\d+)/g, (_match, index) => `$${Number(index) + 3}`)
        const rows = await this.dataSource.query(
            `SELECT
                COALESCE(d."folder", '') AS "folderPath",
                COUNT(DISTINCT d."id")::int AS "directDocumentCount"
             FROM "knowledge_document" d
             INNER JOIN "knowledge_document_chunk" c ON c."documentId" = d."id"
             WHERE d."tenantId" IS NOT DISTINCT FROM $1
               AND d."organizationId" IS NOT DISTINCT FROM $2
               AND d."knowledgebaseId" = $3
               AND c."knowledgebaseId" = $3
               AND COALESCE(d."disabled", FALSE) = FALSE
               AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
               AND (${sql})
             GROUP BY COALESCE(d."folder", '')`,
            [tenantId, organizationId, knowledgebaseId, ...compiled.parameters]
        )
        return rows.map((row) => ({
            folderPath: String(row.folderPath ?? ''),
            directDocumentCount: Number(row.directDocumentCount ?? 0)
        }))
    }

    /**
     * Lists distinct live values for one registered filter field. Field identifiers
     * are resolved from the server-side registry; metadata keys and all values are
     * bound parameters.
     */
    async listStructuredFilterValueCandidates(
        knowledgebaseId: string,
        tenantId: string,
        organizationId: string,
        compiled: { sql: string; parameters: unknown[] },
        definition: KnowledgeFilterFieldDefinition,
        options: { search?: string; allowedValues?: string[]; limit: number; offset: number }
    ): Promise<{
        items: Array<{ value: KnowledgeFilterJSONValue; documentCount: number; chunkCount: number }>
        total: number
        statistics: {
            eligibleDocumentCount: number
            eligibleChunkCount: number
            existingDocumentCount: number
            existingChunkCount: number
            min?: KnowledgeFilterJSONValue
            max?: KnowledgeFilterJSONValue
        }
    }> {
        const parameters: unknown[] = [tenantId, organizationId, knowledgebaseId]
        const rawValueExpression = this.structuredFilterOptionValueExpression(definition, parameters)
        const compiledSql = compiled.sql.replace(/\$(\d+)/g, (_match, index) => `$${Number(index) + parameters.length}`)
        parameters.push(...compiled.parameters)

        const searchable = definition.type !== 'object'
        const valuePredicates: string[] = []
        if (definition.type === 'enum' && options.allowedValues?.length) {
            parameters.push(options.allowedValues)
            valuePredicates.push(`(value #>> '{}') = ANY($${parameters.length})`)
        }
        if (searchable && options.search?.trim()) {
            parameters.push(`%${escapeKnowledgeFilterOptionLike(options.search.trim())}%`)
            valuePredicates.push(`(value #>> '{}') ILIKE $${parameters.length} ESCAPE '\\'`)
        }
        const valuePredicateSql = valuePredicates.length ? valuePredicates.join(' AND ') : 'TRUE'
        parameters.push(options.limit)
        const limitParameter = `$${parameters.length}`
        parameters.push(options.offset)
        const offsetParameter = `$${parameters.length}`

        const arrayValue = definition.type === 'string[]' || definition.type === 'number[]'
        const valuesCte =
            definition.type === 'object'
                ? `SELECT "documentId", "chunkId", "rawValue" AS value FROM eligible WHERE FALSE`
                : arrayValue
                  ? `SELECT e."documentId", e."chunkId", item.value
                     FROM eligible e
                     CROSS JOIN LATERAL jsonb_array_elements(
                        CASE WHEN jsonb_typeof(e."rawValue") = 'array' THEN e."rawValue" ELSE '[]'::jsonb END
                     ) item(value)`
                  : `SELECT "documentId", "chunkId", "rawValue" AS value
                     FROM eligible
                     WHERE "rawValue" IS NOT NULL AND "rawValue" <> 'null'::jsonb`
        const sortableValue = (alias: string) =>
            definition.type === 'number' || definition.type === 'number[]'
                ? `(${alias} #>> '{}')::numeric`
                : `${alias} #>> '{}'`
        const rangeStatistics =
            definition.type === 'number' || definition.type === 'number[]' || definition.type === 'datetime'
                ? `,
                   (SELECT MIN(${sortableValue('value')}) FROM values_source) AS "minValue",
                   (SELECT MAX(${sortableValue('value')}) FROM values_source) AS "maxValue"`
                : ''

        const [row] = await this.dataSource.query(
            `WITH eligible AS (
                SELECT
                    d."id" AS "documentId",
                    c."id" AS "chunkId",
                    ${rawValueExpression} AS "rawValue"
                FROM "knowledge_document" d
                INNER JOIN "knowledge_document_chunk" c ON c."documentId" = d."id"
                WHERE d."tenantId" IS NOT DISTINCT FROM $1
                  AND d."organizationId" IS NOT DISTINCT FROM $2
                  AND d."knowledgebaseId" = $3
                  AND c."knowledgebaseId" = $3
                  AND COALESCE(d."disabled", FALSE) = FALSE
                  AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
                  AND (${compiledSql})
            ),
            values_source AS (
                ${valuesCte}
            ),
            grouped AS (
                SELECT
                    value,
                    COUNT(DISTINCT "documentId")::int AS "documentCount",
                    COUNT(DISTINCT "chunkId")::int AS "chunkCount"
                FROM values_source
                WHERE ${valuePredicateSql}
                GROUP BY value
            ),
            page AS (
                SELECT *
                FROM grouped
                ORDER BY ${sortableValue('value')} ASC
                LIMIT ${limitParameter} OFFSET ${offsetParameter}
            )
            SELECT
                COALESCE(
                    (SELECT jsonb_agg(
                        jsonb_build_object(
                            'value', value,
                            'documentCount', "documentCount",
                            'chunkCount', "chunkCount"
                        ) ORDER BY ${sortableValue('value')}
                    ) FROM page),
                    '[]'::jsonb
                ) AS items,
                (SELECT COUNT(*)::int FROM grouped) AS total,
                (SELECT COUNT(DISTINCT "documentId")::int FROM eligible) AS "eligibleDocumentCount",
                (SELECT COUNT(DISTINCT "chunkId")::int FROM eligible) AS "eligibleChunkCount",
                (SELECT COUNT(DISTINCT "documentId")::int FROM eligible WHERE "rawValue" IS NOT NULL) AS "existingDocumentCount",
                (SELECT COUNT(DISTINCT "chunkId")::int FROM eligible WHERE "rawValue" IS NOT NULL) AS "existingChunkCount"
                ${rangeStatistics}`,
            parameters
        )
        const convertRangeValue = (value: unknown): KnowledgeFilterJSONValue =>
            definition.type === 'number' || definition.type === 'number[]' ? Number(value) : String(value)
        const items = (Array.isArray(row?.items) ? row.items : []) as Array<{
            value: KnowledgeFilterJSONValue
            documentCount: number | string
            chunkCount: number | string
        }>
        return {
            items: items.map((item) => ({
                value: item.value,
                documentCount: Number(item.documentCount ?? 0),
                chunkCount: Number(item.chunkCount ?? 0)
            })),
            total: Number(row?.total ?? 0),
            statistics: {
                eligibleDocumentCount: Number(row?.eligibleDocumentCount ?? 0),
                eligibleChunkCount: Number(row?.eligibleChunkCount ?? 0),
                existingDocumentCount: Number(row?.existingDocumentCount ?? 0),
                existingChunkCount: Number(row?.existingChunkCount ?? 0),
                ...(row?.minValue != null ? { min: convertRangeValue(row.minValue) } : {}),
                ...(row?.maxValue != null ? { max: convertRangeValue(row.maxValue) } : {})
            }
        }
    }

    private structuredFilterOptionValueExpression(definition: KnowledgeFilterFieldDefinition, parameters: unknown[]) {
        if (definition.scope === 'document') {
            const columns = new Set([
                'name',
                'folder',
                'type',
                'mimeType',
                'category',
                'sourceType',
                'createdAt',
                'updatedAt'
            ])
            if (!definition.column || !columns.has(definition.column)) {
                throw new BadRequestException(`Filter options are not available for field '${definition.field}'.`)
            }
            return `to_jsonb(d."${definition.column}")`
        }
        parameters.push(definition.metadataKey)
        const owner = definition.scope === 'chunkMetadata' ? 'c' : 'd'
        return `${owner}."metadata"::jsonb -> $${parameters.length}`
    }

    async listStructuredGraphEvidence(
        knowledgebaseId: string,
        tenantId: string,
        organizationId: string,
        compiled: { sql: string; parameters: unknown[] },
        scope: {
            entityIds?: string[]
            relationIds?: string[]
            take?: number
        }
    ): Promise<
        Array<{
            entityId?: string | null
            relationId?: string | null
            documentId: string
            chunkId: string
            quote?: string | null
            confidence?: number | null
            documentName?: string | null
            folderPath: string
        }>
    > {
        const entityIds = [...new Set(scope.entityIds?.filter(Boolean) ?? [])]
        const relationIds = [...new Set(scope.relationIds?.filter(Boolean) ?? [])]
        if (!entityIds.length && !relationIds.length) return []

        const parameters: unknown[] = [tenantId, organizationId, knowledgebaseId]
        const graphPredicates: string[] = []
        if (entityIds.length) {
            parameters.push(entityIds)
            graphPredicates.push(`gm."entityId" = ANY($${parameters.length})`)
        }
        if (relationIds.length) {
            parameters.push(relationIds)
            graphPredicates.push(`gm."relationId" = ANY($${parameters.length})`)
        }
        const compiledSql = compiled.sql.replace(/\$(\d+)/g, (_match, index) => `$${Number(index) + parameters.length}`)
        parameters.push(...compiled.parameters)
        parameters.push(Math.min(200, Math.max(1, Math.trunc(scope.take ?? 80))))
        const takeParameter = `$${parameters.length}`

        const rows = await this.dataSource.query(
            `SELECT
                gm."entityId" AS "entityId",
                gm."relationId" AS "relationId",
                gm."documentId" AS "documentId",
                gm."chunkId" AS "chunkId",
                gm."quote" AS quote,
                gm."confidence" AS confidence,
                d."name" AS "documentName",
                COALESCE(d."folder", '') AS "folderPath"
             FROM "knowledge_graph_mention" gm
             INNER JOIN "knowledge_document" d ON d."id" = gm."documentId"
             INNER JOIN "knowledge_document_chunk" c
                ON c."documentId" = d."id"
               AND COALESCE(c."metadata" ->> 'chunkId', c."id"::text) = gm."chunkId"
             WHERE d."tenantId" IS NOT DISTINCT FROM $1
               AND d."organizationId" IS NOT DISTINCT FROM $2
               AND d."knowledgebaseId" = $3
               AND c."knowledgebaseId" = $3
               AND gm."knowledgebaseId" = $3
               AND COALESCE(d."disabled", FALSE) = FALSE
               AND COALESCE(c."metadata" ->> 'enabled', 'true') <> 'false'
               AND (${graphPredicates.join(' OR ')})
               AND (${compiledSql})
             ORDER BY gm."confidence" DESC NULLS LAST, gm."createdAt" DESC
             LIMIT ${takeParameter}`,
            parameters
        )
        return rows.map((row) => ({
            entityId: row.entityId ?? null,
            relationId: row.relationId ?? null,
            documentId: String(row.documentId),
            chunkId: String(row.chunkId),
            quote: row.quote ?? null,
            confidence: row.confidence == null ? null : Number(row.confidence),
            documentName: row.documentName ?? null,
            folderPath: String(row.folderPath ?? '')
        }))
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
        const knowledgebase = await this.assertKnowledgebaseWriteAccess(id, {
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
        const knowledgebase = await this.assertKnowledgebaseWriteAccess(id, {
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
            throw new BadRequestException(
                `Embedding rebuild cannot start from status '${knowledgebase.status ?? KnowledgebaseStatusEnum.READY}'`
            )
        }

        const rebuildTaskId = shortuuid()
        const pendingEmbeddingRevision =
            (knowledgebase.pendingEmbeddingRevision ?? knowledgebase.embeddingRevision ?? 0) + 1
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
            relations: ['parent', 'document'],
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
                this.#logger.warn(
                    `Failed to cleanup old embedding collection '${oldCollectionName}': ${getErrorMessage(error)}`
                )
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
        const knowledgebase = await this.assertKnowledgebaseWriteAccess(id)
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
                            structure: KnowledgeStructureEnum.General
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
            const knowledgebase = await this.findOne(knowledgebaseId, {
                relations: ['visionModel', 'visionModel.copilot']
            })
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
        return ['pendingCopilotModel', 'pendingCopilotModel.copilot', 'pendingCopilotModel.copilot.modelProvider']
    }

    private async findKnowledgebaseForActiveVectorStore(
        knowledgebaseId: IKnowledgebase | string,
        requiredEmbeddings: boolean
    ) {
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
        return (
            copilotModel?.copilot?.modelProvider?.providerName ??
            copilotModel?.copilot?.modelProvider?.providerType ??
            null
        )
    }

    private resolveConfiguredEmbeddingDimensions(copilotModel: TEmbeddingCopilotModel | null | undefined) {
        const dimensions = copilotModel?.options?.dimensions
        if (typeof dimensions === 'number') {
            return dimensions
        }

        const dimension = copilotModel?.options?.dimension
        return typeof dimension === 'number' ? dimension : null
    }

    private async resolveEmbeddingDimensions(
        copilotModel: TEmbeddingCopilotModel,
        modelContext?: TKnowledgebaseModelContext
    ) {
        const configuredDimensions = this.resolveConfiguredEmbeddingDimensions(copilotModel)
        if (configuredDimensions) {
            return configuredDimensions
        }

        const copilot = copilotModel.copilot
        if (!copilot) {
            throw new CopilotNotFoundException(
                `Copilot not set for embedding model '${this.getEmbeddingModelName(copilotModel)}'`
            )
        }

        const embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
            new CopilotModelGetEmbeddingsQuery(copilot, copilotModel as TCopilotModel, {
                ...modelContext,
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
        copilotModelId?: string | null,
        modelContext?: TKnowledgebaseModelContext
    ): Promise<TResolvedEmbeddingModelTarget> {
        const resolvedModel = await this.ensureCopilotModel(copilotModel)
        if (!resolvedModel) {
            throw new BadRequestException('Embedding model is required')
        }

        const dimensions = await this.resolveEmbeddingDimensions(resolvedModel, modelContext)
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

    private async ensureLegacyActiveEmbeddingState(
        knowledgebase: IKnowledgebase,
        requiredEmbeddings: boolean,
        modelContext?: TKnowledgebaseModelContext
    ) {
        if (!requiredEmbeddings || knowledgebase.embeddingCollectionName || !knowledgebase.copilotModel) {
            return
        }

        const target = await this.resolveEmbeddingModelTarget(
            knowledgebase.id,
            knowledgebase.copilotModel,
            knowledgebase.copilotModelId,
            modelContext
        )
        const patch = {
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
        modelContext?: TKnowledgebaseModelContext
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
        let embeddingModelAccess: IModelAccessResolution | null = null
        if (copilotModel && copilot?.modelProvider) {
            embeddings = await this.queryBus.execute<CopilotModelGetEmbeddingsQuery, Embeddings>(
                new CopilotModelGetEmbeddingsQuery(copilot, copilotModel as TCopilotModel, {
                    ...options.modelContext,
                    tokenCallback: (token) => {
                        // execution.tokens += (token ?? 0)
                    },
                    modelAccessCallback: (modelAccess) => {
                        embeddingModelAccess = modelAccess
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
                    ...options.modelContext,
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
            embeddingMetadata,
            embeddingModelAccess
        )

        // const vectorStore = new KnowledgeDocumentVectorStore(knowledgebase, this.pgPool, embeddings, rerankModel)

        // // Create table for vector store if not exist
        // await vectorStore.ensureTableInDatabase()

        return vStore
    }

    async getActiveVectorStore(
        knowledgebaseId: IKnowledgebase | string,
        requiredEmbeddings = false,
        modelContext?: TKnowledgebaseModelContext
    ) {
        const knowledgebase = await this.findKnowledgebaseForActiveVectorStore(knowledgebaseId, requiredEmbeddings)
        await this.ensureLegacyActiveEmbeddingState(knowledgebase, requiredEmbeddings, modelContext)
        const copilotModel = knowledgebase.copilotModel
        const collectionName = knowledgebase.embeddingCollectionName ?? knowledgebase.id
        return this.createVectorStoreForModel({
            knowledgebase,
            copilotModel,
            collectionName,
            requiredEmbeddings,
            rerankEnabled: true,
            modelContext,
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

    async getGraphEntityVectorStore(
        knowledgebaseId: IKnowledgebase | string,
        requiredEmbeddings = false,
        modelContext?: TKnowledgebaseModelContext
    ) {
        const knowledgebase = await this.findKnowledgebaseForActiveVectorStore(knowledgebaseId, requiredEmbeddings)
        await this.ensureLegacyActiveEmbeddingState(knowledgebase, requiredEmbeddings, modelContext)
        const copilotModel = knowledgebase.copilotModel
        const activeCollectionName = knowledgebase.embeddingCollectionName ?? knowledgebase.id
        const collectionName = `${activeCollectionName}:graph-entities`
        return this.createVectorStoreForModel({
            knowledgebase,
            copilotModel,
            collectionName,
            requiredEmbeddings,
            rerankEnabled: false,
            modelContext,
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

    // Pipeline

    /**
     * Create a new task for a knowledgebase.
     * If the task status is running, start immediately.
     */
    async createTask(knowledgebaseId: string, task: Partial<IKnowledgebaseTask>) {
        const knowledgebase = await this.assertKnowledgebaseTaskWriteAccess(knowledgebaseId)
        if (task.status === 'running') {
            if (knowledgebase.status === KnowledgebaseStatusEnum.REBUILDING) {
                throw new BadRequestException('Embedding rebuild is running')
            }
        }

        if (task.conversationId) {
            const conversation = await this.queryBus.execute(
                new AssertChatConversationAccessQuery({ id: task.conversationId }, 'contribute')
            )
            if (
                conversation.tenantId !== knowledgebase.tenantId ||
                (conversation.organizationId ?? null) !== (knowledgebase.organizationId ?? null)
            ) {
                throw knowledgebaseTaskAccessDenied()
            }
        }

        const documents = await this.resolveKnowledgebaseTaskDocuments(knowledgebaseId, task.documents)
        const context = await this.resolveKnowledgebaseTaskContext(knowledgebase, task.context)
        const safeTask: Partial<IKnowledgebaseTask> = {
            taskType: task.taskType,
            status: task.status,
            context,
            conversationId: task.conversationId,
            documents
        }

        const { id } = await this.taskService.createTask(knowledgebaseId, safeTask)
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
                sources: _task.documents?.reduce(
                    (obj, doc) => ({
                        ...obj,
                        [doc.sourceConfig.key]: {
                            documents: [...(obj[doc.sourceConfig.key]?.documents ?? []), doc.id]
                        }
                    }),
                    {}
                ),
                stage: 'prod',
                mode: task.context?.processingMode ?? 'full'
            })
        }
        return _task
    }

    async getTask(knowledgebaseId: string, taskId: string, params?: PaginationParams<KnowledgebaseTask>) {
        await this.assertKnowledgebaseTaskReadAccess(knowledgebaseId)
        assertSafeKnowledgebaseTaskRelations(params?.relations)
        const where = { ...(params?.where ?? {}), id: taskId, knowledgebaseId } as FindOptionsWhere<KnowledgebaseTask>

        return this.taskService.findOneByOptions({
            relations: params?.relations,
            where
        })
    }

    /**
     * Process a task, start the knowledge ingestion pipeline
     */
    async processTask(
        knowledgebaseId: string,
        taskId: string,
        inputs: {
            sources?: { [key: string]: { documents: string[] } }
            stage: 'preview' | 'prod'
            mode?: KnowledgeDocumentProcessingMode
            options?: any
            isDraft?: boolean
        }
    ) {
        const kb = await this.assertKnowledgebaseTaskWriteAccess(knowledgebaseId, { relations: ['pipeline'] })
        if (kb.status === KnowledgebaseStatusEnum.REBUILDING) {
            throw new BadRequestException('Embedding rebuild is running')
        }
        const task = await this.taskService.findOneByOptions({
            where: { id: taskId, knowledgebaseId },
            relations: ['documents']
        })
        this.assertKnowledgebaseTaskSources(task, inputs.sources)
        const execution = await this.commandBus.execute(
            new XpertAgentExecutionUpsertCommand({
                // threadId: conversation.threadId,
                status: XpertAgentExecutionStatusEnum.RUNNING
            })
        )
        await this.taskService.update(taskId, { status: 'running', executionId: execution.id })
        const sources = inputs.sources ? Object.keys(inputs.sources) : null

        await this.commandBus.execute(
            new XpertEnqueueTriggerDispatchCommand(
                kb.pipelineId,
                RequestContext.currentUserId(),
                {
                    [STATE_VARIABLE_HUMAN]: {
                        input: 'Process knowledges pipeline'
                    },
                    [KnowledgebaseChannel]: {
                        knowledgebaseId: knowledgebaseId,
                        [KnowledgeTask]: taskId,
                        [KNOWLEDGE_SOURCES_NAME]: sources,
                        [KNOWLEDGE_PROCESSING_MODE_NAME]: inputs.mode ?? 'full',
                        stage: inputs.stage
                    },
                    ...(sources ?? []).reduce(
                        (obj, key) => ({ ...obj, [channelName(key)]: { documents: inputs.sources[key].documents } }),
                        {}
                    )
                },
                {
                    isDraft: inputs.isDraft,
                    from: 'knowledge',
                    executionId: execution.id
                }
            )
        )
    }

    private async assertKnowledgebaseTaskReadAccess(
        knowledgebaseId: string,
        options?: FindOneOptions<Knowledgebase>
    ): Promise<Knowledgebase> {
        const knowledgebase = await this.findOne(knowledgebaseId, options)
        if (
            !knowledgebase.workspaceId &&
            (knowledgebase.permission ?? KnowledgebasePermission.Private) === KnowledgebasePermission.Private &&
            knowledgebase.createdById !== RequestContext.currentUserId()
        ) {
            throw knowledgebaseTaskAccessDenied()
        }
        return knowledgebase
    }

    async assertKnowledgebaseWriteAccess(
        knowledgebaseId: string,
        options?: FindOneOptions<Knowledgebase>
    ): Promise<Knowledgebase> {
        return this.assertKnowledgebaseWriteAccessWithError(knowledgebaseId, options, knowledgebaseAccessDenied)
    }

    async assertKnowledgebaseTaskWriteAccess(
        knowledgebaseId: string,
        options?: FindOneOptions<Knowledgebase>
    ): Promise<Knowledgebase> {
        return this.assertKnowledgebaseWriteAccessWithError(knowledgebaseId, options, knowledgebaseTaskAccessDenied)
    }

    private async assertKnowledgebaseWriteAccessWithError(
        knowledgebaseId: string,
        options: FindOneOptions<Knowledgebase> | undefined,
        accessDenied: () => ForbiddenException
    ): Promise<Knowledgebase> {
        // Write authorization needs the parent workspace or legacy owner even
        // when callers request a narrow projection such as `{ id: true }`.
        // Mark these fields as explicitly selected so WorkspaceBaseService does
        // not remove its temporary access fields before this second boundary.
        const accessSelect = addKnowledgebaseWriteAccessSelect(options)
        const knowledgebase = await this.findOne(knowledgebaseId, accessSelect.options)
        if (knowledgebase.workspaceId) {
            await this.assertWorkspaceWriteAccess(knowledgebase.workspaceId)
        } else if (!RequestContext.currentUserId() || knowledgebase.createdById !== RequestContext.currentUserId()) {
            throw accessDenied()
        }
        return stripKnowledgebaseWriteAccessSelect(knowledgebase, accessSelect)
    }

    async resolveKnowledgebaseFolderAncestors(knowledgebaseId: string, parentId: string) {
        const parent = await this.documentService.findOne(parentId)
        if (parent.knowledgebaseId !== knowledgebaseId || parent.sourceType !== KDocumentSourceType.FOLDER) {
            throw new BadRequestException('parentId must point to a folder in the selected knowledgebase')
        }

        const ancestors = await this.documentService.findAncestors(parent.id)
        if (ancestors.some((ancestor) => ancestor.knowledgebaseId !== knowledgebaseId)) {
            throw new BadRequestException('parentId must point to a folder in the selected knowledgebase')
        }
        return ancestors
    }

    private assertKnowledgebaseCrudReadAccess(knowledgebase: Knowledgebase): void {
        if (
            !knowledgebase.workspaceId &&
            (knowledgebase.permission ?? KnowledgebasePermission.Private) === KnowledgebasePermission.Private &&
            knowledgebase.createdById !== RequestContext.currentUserId()
        ) {
            throw knowledgebaseAccessDenied()
        }
    }

    private async resolveKnowledgebaseTaskContext(
        knowledgebase: Knowledgebase,
        context: IKnowledgebaseTask['context']
    ): Promise<IKnowledgebaseTask['context']> {
        if (!context) {
            return undefined
        }

        const documents = context.documents
            ? await this.resolveKnowledgebaseTaskContextDocuments(knowledgebase, context.documents)
            : undefined
        return {
            ...(documents ? { documents } : {}),
            ...(context.processingMode ? { processingMode: context.processingMode } : {})
        }
    }

    private async resolveKnowledgebaseTaskContextDocuments(
        knowledgebase: Knowledgebase,
        documents: Partial<IKnowledgeDocument>[]
    ): Promise<Partial<IKnowledgeDocument>[]> {
        const filesPath = this.knowledgeWorkAreaResolver.getFilesPath()
        const relativePaths = documents.map((document) =>
            resolveKnowledgebaseTaskFilePath(filesPath, document.filePath)
        )
        const workArea = await this.knowledgeWorkAreaResolver.resolve({
            tenantId: knowledgebase.tenantId,
            userId: RequestContext.currentUserId(),
            knowledgebaseId: knowledgebase.id
        })
        const files = new VolumeSubtreeClient(workArea.volume)

        return Promise.all(
            documents.map(async (document, index) => {
                const relativePath = relativePaths[index]
                const authorizedFile = await files.readFile(filesPath, relativePath, { metadataOnly: true })
                const parent = await this.resolveKnowledgebaseTaskDocumentParent(knowledgebase.id, document.parent)

                return {
                    id: document.id,
                    name: document.name,
                    type: document.type,
                    size: document.size,
                    category: document.category,
                    parserId: document.parserId,
                    parserConfig: document.parserConfig,
                    thumbnail: document.thumbnail,
                    options: document.options,
                    metadata: document.metadata,
                    ...(parent !== undefined ? { parent } : {}),
                    filePath: path.posix.join(filesPath, authorizedFile.filePath),
                    ...(authorizedFile.fileUrl ? { fileUrl: authorizedFile.fileUrl } : {}),
                    ...(authorizedFile.mimeType ? { mimeType: authorizedFile.mimeType } : {})
                }
            })
        )
    }

    private async resolveKnowledgebaseTaskDocumentParent(
        knowledgebaseId: string,
        parent: IKnowledgeDocument['parent']
    ) {
        if (parent === null || parent === undefined) {
            return parent
        }
        if (!parent.id) {
            throw knowledgebaseTaskAccessDenied()
        }

        const ancestors = await this.resolveKnowledgebaseFolderAncestors(knowledgebaseId, parent.id)
        const authorizedParent = ancestors[ancestors.length - 1]
        return { id: authorizedParent.id } as IKnowledgeDocument
    }

    private async resolveKnowledgebaseTaskDocuments(
        knowledgebaseId: string,
        documents: IKnowledgebaseTask['documents']
    ): Promise<IKnowledgebaseTask['documents']> {
        if (!documents?.length) {
            return undefined
        }

        const documentIds = [
            ...new Set(
                documents
                    .map((document) => document.id)
                    .filter((documentId): documentId is string => typeof documentId === 'string' && !!documentId)
            )
        ]
        if (documentIds.length !== documents.length) {
            throw knowledgebaseTaskAccessDenied()
        }

        const result = await this.documentService.findAll({
            where: {
                id: In(documentIds),
                knowledgebaseId
            }
        })
        if (result.items.length !== documentIds.length) {
            throw knowledgebaseTaskAccessDenied()
        }

        return result.items
    }

    private assertKnowledgebaseTaskSources(
        task: KnowledgebaseTask,
        sources: { [key: string]: { documents: string[] } } | undefined
    ): void {
        if (!sources) {
            return
        }

        const allowedDocumentIds = new Set([
            ...(task.documents ?? [])
                .map((document) => document.id)
                .filter((documentId): documentId is string => typeof documentId === 'string' && !!documentId),
            ...(task.context?.documents ?? [])
                .map((document) => document.id)
                .filter((documentId): documentId is string => typeof documentId === 'string' && !!documentId)
        ])
        const requestedDocumentIds = Object.values(sources).flatMap((source) => source.documents ?? [])
        if (requestedDocumentIds.some((documentId) => !allowedDocumentIds.has(documentId))) {
            throw knowledgebaseTaskAccessDenied()
        }
    }

    async previewFile(id: string, filePath: string) {
        const knowledgebase = await this.assertKnowledgebaseTaskReadAccess(id)
        const [document] = await this.resolveKnowledgebaseTaskContextDocuments(knowledgebase, [{ filePath }])
        const extension = document.filePath.split('.').pop().toLowerCase()
        try {
            const results = await this.transformDocuments(
                id,
                { provider: 'default', config: {} } as IWFNProcessor,
                false,
                [
                    {
                        filePath: document.filePath,
                        fileUrl: document.fileUrl,
                        mimeType: document.mimeType,
                        name: document.filePath.split('/').pop(),
                        type: extension,
                        category: classificateDocumentCategory({ type: extension })
                    }
                ]
            )
            return results[0].chunks
        } catch (error) {
            throw new InternalServerErrorException(getErrorMessage(error))
        }
    }

    async transformDocuments(
        knowledgebaseId: string,
        entity: IWFNProcessor,
        isDraft: boolean,
        input: Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>[],
        options?: {
            taskId?: string | null
            documentId?: string | null
        }
    ) {
        const strategy = this.docTransformerRegistry.get(entity.provider)
        const workArea = await this.knowledgeWorkAreaResolver.resolve({
            tenantId: RequestContext.currentTenantId(),
            userId: RequestContext.currentUserId(),
            knowledgebaseId,
            taskId: options?.taskId,
            documentId: options?.documentId
        })

        const permissions = await this.commandBus.execute(
            new PluginPermissionsCommand(strategy.permissions, {
                knowledgebaseId: knowledgebaseId,
                integrationId: entity.integrationId,
                folder: ''
            })
        )

        const results = await strategy.transformDocuments(input, {
            ...(entity.config ?? {}),
            stage: isDraft ? 'test' : 'prod',
            tempDir: workArea.tmpPath.serverPath,
            permissions
        })

        return results
    }
}

function resolveKnowledgebaseTaskFilePath(filesPath: string, filePath: string | undefined): string {
    if (typeof filePath !== 'string') {
        throw knowledgebaseTaskAccessDenied()
    }

    const normalizedPath = filePath.trim().replace(/\\/g, '/')
    const prefix = `${filesPath}/`
    if (
        !normalizedPath ||
        normalizedPath.includes('\0') ||
        path.posix.isAbsolute(normalizedPath) ||
        !normalizedPath.startsWith(prefix)
    ) {
        throw knowledgebaseTaskAccessDenied()
    }

    const relativePath = normalizedPath.slice(prefix.length)
    if (!relativePath) {
        throw knowledgebaseTaskAccessDenied()
    }
    return relativePath
}

type KnowledgebaseAccessSelect = {
    options?: FindOneOptions<Knowledgebase>
    addedCreatedById: boolean
    addedPermission: boolean
}

type KnowledgebaseWriteAccessSelect = {
    options?: FindOneOptions<Knowledgebase>
    addedWorkspaceId: boolean
    addedCreatedById: boolean
}

function addKnowledgebaseWriteAccessSelect(options?: FindOneOptions<Knowledgebase>): KnowledgebaseWriteAccessSelect {
    if (!options?.select) {
        return { options, addedWorkspaceId: false, addedCreatedById: false }
    }

    if (Array.isArray(options.select)) {
        const selectedFields = options.select as string[]
        const addedWorkspaceId = !selectedFields.includes('workspaceId')
        const addedCreatedById = !selectedFields.includes('createdById')
        return {
            options: {
                ...options,
                select: [
                    ...selectedFields,
                    ...(addedWorkspaceId ? ['workspaceId'] : []),
                    ...(addedCreatedById ? ['createdById'] : [])
                ] as FindOneOptions<Knowledgebase>['select']
            },
            addedWorkspaceId,
            addedCreatedById
        }
    }

    const addedWorkspaceId = options.select.workspaceId !== true
    const addedCreatedById = options.select.createdById !== true
    return {
        options: {
            ...options,
            select: {
                ...options.select,
                workspaceId: true,
                createdById: true
            }
        },
        addedWorkspaceId,
        addedCreatedById
    }
}

function stripKnowledgebaseWriteAccessSelect(
    knowledgebase: Knowledgebase,
    accessSelect: KnowledgebaseWriteAccessSelect
): Knowledgebase {
    if (!accessSelect.addedWorkspaceId && !accessSelect.addedCreatedById) {
        return knowledgebase
    }

    const result = { ...knowledgebase }
    if (accessSelect.addedWorkspaceId) {
        delete result.workspaceId
    }
    if (accessSelect.addedCreatedById) {
        delete result.createdById
    }
    return result
}

function addKnowledgebaseAccessSelect(options?: FindOneOptions<Knowledgebase>): KnowledgebaseAccessSelect {
    if (!options?.select) {
        return { options, addedCreatedById: false, addedPermission: false }
    }

    if (Array.isArray(options.select)) {
        const selectedFields = options.select as string[]
        const addedCreatedById = !selectedFields.includes('createdById')
        const addedPermission = !selectedFields.includes('permission')
        return {
            options: {
                ...options,
                select: [
                    ...selectedFields,
                    ...(addedCreatedById ? ['createdById'] : []),
                    ...(addedPermission ? ['permission'] : [])
                ] as FindOneOptions<Knowledgebase>['select']
            },
            addedCreatedById,
            addedPermission
        }
    }

    const addedCreatedById = options.select.createdById !== true
    const addedPermission = options.select.permission !== true
    return {
        options: {
            ...options,
            select: {
                ...options.select,
                createdById: true,
                permission: true
            }
        },
        addedCreatedById,
        addedPermission
    }
}

function stripKnowledgebaseAccessSelect(
    knowledgebase: Knowledgebase,
    accessSelect: KnowledgebaseAccessSelect
): Knowledgebase {
    if (!accessSelect.addedCreatedById && !accessSelect.addedPermission) {
        return knowledgebase
    }

    const result = { ...knowledgebase }
    if (accessSelect.addedCreatedById) {
        delete result.createdById
    }
    if (accessSelect.addedPermission) {
        delete result.permission
    }
    return result
}
