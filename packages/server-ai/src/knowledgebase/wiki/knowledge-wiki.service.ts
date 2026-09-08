import {
    KnowledgeWikiManagementStatus,
    KnowledgeWikiPageDetail,
    KnowledgeWikiPageLink,
    KnowledgeWikiPageListItem,
    KnowledgeWikiPageListParams,
    KnowledgeWikiPageListResult,
    KnowledgeWikiReaderStatus,
    KnowledgeWikiRecoveryAction,
    KnowledgeWikiStatusResponse,
    isDocumentKnowledgebaseType,
    normalizeKnowledgebaseWikiConfig
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { Brackets, FindOptionsWhere, ILike, In, IsNull, Not, Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseDetailDTO } from '../dto'
import { KnowledgebaseService } from '../knowledgebase.service'
import {
    KnowledgeWikiJob,
    KnowledgeWikiModelInvocation,
    KnowledgeWikiPage,
    KnowledgeWikiPageEvidenceEntity,
    KnowledgeWikiPageLinkEntity,
    KnowledgeWikiPageVersion,
    KnowledgeWikiSourceState
} from './entities'
import { RebuildKnowledgeWikiDTO, RetryKnowledgeWikiJobDTO, UpdateKnowledgeWikiConfigDTO } from './dto'
import { createKnowledgeWikiConfigFingerprint, resolveKnowledgeWikiModel } from './knowledge-wiki-config'
import { KnowledgeWikiGenerationService } from './knowledge-wiki-generation.service'
import { queryKnowledgeWikiDocumentStatus } from './knowledge-wiki-document-status'
import { queryKnowledgeWikiDocumentProgress } from './knowledge-wiki-document-progress-query'

type KnowledgeWikiScope = {
    knowledgebase: Knowledgebase
    tenantId: string | ReturnType<typeof IsNull>
    organizationId: string | ReturnType<typeof IsNull>
}

@Injectable()
export class KnowledgeWikiService {
    @Inject(KnowledgeWikiGenerationService)
    private readonly generationService: KnowledgeWikiGenerationService

    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        @InjectRepository(KnowledgeWikiPage)
        private readonly pageRepository: Repository<KnowledgeWikiPage>,
        @InjectRepository(KnowledgeWikiPageVersion)
        private readonly pageVersionRepository: Repository<KnowledgeWikiPageVersion>,
        @InjectRepository(KnowledgeWikiPageEvidenceEntity)
        private readonly evidenceRepository: Repository<KnowledgeWikiPageEvidenceEntity>,
        @InjectRepository(KnowledgeWikiPageLinkEntity)
        private readonly linkRepository: Repository<KnowledgeWikiPageLinkEntity>,
        @InjectRepository(KnowledgeWikiJob)
        private readonly jobRepository: Repository<KnowledgeWikiJob>,
        @InjectRepository(KnowledgeWikiModelInvocation)
        private readonly invocationRepository: Repository<KnowledgeWikiModelInvocation>,
        @InjectRepository(KnowledgeWikiSourceState)
        private readonly sourceStateRepository: Repository<KnowledgeWikiSourceState>
    ) {}

    async updateConfiguration(knowledgebaseId: string, input: UpdateKnowledgeWikiConfigDTO) {
        const knowledgebase = await this.knowledgebaseService.updateWikiConfiguration(knowledgebaseId, input)
        if (knowledgebase.wikiStatus === 'rebuild_required' && input.confirmModelCharges === true) {
            await this.generationService.rebuild({
                knowledgebaseId,
                userId: RequestContext.currentUserId(),
                confirmModelCharges: true,
                maxModelInvocations: input.maxModelInvocations,
                maxEstimatedTokens: input.maxEstimatedTokens
            })
            knowledgebase.wikiStatus = 'indexing'
            knowledgebase.wikiAvailability = knowledgebase.wikiActiveRevision ? 'degraded' : 'unavailable'
        }
        return new KnowledgebaseDetailDTO(knowledgebase)
    }

    rebuild(knowledgebaseId: string, input: RebuildKnowledgeWikiDTO, userId: string) {
        return this.generationService.rebuild({ knowledgebaseId, userId, ...input })
    }

    retry(knowledgebaseId: string, jobId: string, input: RetryKnowledgeWikiJobDTO, userId: string) {
        return this.generationService.retry({ knowledgebaseId, jobId, userId, ...input })
    }

    async getStatus(knowledgebaseId: string): Promise<KnowledgeWikiStatusResponse> {
        const scope = await this.getScope(knowledgebaseId)
        const config = normalizeKnowledgebaseWikiConfig(scope.knowledgebase.wikiConfig)
        const status = config.enabled ? (scope.knowledgebase.wikiStatus ?? 'rebuild_required') : 'disabled'
        const availability = config.enabled ? (scope.knowledgebase.wikiAvailability ?? 'unavailable') : 'unavailable'
        const readyPageCount = await this.pageRepository.count({
            where: {
                ...this.pageScope(scope),
                status: 'ready',
                activeVersionId: Not(IsNull())
            }
        })
        const canManage = await this.canManage(knowledgebaseId)
        const requiresManagement = status === 'failed' || status === 'rebuild_required'
        const errorCode = requiresManagement ? 'knowledge_wiki_attention_required' : null

        if (!canManage) {
            const readerStatus: KnowledgeWikiReaderStatus = {
                canManage: false,
                enabled: config.enabled,
                status,
                availability,
                readyPageCount,
                requiresManagement,
                errorCode
            }
            return readerStatus
        }

        const [stale, failed, archived, projectionFailed, queued, running, failedJobs, invocationCounts, sourceCounts] =
            await Promise.all([
                this.countPages(scope, { status: 'stale' }),
                this.countPages(scope, { status: 'failed' }),
                this.countPages(scope, { status: 'archived' }),
                this.countPages(scope, { projectionStatus: 'failed' }),
                this.countJobs(scope, 'queued'),
                this.countJobs(scope, 'running'),
                this.countJobs(scope, 'failed'),
                this.getInvocationStatus(scope),
                this.getSourceCleanupStatus(scope)
            ])

        const managementStatus: KnowledgeWikiManagementStatus = {
            canManage: true,
            enabled: config.enabled,
            status,
            availability,
            readyPageCount,
            requiresManagement:
                requiresManagement ||
                failed > 0 ||
                projectionFailed > 0 ||
                failedJobs > 0 ||
                invocationCounts.indeterminateCount > 0 ||
                invocationCounts.billingRecoveryCount > 0 ||
                sourceCounts.cleanupFailedCount > 0,
            errorCode,
            activeRevision: scope.knowledgebase.wikiActiveRevision ?? null,
            stagedRevision: scope.knowledgebase.wikiStagedRevision ?? null,
            activeConfigFingerprint: scope.knowledgebase.wikiConfigFingerprint ?? null,
            targetConfigFingerprint: config.enabled
                ? createKnowledgeWikiConfigFingerprint(config, resolveKnowledgeWikiModel(scope.knowledgebase))
                : null,
            rebuildRequiredReason: scope.knowledgebase.wikiRebuildRequiredReason ?? null,
            generationJobs: {
                queued,
                running,
                failed: failedJobs
            },
            pages: {
                ready: readyPageCount,
                stale,
                failed,
                archived,
                projectionFailed
            },
            indeterminateInvocationCount: invocationCounts.indeterminateCount,
            billingRecoveryCount: invocationCounts.billingRecoveryCount,
            cleanupPendingCount: sourceCounts.cleanupPendingCount,
            cleanupFailedCount: sourceCounts.cleanupFailedCount,
            recoveryActions: invocationCounts.recoveryActions
        }
        return managementStatus
    }

    async getDocumentStatus(knowledgebaseId: string, documentIds: string[]) {
        const { knowledgebase } = await this.getScope(knowledgebaseId)
        const canManage = await this.canManage(knowledgebaseId)
        // Read publication visibility and job progress from the same snapshot during concurrent updates.
        return this.evidenceRepository.manager.transaction('REPEATABLE READ', async (manager) => {
            const status = await queryKnowledgeWikiDocumentStatus(manager, knowledgebase, documentIds)
            const documents = await queryKnowledgeWikiDocumentProgress(
                manager,
                knowledgebase,
                documentIds,
                status.indexedDocumentIds,
                canManage
            )
            return { ...status, documents }
        })
    }

    async listPages(
        knowledgebaseId: string,
        params: KnowledgeWikiPageListParams = {}
    ): Promise<KnowledgeWikiPageListResult> {
        const scope = await this.getScope(knowledgebaseId)
        this.assertWikiEnabled(scope)
        const canManage = await this.canManage(knowledgebaseId)
        if (params.status && params.status !== 'ready' && !canManage) {
            throw new ForbiddenException(
                t('server-ai:Error.KnowledgebaseWikiPageDiagnosticsForbidden', {
                    defaultValue: 'Wiki page diagnostics require write access'
                })
            )
        }
        const search = params.search?.normalize('NFKC').trim()
        if (search && search.length > 200) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgebaseWikiSearchTooLong', {
                    defaultValue: 'Wiki search must be 200 characters or fewer'
                })
            )
        }
        const skip = params.skip ?? 0
        const take = params.take ?? 50
        if (!Number.isInteger(skip) || skip < 0 || !Number.isInteger(take) || take < 1 || take > 100) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgebaseWikiPaginationInvalid', {
                    defaultValue: 'Wiki pagination is invalid'
                })
            )
        }
        const status = params.status ?? 'ready'
        const baseWhere: FindOptionsWhere<KnowledgeWikiPage> = {
            ...this.pageScope(scope),
            status,
            ...(params.pageType ? { pageType: params.pageType } : {}),
            ...(status === 'ready' ? { activeVersionId: Not(IsNull()) } : {})
        }
        const where: FindOptionsWhere<KnowledgeWikiPage> | FindOptionsWhere<KnowledgeWikiPage>[] = search
            ? [
                  { ...baseWhere, canonicalName: ILike(`%${search}%`) },
                  { ...baseWhere, slug: ILike(`%${search}%`) }
              ]
            : baseWhere
        const [pages, total] = await this.pageRepository.findAndCount({
            where,
            order: { updatedAt: 'DESC', id: 'ASC' },
            skip,
            take
        })
        const activeVersionIds = pages.flatMap((page) => (page.activeVersionId ? [page.activeVersionId] : []))
        const versions = activeVersionIds.length
            ? await this.pageVersionRepository.find({
                  where: {
                      tenantId: scope.tenantId,
                      organizationId: scope.organizationId,
                      knowledgebaseId: scope.knowledgebase.id,
                      id: In(activeVersionIds),
                      status: 'ready'
                  }
              })
            : []
        const versionsById = new Map(versions.flatMap((version) => (version.id ? [[version.id, version]] : [])))
        const items = pages.flatMap((page): KnowledgeWikiPageListItem[] => {
            const version = page.activeVersionId ? versionsById.get(page.activeVersionId) : undefined
            if (page.status === 'ready' && !version) return []
            return [
                {
                    id: page.id,
                    pageKey: page.pageKey,
                    pageType: page.pageType,
                    canonicalName: page.canonicalName,
                    title: page.status === 'ready' ? (version?.title ?? page.canonicalName) : page.canonicalName,
                    slug: page.slug,
                    summary: page.status === 'ready' ? (version?.summary ?? '') : '',
                    aliases: page.status === 'ready' ? (version?.aliases ?? []) : [],
                    status: page.status,
                    projectionStatus: page.projectionStatus,
                    updatedAt: page.updatedAt
                }
            ]
        })
        return {
            items,
            total: Math.max(0, total - (pages.length - items.length))
        }
    }

    async getPage(knowledgebaseId: string, pageId: string): Promise<KnowledgeWikiPageDetail> {
        const scope = await this.getScope(knowledgebaseId)
        this.assertWikiEnabled(scope)
        const page = await this.pageRepository.findOne({
            where: {
                ...this.pageScope(scope),
                id: pageId
            }
        })
        if (!page) throw this.pageNotFound()
        const canManage = await this.canManage(knowledgebaseId)
        if (!this.isPageServiceable(page)) {
            if (!canManage) throw this.pageNotFound()
            return this.toDiagnosticPage(page)
        }

        const version = await this.pageVersionRepository.findOne({
            where: {
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                knowledgebaseId: scope.knowledgebase.id,
                pageId: page.id,
                id: page.activeVersionId,
                status: 'ready',
                projectionStatus: 'ready'
            }
        })
        if (!version) {
            if (!canManage) throw this.pageNotFound()
            return this.toDiagnosticPage(page)
        }

        const [evidenceRows, outgoingRows, backlinkRows] = await Promise.all([
            this.evidenceRepository.find({
                where: {
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    knowledgebaseId: scope.knowledgebase.id,
                    pageId: page.id,
                    pageVersionId: version.id
                },
                order: { ordinal: 'ASC', id: 'ASC' }
            }),
            this.linkRepository.find({
                where: {
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    knowledgebaseId: scope.knowledgebase.id,
                    sourcePageId: page.id,
                    sourcePageVersionId: version.id
                },
                order: { id: 'ASC' }
            }),
            this.linkRepository.find({
                where: {
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    knowledgebaseId: scope.knowledgebase.id,
                    targetPageId: page.id
                },
                order: { id: 'ASC' }
            })
        ])
        const sourceIds = [...new Set(evidenceRows.map((evidence) => evidence.sourceDocumentIdSnapshot))]
        const eligibleSourceStates = sourceIds.length
            ? await this.sourceStateRepository.find({
                  where: {
                      tenantId: scope.tenantId,
                      organizationId: scope.organizationId,
                      knowledgebaseId: scope.knowledgebase.id,
                      sourceDocumentIdSnapshot: In(sourceIds),
                      eligible: true,
                      cleanupPending: false
                  }
              })
            : []
        const eligibleSources = new Map(eligibleSourceStates.map((state) => [state.sourceDocumentIdSnapshot, state]))
        if (
            evidenceRows.some((evidence) => {
                const source = eligibleSources.get(evidence.sourceDocumentIdSnapshot)
                return !source || source.lastContentHash !== evidence.sourceContentHash
            })
        ) {
            if (!canManage) throw this.pageNotFound()
            return {
                ...this.toDiagnosticPage(page),
                status: 'stale',
                projectionStatus: 'disabled'
            }
        }
        const [links, backlinks] = await Promise.all([
            this.resolveLinks(
                scope,
                outgoingRows.map((link) => link.targetPageId),
                outgoingRows
            ),
            this.resolveLinks(
                scope,
                backlinkRows.map((link) => link.sourcePageId),
                backlinkRows,
                true
            )
        ])

        return {
            id: page.id,
            pageKey: page.pageKey,
            pageType: page.pageType,
            canonicalName: page.canonicalName,
            title: version.title,
            slug: page.slug,
            summary: version.summary,
            aliases: version.aliases,
            status: page.status,
            projectionStatus: page.projectionStatus,
            updatedAt: page.updatedAt,
            markdown: version.contentMarkdown,
            revision: version.generationRevision,
            links,
            backlinks,
            evidence: evidenceRows.map((evidence) => ({
                id: evidence.id,
                sourceDocumentId: evidence.sourceDocumentIdSnapshot,
                sourceChunkId: evidence.sourceChunkIdSnapshot,
                quote: evidence.quote,
                ordinal: evidence.ordinal,
                sectionAnchor: evidence.sectionAnchor,
                sourceAvailable: true
            }))
        }
    }

    private async getScope(knowledgebaseId: string): Promise<KnowledgeWikiScope> {
        const knowledgebase = await this.knowledgebaseService.findOneByIdString(knowledgebaseId, {
            relations: ['chatModel', 'wikiModel'],
            select: {
                id: true,
                tenantId: true,
                organizationId: true,
                workspaceId: true,
                createdById: true,
                permission: true,
                type: true,
                wikiConfig: true,
                wikiStatus: true,
                wikiAvailability: true,
                wikiActiveRevision: true,
                wikiStagedRevision: true,
                wikiConfigFingerprint: true,
                wikiRebuildRequiredReason: true,
                chatModelId: true,
                wikiModelId: true,
                chatModel: {
                    copilotId: true,
                    referencedId: true,
                    modelType: true,
                    model: true,
                    options: true
                },
                wikiModel: {
                    copilotId: true,
                    referencedId: true,
                    modelType: true,
                    model: true,
                    options: true
                }
            }
        })
        if (!isDocumentKnowledgebaseType(knowledgebase.type)) {
            throw new ForbiddenException(
                t('server-ai:Error.KnowledgebaseWikiUnsupportedType', {
                    defaultValue: 'Wiki can only be enabled for standard knowledgebases'
                })
            )
        }
        return {
            knowledgebase,
            tenantId: knowledgebase.tenantId ?? IsNull(),
            organizationId: knowledgebase.organizationId ?? IsNull()
        }
    }

    private assertWikiEnabled(scope: KnowledgeWikiScope) {
        if (!normalizeKnowledgebaseWikiConfig(scope.knowledgebase.wikiConfig).enabled) {
            throw this.pageNotFound()
        }
    }

    private isPageServiceable(page: KnowledgeWikiPage) {
        return page.status === 'ready' && page.projectionStatus === 'ready' && !!page.activeVersionId
    }

    private toDiagnosticPage(page: KnowledgeWikiPage): KnowledgeWikiPageDetail {
        return {
            id: page.id,
            pageKey: page.pageKey,
            pageType: page.pageType,
            canonicalName: page.canonicalName,
            title: page.canonicalName,
            slug: page.slug,
            summary: '',
            aliases: [],
            status: page.status,
            projectionStatus: page.projectionStatus,
            updatedAt: page.updatedAt,
            markdown: '',
            revision: 0,
            links: [],
            backlinks: [],
            evidence: []
        }
    }

    private async resolveLinks(
        scope: KnowledgeWikiScope,
        pageIds: string[],
        rows: KnowledgeWikiPageLinkEntity[],
        backlinks = false
    ): Promise<KnowledgeWikiPageLink[]> {
        const uniqueIds = [...new Set(pageIds)]
        if (!uniqueIds.length) return []
        const pages = await this.pageRepository.find({
            where: {
                ...this.pageScope(scope),
                id: In(uniqueIds),
                status: 'ready',
                projectionStatus: 'ready',
                activeVersionId: Not(IsNull())
            }
        })
        const pagesById = new Map(pages.flatMap((page) => (page.id ? [[page.id, page]] : [])))
        return rows.flatMap((row): KnowledgeWikiPageLink[] => {
            const linkedPageId = backlinks ? row.sourcePageId : row.targetPageId
            const linkedPage = pagesById.get(linkedPageId)
            if (!linkedPage) return []
            if (backlinks && row.sourcePageVersionId !== linkedPage.activeVersionId) return []
            return [
                {
                    pageId: linkedPage.id,
                    pageType: linkedPage.pageType,
                    title: linkedPage.canonicalName,
                    slug: linkedPage.slug,
                    sectionAnchor: row.sectionAnchor,
                    label: row.label
                }
            ]
        })
    }

    private pageNotFound() {
        return new NotFoundException(
            t('server-ai:Error.KnowledgebaseWikiPageNotFound', {
                defaultValue: 'Wiki page was not found'
            })
        )
    }

    private async canManage(knowledgebaseId: string) {
        return this.knowledgebaseService.canManageKnowledgebase(knowledgebaseId)
    }

    private pageScope(scope: KnowledgeWikiScope): FindOptionsWhere<KnowledgeWikiPage> {
        return {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            knowledgebaseId: scope.knowledgebase.id
        }
    }

    private countPages(
        scope: KnowledgeWikiScope,
        where: Pick<FindOptionsWhere<KnowledgeWikiPage>, 'status' | 'projectionStatus'>
    ) {
        return this.pageRepository.count({ where: { ...this.pageScope(scope), ...where } })
    }

    private countJobs(scope: KnowledgeWikiScope, status: KnowledgeWikiJob['status']) {
        return this.jobRepository.count({
            where: {
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                knowledgebaseId: scope.knowledgebase.id,
                status,
                isCurrent: true
            }
        })
    }

    private async getInvocationStatus(scope: KnowledgeWikiScope) {
        const where = {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            knowledgebaseId: scope.knowledgebase.id
        }
        const recovery = this.invocationRepository
            .createQueryBuilder('invocation')
            .innerJoinAndSelect('invocation.job', 'job')
            .where(where)
            .andWhere('job."isCurrent" = true')
            .andWhere('job."knowledgebaseId" = invocation."knowledgebaseId"')
            .andWhere('job."tenantId" IS NOT DISTINCT FROM invocation."tenantId"')
            .andWhere('job."organizationId" IS NOT DISTINCT FROM invocation."organizationId"')
            .andWhere('invocation."generationAttempt" = job."generationAttempt"')
            .andWhere(
                new Brackets((query) => {
                    query
                        .where(
                            `(job.status = :failed AND (invocation.status = :indeterminate
                                OR (invocation.status = :failed AND invocation."reconciliationStatus" = :notExecuted)))`,
                            { failed: 'failed', indeterminate: 'indeterminate', notExecuted: 'not_executed' }
                        )
                        .orWhere(
                            `(job.status IN (:...activeStatuses) AND (invocation.status = :reconciling
                                OR invocation."reconciliationStatus" = :pending))`,
                            {
                                activeStatuses: ['queued', 'running', 'failed'],
                                reconciling: 'reconciling',
                                pending: 'pending'
                            }
                        )
                })
            )
        const [indeterminateCount, billingRecoveryCount, invocations] = await Promise.all([
            recovery
                .clone()
                .andWhere('invocation.status = :indeterminate', { indeterminate: 'indeterminate' })
                .getCount(),
            // Billing recovery retains its complete history independently of current generation warnings.
            this.invocationRepository.count({ where: { ...where, billingStatus: 'failed' } }),
            recovery.orderBy('invocation.updatedAt', 'DESC').addOrderBy('invocation.id', 'DESC').take(20).getMany()
        ])
        return {
            indeterminateCount,
            billingRecoveryCount,
            recoveryActions: invocations.flatMap((invocation) => this.toRecoveryAction(invocation))
        }
    }

    private toRecoveryAction(invocation: KnowledgeWikiModelInvocation): KnowledgeWikiRecoveryAction[] {
        if (!invocation.id) return []
        if (invocation.status === 'reconciling' || invocation.reconciliationStatus === 'pending') {
            return [
                {
                    jobId: invocation.jobId,
                    invocationId: invocation.id,
                    reconciliationStatus: 'pending',
                    canRetry: false,
                    requiresAdditionalChargeConfirmation: false,
                    inputCurrent: invocation.job?.isCurrent === true,
                    recommendedAction: 'wait'
                }
            ]
        }
        const inputCurrent = invocation.job?.isCurrent === true && invocation.job.status === 'failed'
        const notExecuted = invocation.status === 'failed' && invocation.reconciliationStatus === 'not_executed'
        return [
            {
                jobId: invocation.jobId,
                invocationId: invocation.id,
                reconciliationStatus: notExecuted ? 'not_executed' : 'indeterminate',
                ...(notExecuted
                    ? {
                          failureReason:
                              invocation.errorCode === 'provider_request_rejected'
                                  ? ('request_rejected' as const)
                                  : ('preparation_failed' as const)
                      }
                    : {}),
                canRetry: inputCurrent,
                requiresAdditionalChargeConfirmation: inputCurrent && !notExecuted,
                inputCurrent,
                recommendedAction: inputCurrent ? 'retry_job' : 'full_rebuild'
            }
        ]
    }

    private async getSourceCleanupStatus(scope: KnowledgeWikiScope) {
        const where = {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            knowledgebaseId: scope.knowledgebase.id
        }
        const [cleanupPendingCount, cleanupFailedCount] = await Promise.all([
            this.sourceStateRepository.count({ where: { ...where, cleanupPending: true } }),
            this.sourceStateRepository.count({ where: { ...where, cleanupFailed: true } })
        ])
        return { cleanupPendingCount, cleanupFailedCount }
    }
}
