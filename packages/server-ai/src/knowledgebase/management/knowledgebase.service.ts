import {
    TenantLibraryAccessService,
    assertTenantLibraryAdministrator
} from '../tenant-library/tenant-library-access.service'
import { normalizeKnowledgebaseFAQConfig } from '../faq/faq-config'
import { withUnboundKnowledgebase } from '../lifecycle/shared-resource-lifecycle'
import { appPlatformKnowledgeIds } from '../runtime/app-platform-knowledge-access'
import { KnowledgeResourceAccessService } from '../runtime/knowledge-resource-access.service'
import { KnowledgeKeywordAnalyzerService } from '../analyzer/keyword-analyzer.service'
import { VectorStoreSettingsService } from '../../rag-vstore/vector-store-settings.service'
import { environment } from '@xpert-ai/server-config'

import { prepareAutomaticTaggingConfig } from '../tags/automatic-tagging-config'

import { KnowledgeParserSettingsService } from '../parser/parser-settings.service'

import {
    DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG,
    IKnowledgebase,
    KnowledgebasePermission,
    KnowledgebaseTypeEnum,
    mapTranslationLanguage,
    TCopilotModel,
    IUser,
    TKBRetrievalSettings,
    KnowledgeFilterSources,
    KnowledgeRetrievalContentScope,
    KnowledgeGraphStatus,
    normalizeKnowledgebaseFAQRecall
} from '@xpert-ai/contracts'

import { IntegrationService, PaginationParams } from '@xpert-ai/server-core'
import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Queue } from 'bull'
import { InjectRepository } from '@nestjs/typeorm'
import {
    DocumentSourceRegistry,
    DocumentTransformerRegistry,
    ImageUnderstandingRegistry,
    KnowledgeStrategyRegistry,
    TextSplitterRegistry
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { assign } from 'lodash'
import { I18nService } from 'nestjs-i18n'

import {
    DataSource,
    DeleteResult,
    FindManyOptions,
    FindOneOptions,
    FindOptionsWhere,
    In,
    IsNull,
    Not,
    Repository,
    SaveOptions
} from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'

import { XpertWorkspaceAccessService, XpertWorkspaceBaseService } from '../../xpert-workspace'
import { GetXpertWorkspaceQuery } from '../../xpert-workspace/queries'
import { XpertService } from '../../xpert/xpert.service'
import { Knowledgebase } from '../persistence/knowledgebase.entity'
import { assertKnowledgebaseRetrievalSettings } from '../retrieval/retrieval-settings-validation'

import { KnowledgeSearchQuery } from '../queries'
import { KnowledgeSearchResult } from '../queries/knowledge-search.query'
import { KnowledgebaseTaskService } from '../task'

import { KnowledgeWorkAreaResolver } from '../../shared/volume/work-area'

import { KnowledgeDocumentService } from '../../knowledge-document/document.service'

import { JOB_REBUILD_KNOWLEDGEBASE_EMBEDDING, TKnowledgebaseRebuildEmbeddingJob } from '../shared/types'
import { KnowledgebaseDetailDTO } from '../dto'

import { prepareKnowledgeWikiCreateState } from '../wiki/knowledge-wiki-config'
import { KnowledgeWikiConfigurationUpdate } from '../wiki/knowledge-wiki-configuration'
import { RequestContext } from '@xpert-ai/plugin-sdk'

import { KnowledgebaseUpdateOperations } from './knowledgebase-update.operations'
import { KnowledgebaseFilterOperations } from '../filter/knowledgebase-filter.operations'
import { KnowledgebaseRebuildOperations } from '../embedding/knowledgebase-rebuild.operations'
import { KnowledgebaseEmbeddingOperations } from '../embedding/knowledgebase-embedding.operations'
import { KnowledgebaseTaskOperations } from '../task/knowledgebase-task.operations'
import { KnowledgebasePipelineOperations } from '../pipeline/knowledgebase-pipeline.operations'
import {
    KNOWLEDGEBASE_DETAIL_RELATIONS,
    KNOWLEDGEBASE_SAFE_READ_RELATIONS,
    knowledgebaseAccessDenied,
    KNOWLEDGEBASE_DETAIL_SELECT,
    addKnowledgebaseWriteAccessSelect,
    stripKnowledgebaseWriteAccessSelect,
    addKnowledgebaseAccessSelect,
    stripKnowledgebaseAccessSelect
} from '../access/knowledgebase-access-policy'
import { knowledgebaseTaskAccessDenied } from '../task/knowledgebase-task-policy'

@Injectable()
export class KnowledgebaseService extends XpertWorkspaceBaseService<Knowledgebase> {
    @Inject(KnowledgeResourceAccessService)
    private readonly resourceAccess: KnowledgeResourceAccessService
    @Inject(TenantLibraryAccessService)
    private readonly tenantLibraries: TenantLibraryAccessService

    @Inject(KnowledgeKeywordAnalyzerService)
    private readonly keywordAnalyzers: KnowledgeKeywordAnalyzerService

    readonly #logger = new Logger(KnowledgebaseService.name)

    @Inject(I18nService)
    private readonly i18nService: I18nService

    @Inject(KnowledgeDocumentService)
    private readonly documentService: KnowledgeDocumentService

    @Inject(KnowledgeParserSettingsService)
    private readonly parserSettings: KnowledgeParserSettingsService

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
        const managed = await appPlatformKnowledgeIds(this.repository.manager, workspaceId)
        if (managed) {
            const items = managed.length
                ? await this.repository.find({
                      where: {
                          id: In(managed),
                          tenantId: RequestContext.currentTenantId(),
                          organizationId: RequestContext.getOrganizationId(),
                          ...(published ? { publishAt: Not(IsNull()) } : {})
                      },
                      relations,
                      order,
                      take
                  })
                : []
            const visible: Knowledgebase[] = []
            for (const item of items) {
                try {
                    await this.resourceAccess.authorize(item.id, 'read')
                    visible.push(item)
                } catch (error) {
                    if (!(error instanceof ForbiddenException)) throw error
                }
            }
            return { items: visible, total: visible.length }
        }
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

    @Inject(VectorStoreSettingsService)
    private readonly vectorStoreSettings: VectorStoreSettingsService

    async create(entity: Partial<IKnowledgebase>) {
        return this.createLibrary(entity)
    }

    /** Platform-owned resource binding is established atomically with creation and is immutable. */
    async createForResource(entity: Partial<IKnowledgebase>, resourceRef: Knowledgebase['resourceRef']) {
        if (!resourceRef) throw knowledgebaseAccessDenied()
        await this.resourceAccess.authorizeReference(resourceRef, 'manage')
        return this.createLibrary(entity, resourceRef)
    }

    private async createLibrary(entity: Partial<IKnowledgebase>, resourceRef?: Knowledgebase['resourceRef']) {
        if (
            !entity.workspaceId &&
            !RequestContext.getOrganizationId() &&
            entity.permission === KnowledgebasePermission.Public
        ) {
            assertTenantLibraryAdministrator()
        }
        const input = { ...entity }
        Reflect.deleteProperty(input, 'resourceRef')
        delete input.keywordAnalyzerLocked
        input.keywordAnalyzer =
            input.type === KnowledgebaseTypeEnum.External
                ? null
                : this.keywordAnalyzers.forCreate(input.keywordAnalyzer, RequestContext.getOrganizationId())
        if ('automaticTagging' in input) input.automaticTagging = prepareAutomaticTaggingConfig(input.automaticTagging)
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

        input.type ??= KnowledgebaseTypeEnum.Standard
        if (input.type !== KnowledgebaseTypeEnum.External) {
            input.vectorStore = this.vectorStoreSettings.forCreate(input.vectorStore)
        } else {
            delete input.vectorStore
        }
        if (input.type === KnowledgebaseTypeEnum.Standard && input.parserConfig) {
            input.structure = await this.parserSettings.validateSettings(input.parserConfig)
        }
        if (input.type === KnowledgebaseTypeEnum.FAQ) {
            input.faqConfig = normalizeKnowledgebaseFAQConfig(input.faqConfig ?? DEFAULT_KNOWLEDGEBASE_FAQ_CONFIG)
            input.recall = normalizeKnowledgebaseFAQRecall(input.recall)
            input.graphRag = {
                ...(input.graphRag ?? {}),
                enabled: false,
                mode: input.recall.mode
            }
        } else {
            delete input.faqConfig
        }

        input.graphStatus =
            input.graphRag?.enabled === true ? KnowledgeGraphStatus.READY : KnowledgeGraphStatus.DISABLED
        input.graphRevision = 0
        input.graphIndexError = null

        const wikiCreateState = prepareKnowledgeWikiCreateState(input)
        Object.assign(input, wikiCreateState)
        assertKnowledgebaseRetrievalSettings(input)

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
        return await super.create({ ...input, ...(resourceRef ? { resourceRef } : {}) })
    }

    override async findOne(
        id: string | number | FindOneOptions<Knowledgebase>,
        options?: FindOneOptions<Knowledgebase>
    ): Promise<Knowledgebase> {
        const managed = await appPlatformKnowledgeIds(this.repository.manager)
        if (managed) {
            const filter = typeof id === 'object' ? id : { ...options, where: { id: String(id) } }
            const query = this.repository
                .createQueryBuilder('kb')
                .setFindOptions(filter)
                .addSelect('kb.id')
                .andWhere('kb.tenantId = :tenant AND kb.organizationId = :organization', {
                    tenant: RequestContext.currentTenantId(),
                    organization: RequestContext.getOrganizationId()
                })
            const row = await query.getOne()
            if (!row) throw knowledgebaseAccessDenied()
            const resourceAuthorized = await this.resourceAccess.authorize(row.id, 'read')
            if (!resourceAuthorized && !managed.includes(row.id)) throw knowledgebaseAccessDenied()
            return row
        }
        if (typeof id === 'string' && this.tenantLibraries) {
            const shared = await this.tenantLibraries.find(id, options)
            if (shared) return shared
        }
        const result = await super.findOne(id, options)
        await this.resourceAccess?.authorize(result.id, 'read')
        return result
    }

    override async findAll(filter?: FindManyOptions<Knowledgebase>, resourceIds?: string[]) {
        // Resource-owned indexes are discovered through their owning resource or the governed catalog.
        // Filtering in SQL preserves pagination counts without revealing inaccessible resource indexes.
        const where = Array.isArray(filter?.where)
            ? filter.where.map((condition) => ({ ...condition, resourceRef: IsNull() }))
            : { ...filter?.where, resourceRef: IsNull() }
        if (!resourceIds?.length) return super.findAll({ ...filter, where })
        const conditions = Array.isArray(filter?.where) ? filter.where : [filter?.where ?? {}]
        const result = await super.findAll({
            ...filter,
            where: [
                ...(Array.isArray(where) ? where : [where]),
                ...conditions.map((condition) => ({ ...condition, id: In(resourceIds), resourceRef: Not(IsNull()) }))
            ]
        })
        const items: Knowledgebase[] = []
        for (const item of result.items) {
            try {
                await this.resourceAccess.authorize(item.id, 'read')
                items.push(item)
            } catch (error) {
                if (!(error instanceof ForbiddenException)) throw error
            }
        }
        return { ...result, items, total: items.length }
    }

    async findOneByIdString(id: string, options?: FindOneOptions<Knowledgebase>): Promise<Knowledgebase> {
        const accessSelect = addKnowledgebaseAccessSelect(options)
        const knowledgebase = await super.findOneByIdString(id, accessSelect.options)
        if (!(await this.resourceAccess?.authorize(knowledgebase.id, 'read')))
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
        const canManage = await this.canManageKnowledgebase(id)

        return new KnowledgebaseDetailDTO({
            ...knowledgebase,
            vectorStore: knowledgebase.vectorStore ?? environment.vectorStore,
            canManageWiki: canManage,
            canManageDocumentDeletions: canManage
        })
    }

    async delete(criteria: string | FindOptionsWhere<Knowledgebase>): Promise<DeleteResult> {
        if (typeof criteria !== 'string') {
            return withUnboundKnowledgebase(this.repository, criteria, () => super.delete(criteria))
        }

        const knowledgebase = await this.assertKnowledgebaseWriteAccess(criteria, {
            relations: ['pipeline']
        })
        await this.resourceAccess?.authorize(criteria, 'manage')
        return withUnboundKnowledgebase(this.repository, criteria, async () => {
            await this.cleanupPipelineBeforeDelete(knowledgebase)
            return super.delete(criteria)
        })
    }

    async softDelete(criteria: string | number | FindOptionsWhere<Knowledgebase>) {
        if (typeof criteria === 'string') {
            await this.assertKnowledgebaseWriteAccess(criteria)
            await this.resourceAccess?.authorize(criteria, 'manage')
        }
        return withUnboundKnowledgebase(this.repository, criteria, () => super.softDelete(criteria))
    }

    async softRemove(id: Knowledgebase['id'], options?: FindOneOptions<Knowledgebase>, saveOptions?: SaveOptions) {
        await this.assertKnowledgebaseWriteAccess(id, options)
        await this.resourceAccess?.authorize(id, 'manage')
        return withUnboundKnowledgebase(this.repository, id, () => super.softRemove(id, options, saveOptions))
    }

    async softRecover(id: Knowledgebase['id'], options?: FindOneOptions<Knowledgebase>, saveOptions?: SaveOptions) {
        await this.assertKnowledgebaseWriteAccess(id, options)
        await this.resourceAccess?.authorize(id, 'manage')
        return super.softRecover(id, options, saveOptions)
    }

    private cleanupPipelineBeforeDelete(
        ...args: Parameters<KnowledgebasePipelineOperations['cleanupPipelineBeforeDelete']>
    ): ReturnType<KnowledgebasePipelineOperations['cleanupPipelineBeforeDelete']> {
        return this.pipelineOperations().cleanupPipelineBeforeDelete(...args)
    }

    createExternal(
        ...args: Parameters<KnowledgebasePipelineOperations['createExternal']>
    ): ReturnType<KnowledgebasePipelineOperations['createExternal']> {
        return this.pipelineOperations().createExternal(...args)
    }

    searchExternalKnowledgebase(
        ...args: Parameters<KnowledgebasePipelineOperations['searchExternalKnowledgebase']>
    ): ReturnType<KnowledgebasePipelineOperations['searchExternalKnowledgebase']> {
        return this.pipelineOperations().searchExternalKnowledgebase(...args)
    }

    /**
     * To solve the problem that Update cannot create OneToOne relation, it is uncertain whether using save to update might pose risks
     */
    // Isolate TypeORM's recursive update type; business callers use the shallow method to keep ts-node inference bounded.
    async update(id: string, entity: QueryDeepPartialEntity<Knowledgebase> & Partial<Knowledgebase>) {
        return this.updateKnowledgebase(id, entity)
    }

    async updateWikiConfiguration(id: string, input: KnowledgeWikiConfigurationUpdate) {
        return this.updateKnowledgebase(id, input.settings ?? {}, input)
    }

    updateKnowledgebase(
        ...args: Parameters<KnowledgebaseUpdateOperations['updateKnowledgebase']>
    ): ReturnType<KnowledgebaseUpdateOperations['updateKnowledgebase']> {
        return this.updateOperations().updateKnowledgebase(...args)
    }

    /**
     * Normalizes machine-readable application classifications at the write
     * boundary. Limits prevent unbounded JSON metadata while preserving stable
     * exact-match tags for plugin discovery.
     */
    private normalizeApplicationTags(
        ...args: Parameters<KnowledgebaseUpdateOperations['normalizeApplicationTags']>
    ): ReturnType<KnowledgebaseUpdateOperations['normalizeApplicationTags']> {
        return this.updateOperations().normalizeApplicationTags(...args)
    }

    private validateAndNormalizeMetadataSchema(
        ...args: Parameters<KnowledgebaseUpdateOperations['validateAndNormalizeMetadataSchema']>
    ): ReturnType<KnowledgebaseUpdateOperations['validateAndNormalizeMetadataSchema']> {
        return this.updateOperations().validateAndNormalizeMetadataSchema(...args)
    }

    ensureDocumentChunkStructure(
        ...args: Parameters<KnowledgebaseUpdateOperations['ensureDocumentChunkStructure']>
    ): ReturnType<KnowledgebaseUpdateOperations['ensureDocumentChunkStructure']> {
        return this.updateOperations().ensureDocumentChunkStructure(...args)
    }

    async getTextSplitterStrategies() {
        return this.textSplitterRegistry.list().map((strategy) => ({ ...strategy.meta, structure: strategy.structure }))
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
            score?: number | null
            rerankModel?: TCopilotModel | null
            rerankThreshold?: number | null
            filters?: KnowledgeFilterSources
            variables?: Record<string, unknown>
            retrieval?: TKBRetrievalSettings
            contentScope?: KnowledgeRetrievalContentScope
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

    countStructuredFilterCandidates(
        ...args: Parameters<KnowledgebaseFilterOperations['countStructuredFilterCandidates']>
    ): ReturnType<KnowledgebaseFilterOperations['countStructuredFilterCandidates']> {
        return this.filterOperations().countStructuredFilterCandidates(...args)
    }

    /**
     * Returns logical folder paths that contain chunks eligible under a validated
     * fixed filter. The knowledgebase, tenant, and organization predicates are
     * mandatory and values are always bound parameters.
     */
    listStructuredFilterFolderCandidates(
        ...args: Parameters<KnowledgebaseFilterOperations['listStructuredFilterFolderCandidates']>
    ): ReturnType<KnowledgebaseFilterOperations['listStructuredFilterFolderCandidates']> {
        return this.filterOperations().listStructuredFilterFolderCandidates(...args)
    }

    /**
     * Lists distinct live values for one registered filter field. Field identifiers
     * are resolved from the server-side registry; metadata keys and all values are
     * bound parameters.
     */
    listStructuredFilterValueCandidates(
        ...args: Parameters<KnowledgebaseFilterOperations['listStructuredFilterValueCandidates']>
    ): ReturnType<KnowledgebaseFilterOperations['listStructuredFilterValueCandidates']> {
        return this.filterOperations().listStructuredFilterValueCandidates(...args)
    }

    listStructuredGraphEvidence(
        ...args: Parameters<KnowledgebaseFilterOperations['listStructuredGraphEvidence']>
    ): ReturnType<KnowledgebaseFilterOperations['listStructuredGraphEvidence']> {
        return this.filterOperations().listStructuredGraphEvidence(...args)
    }

    assertNotRebuilding(
        ...args: Parameters<KnowledgebaseRebuildOperations['assertNotRebuilding']>
    ): ReturnType<KnowledgebaseRebuildOperations['assertNotRebuilding']> {
        return this.rebuildOperations().assertNotRebuilding(...args)
    }

    cancelPendingEmbeddingModel(
        ...args: Parameters<KnowledgebaseRebuildOperations['cancelPendingEmbeddingModel']>
    ): ReturnType<KnowledgebaseRebuildOperations['cancelPendingEmbeddingModel']> {
        return this.rebuildOperations().cancelPendingEmbeddingModel(...args)
    }

    startEmbeddingRebuild(
        ...args: Parameters<KnowledgebaseRebuildOperations['startEmbeddingRebuild']>
    ): ReturnType<KnowledgebaseRebuildOperations['startEmbeddingRebuild']> {
        return this.rebuildOperations().startEmbeddingRebuild(...args)
    }

    processEmbeddingRebuildJob(
        ...args: Parameters<KnowledgebaseRebuildOperations['processEmbeddingRebuildJob']>
    ): ReturnType<KnowledgebaseRebuildOperations['processEmbeddingRebuildJob']> {
        return this.rebuildOperations().processEmbeddingRebuildJob(...args)
    }

    markEmbeddingRebuildFailed(
        ...args: Parameters<KnowledgebaseRebuildOperations['markEmbeddingRebuildFailed']>
    ): ReturnType<KnowledgebaseRebuildOperations['markEmbeddingRebuildFailed']> {
        return this.rebuildOperations().markEmbeddingRebuildFailed(...args)
    }

    /**
     * Init a pipeline (xpert) for knowledgebase
     *
     * @param id
     * @returns
     */
    createPipeline(
        ...args: Parameters<KnowledgebasePipelineOperations['createPipeline']>
    ): ReturnType<KnowledgebasePipelineOperations['createPipeline']> {
        return this.pipelineOperations().createPipeline(...args)
    }

    getVisionModel(
        ...args: Parameters<KnowledgebaseEmbeddingOperations['getVisionModel']>
    ): ReturnType<KnowledgebaseEmbeddingOperations['getVisionModel']> {
        return this.embeddingOperations().getVisionModel(...args)
    }

    private getPendingVectorStoreRelations(
        ...args: Parameters<KnowledgebaseEmbeddingOperations['getPendingVectorStoreRelations']>
    ): ReturnType<KnowledgebaseEmbeddingOperations['getPendingVectorStoreRelations']> {
        return this.embeddingOperations().getPendingVectorStoreRelations(...args)
    }

    private getEmbeddingModelName(
        ...args: Parameters<KnowledgebaseEmbeddingOperations['getEmbeddingModelName']>
    ): ReturnType<KnowledgebaseEmbeddingOperations['getEmbeddingModelName']> {
        return this.embeddingOperations().getEmbeddingModelName(...args)
    }

    private getEmbeddingProviderName(
        ...args: Parameters<KnowledgebaseEmbeddingOperations['getEmbeddingProviderName']>
    ): ReturnType<KnowledgebaseEmbeddingOperations['getEmbeddingProviderName']> {
        return this.embeddingOperations().getEmbeddingProviderName(...args)
    }

    private resolveEmbeddingModelTarget(
        ...args: Parameters<KnowledgebaseEmbeddingOperations['resolveEmbeddingModelTarget']>
    ): ReturnType<KnowledgebaseEmbeddingOperations['resolveEmbeddingModelTarget']> {
        return this.embeddingOperations().resolveEmbeddingModelTarget(...args)
    }

    resolveEmbeddingModelTargetForComparison(
        ...args: Parameters<KnowledgebaseEmbeddingOperations['resolveEmbeddingModelTargetForComparison']>
    ): ReturnType<KnowledgebaseEmbeddingOperations['resolveEmbeddingModelTargetForComparison']> {
        return this.embeddingOperations().resolveEmbeddingModelTargetForComparison(...args)
    }

    private createVectorStoreForModel(
        ...args: Parameters<KnowledgebaseEmbeddingOperations['createVectorStoreForModel']>
    ): ReturnType<KnowledgebaseEmbeddingOperations['createVectorStoreForModel']> {
        return this.embeddingOperations().createVectorStoreForModel(...args)
    }

    getRerankModel(
        ...args: Parameters<KnowledgebaseEmbeddingOperations['getRerankModel']>
    ): ReturnType<KnowledgebaseEmbeddingOperations['getRerankModel']> {
        return this.embeddingOperations().getRerankModel(...args)
    }

    getActiveVectorStore(
        ...args: Parameters<KnowledgebaseEmbeddingOperations['getActiveVectorStore']>
    ): ReturnType<KnowledgebaseEmbeddingOperations['getActiveVectorStore']> {
        return this.embeddingOperations().getActiveVectorStore(...args)
    }

    getGraphEntityVectorStore(
        ...args: Parameters<KnowledgebaseEmbeddingOperations['getGraphEntityVectorStore']>
    ): ReturnType<KnowledgebaseEmbeddingOperations['getGraphEntityVectorStore']> {
        return this.embeddingOperations().getGraphEntityVectorStore(...args)
    }

    getPendingVectorStoreForRebuild(
        ...args: Parameters<KnowledgebaseEmbeddingOperations['getPendingVectorStoreForRebuild']>
    ): ReturnType<KnowledgebaseEmbeddingOperations['getPendingVectorStoreForRebuild']> {
        return this.embeddingOperations().getPendingVectorStoreForRebuild(...args)
    }

    // Pipeline

    /**
     * Create a new task for a knowledgebase.
     * If the task status is running, start immediately.
     */
    createTask(
        ...args: Parameters<KnowledgebaseTaskOperations['createTask']>
    ): ReturnType<KnowledgebaseTaskOperations['createTask']> {
        return this.taskOperations().createTask(...args)
    }

    getTask(
        ...args: Parameters<KnowledgebaseTaskOperations['getTask']>
    ): ReturnType<KnowledgebaseTaskOperations['getTask']> {
        return this.taskOperations().getTask(...args)
    }

    /**
     * Process a task, start the knowledge ingestion pipeline
     */
    processTask(
        ...args: Parameters<KnowledgebaseTaskOperations['processTask']>
    ): ReturnType<KnowledgebaseTaskOperations['processTask']> {
        return this.taskOperations().processTask(...args)
    }

    private async assertKnowledgebaseTaskReadAccess(
        knowledgebaseId: string,
        options?: FindOneOptions<Knowledgebase>
    ): Promise<Knowledgebase> {
        const knowledgebase = await this.findOne(knowledgebaseId, options)
        if (await this.resourceAccess?.authorize(knowledgebaseId, 'read')) return knowledgebase
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

    async canManageKnowledgebase(knowledgebaseId: string): Promise<boolean> {
        try {
            await this.resourceAccess?.authorize(knowledgebaseId, 'manage')
            await this.assertKnowledgebaseWriteAccess(knowledgebaseId, { select: { id: true } })
            return true
        } catch (error) {
            if (error instanceof ForbiddenException) return false
            throw error
        }
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
        const shared = await this.tenantLibraries?.find(knowledgebaseId, options)
        if (shared) {
            assertTenantLibraryAdministrator()
            return shared
        }
        const accessSelect = addKnowledgebaseWriteAccessSelect(options)
        const knowledgebase = await this.findOne(knowledgebaseId, accessSelect.options)
        if (await this.resourceAccess?.authorize(knowledgebaseId, 'write')) {
            return stripKnowledgebaseWriteAccessSelect(knowledgebase, accessSelect)
        } else if ((await appPlatformKnowledgeIds(this.repository.manager))?.includes(knowledgebaseId)) {
            return stripKnowledgebaseWriteAccessSelect(knowledgebase, accessSelect)
        } else if (knowledgebase.workspaceId) {
            await this.assertWorkspaceWriteAccess(knowledgebase.workspaceId)
        } else if (!RequestContext.currentUserId() || knowledgebase.createdById !== RequestContext.currentUserId()) {
            throw accessDenied()
        }
        return stripKnowledgebaseWriteAccessSelect(knowledgebase, accessSelect)
    }

    resolveKnowledgebaseFolderAncestors(
        ...args: Parameters<KnowledgebaseTaskOperations['resolveKnowledgebaseFolderAncestors']>
    ): ReturnType<KnowledgebaseTaskOperations['resolveKnowledgebaseFolderAncestors']> {
        return this.taskOperations().resolveKnowledgebaseFolderAncestors(...args)
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

    previewFile(
        ...args: Parameters<KnowledgebaseTaskOperations['previewFile']>
    ): ReturnType<KnowledgebaseTaskOperations['previewFile']> {
        return this.taskOperations().previewFile(...args)
    }

    transformDocuments(
        ...args: Parameters<KnowledgebaseTaskOperations['transformDocuments']>
    ): ReturnType<KnowledgebaseTaskOperations['transformDocuments']> {
        return this.taskOperations().transformDocuments(...args)
    }

    private updateOperations(): KnowledgebaseUpdateOperations {
        return new KnowledgebaseUpdateOperations({
            assertKnowledgebaseWriteAccess: (...args) => this.assertKnowledgebaseWriteAccess(...args),
            documentService: this.documentService,
            findOneByIdString: (...args) => this.findOneByIdString(...args),
            i18nService: this.i18nService,
            keywordAnalyzers: this.keywordAnalyzers,
            parserSettings: this.parserSettings,
            repository: this.repository,
            resolveEmbeddingModelTarget: (...args) => this.resolveEmbeddingModelTarget(...args),
            resourceAccess: this.resourceAccess,
            saveSettings: (entity) => super.save(entity),
            startEmbeddingRebuild: (...args) => this.startEmbeddingRebuild(...args),
            vectorStoreSettings: this.vectorStoreSettings
        })
    }

    private filterOperations(): KnowledgebaseFilterOperations {
        return new KnowledgebaseFilterOperations({
            dataSource: this.dataSource
        })
    }

    private rebuildOperations(): KnowledgebaseRebuildOperations {
        return new KnowledgebaseRebuildOperations({
            logger: this.#logger,
            assertKnowledgebaseWriteAccess: (...args) => this.assertKnowledgebaseWriteAccess(...args),
            createVectorStoreForModel: (...args) => this.createVectorStoreForModel(...args),
            dataSource: this.dataSource,
            documentService: this.documentService,
            findOne: (...args) => this.findOne(...args),
            getEmbeddingModelName: (...args) => this.getEmbeddingModelName(...args),
            getEmbeddingProviderName: (...args) => this.getEmbeddingProviderName(...args),
            getPendingVectorStoreForRebuild: (...args) => this.getPendingVectorStoreForRebuild(...args),
            getPendingVectorStoreRelations: (...args) => this.getPendingVectorStoreRelations(...args),
            rebuildQueue: this.rebuildQueue,
            save: (...args) => this.save(...args),
            update: (...args) => this.update(...args)
        })
    }

    private embeddingOperations(): KnowledgebaseEmbeddingOperations {
        return new KnowledgebaseEmbeddingOperations({
            commandBus: this.commandBus,
            findOne: (...args) => this.findOne(...args),
            i18nService: this.i18nService,
            queryBus: this.queryBus,
            repository: this.repository
        })
    }

    private taskOperations(): KnowledgebaseTaskOperations {
        return new KnowledgebaseTaskOperations({
            assertKnowledgebaseTaskReadAccess: (...args) => this.assertKnowledgebaseTaskReadAccess(...args),
            assertKnowledgebaseTaskWriteAccess: (...args) => this.assertKnowledgebaseTaskWriteAccess(...args),
            commandBus: this.commandBus,
            docTransformerRegistry: this.docTransformerRegistry,
            documentService: this.documentService,
            knowledgeWorkAreaResolver: this.knowledgeWorkAreaResolver,
            processTask: (...args) => this.processTask(...args),
            queryBus: this.queryBus,
            resolveKnowledgebaseFolderAncestors: (...args) => this.resolveKnowledgebaseFolderAncestors(...args),
            taskService: this.taskService,
            transformDocuments: (...args) => this.transformDocuments(...args)
        })
    }

    private pipelineOperations(): KnowledgebasePipelineOperations {
        return new KnowledgebasePipelineOperations({
            assertKnowledgebaseWriteAccess: (...args) => this.assertKnowledgebaseWriteAccess(...args),
            commandBus: this.commandBus,
            create: (...args) => this.create(...args),
            i18nService: this.i18nService,
            integrationService: this.integrationService,
            knowledgeStrategyRegistry: this.knowledgeStrategyRegistry,
            searchExternalKnowledgebase: (...args) => this.searchExternalKnowledgebase(...args),
            xpertService: this.xpertService
        })
    }
}
