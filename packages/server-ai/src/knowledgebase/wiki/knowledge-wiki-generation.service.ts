import {
    KBDocumentStatusEnum,
    KnowledgeWikiPageContributionPayload,
    normalizeKnowledgebaseWikiConfig
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { In, IsNull, Not, Repository } from 'typeorm'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase.service'
import {
    KnowledgeWikiJob,
    KnowledgeWikiModelInvocation,
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiSourceMapResult,
    KnowledgeWikiSourceState
} from './entities'
import {
    KNOWLEDGE_WIKI_GENERATOR_VERSION,
    createKnowledgeWikiConfigFingerprint,
    resolveKnowledgeWikiModel
} from './knowledge-wiki-config'
import {
    createKnowledgeWikiMapBatches,
    hashKnowledgeWikiValue,
    isEligibleKnowledgeWikiSource,
    mergeKnowledgeWikiMapPages
} from './knowledge-wiki-generation.utils'
import { createKnowledgeWikiMappedPageIdentity } from './knowledge-wiki-identity'
import { KnowledgeWikiFinalizeService } from './knowledge-wiki-finalize.service'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiJobFenceService } from './knowledge-wiki-job-fence.service'
import { KnowledgeWikiJobLeaseService } from './knowledge-wiki-job-lease.service'
import { KnowledgeWikiModelInvocationService } from './knowledge-wiki-model-invocation.service'
import { KnowledgeWikiPageReduceService } from './knowledge-wiki-page-reduce.service'
import { KnowledgeWikiRebuildCoordinatorService } from './knowledge-wiki-rebuild-coordinator.service'
import { KnowledgeWikiRetractionService } from './knowledge-wiki-retraction.service'
import { KnowledgeWikiError } from './knowledge-wiki-error'
import { KnowledgeWikiEnqueueSourceInput, KnowledgeWikiRebuildInput, KnowledgeWikiRetryInput } from './types'

const MAX_DISPATCH_ERROR_LENGTH = 4000

@Injectable()
export class KnowledgeWikiGenerationService {
    private readonly logger = new Logger(KnowledgeWikiGenerationService.name)

    constructor(
        @InjectRepository(Knowledgebase)
        private readonly knowledgebaseRepository: Repository<Knowledgebase>,
        @InjectRepository(KnowledgeDocument)
        private readonly documentRepository: Repository<KnowledgeDocument>,
        @InjectRepository(KnowledgeWikiJob)
        private readonly jobRepository: Repository<KnowledgeWikiJob>,
        @InjectRepository(KnowledgeWikiSourceState)
        private readonly sourceStateRepository: Repository<KnowledgeWikiSourceState>,
        @InjectRepository(KnowledgeWikiSourceMapResult)
        private readonly mapResultRepository: Repository<KnowledgeWikiSourceMapResult>,
        @InjectRepository(KnowledgeWikiPage)
        private readonly pageRepository: Repository<KnowledgeWikiPage>,
        @InjectRepository(KnowledgeWikiPageContribution)
        private readonly contributionRepository: Repository<KnowledgeWikiPageContribution>,
        @InjectRepository(KnowledgeWikiModelInvocation)
        private readonly invocationRepository: Repository<KnowledgeWikiModelInvocation>,
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly dispatcher: KnowledgeWikiJobDispatcherService,
        private readonly jobFence: KnowledgeWikiJobFenceService,
        private readonly lease: KnowledgeWikiJobLeaseService,
        private readonly rebuildCoordinator: KnowledgeWikiRebuildCoordinatorService,
        private readonly modelInvocationService: KnowledgeWikiModelInvocationService,
        private readonly pageReducer: KnowledgeWikiPageReduceService,
        private readonly finalizer: KnowledgeWikiFinalizeService,
        private readonly retractionService: KnowledgeWikiRetractionService
    ) {}

    async enqueueSource(input: KnowledgeWikiEnqueueSourceInput) {
        const knowledgebase = await this.jobFence.loadKnowledgebase(input.knowledgebaseId)
        const config = normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig)
        if (!config.enabled || !knowledgebase.tenantId) return null

        const targetFingerprint = createKnowledgeWikiConfigFingerprint(config, resolveKnowledgeWikiModel(knowledgebase))
        const document = await this.documentRepository.findOne({
            where: { id: input.documentId, knowledgebaseId: knowledgebase.id },
            relations: ['chunks']
        })
        if (!isEligibleKnowledgeWikiSource(document)) {
            return this.retractionService.enqueue({
                knowledgebaseId: knowledgebase.id,
                documentId: input.documentId,
                userId: input.userId,
                reason: document?.deletedAt
                    ? 'soft_deleted'
                    : document?.hardDeletePendingAt
                      ? 'hard_deleted'
                      : 'disabled'
            })
        }

        const currentState = await this.sourceStateRepository.findOne({
            where: {
                knowledgebaseId: knowledgebase.id,
                sourceDocumentIdSnapshot: document.id
            }
        })
        if (
            currentState?.eligible === true &&
            currentState.lastContentHash === document.contentHash &&
            currentState.generationPending === false
        ) {
            return currentState.desiredRootJobId
                ? this.jobRepository.findOne({ where: { id: currentState.desiredRootJobId } })
                : null
        }

        const lifecycleGeneration = (currentState?.lifecycleGeneration ?? 0) + 1
        const sourceState = this.sourceStateRepository.create({
            ...(currentState ?? {}),
            tenantId: knowledgebase.tenantId,
            organizationId: knowledgebase.organizationId,
            knowledgebaseId: knowledgebase.id,
            sourceDocumentIdSnapshot: document.id,
            lifecycleGeneration,
            lastEventType: currentState?.lastContentHash ? 'content_changed' : 'finish',
            lastContentHash: document.contentHash,
            eligible: true,
            cleanupPending: false,
            cleanupFailed: false,
            generationPending: true,
            generationPendingReason: null
        })

        if (
            knowledgebase.wikiConfigFingerprint !== targetFingerprint ||
            knowledgebase.wikiStatus === 'rebuild_required'
        ) {
            sourceState.generationPendingReason = 'full_rebuild_required'
            await this.sourceStateRepository.save(sourceState)
            return null
        }

        await this.invalidateSourcePages(knowledgebase.id, document.id)
        const revision = knowledgebase.wikiActiveRevision ?? knowledgebase.wikiRevision ?? 0
        const jobKey = `source:${document.id}:${lifecycleGeneration}:${revision}:${targetFingerprint}`
        let job = await this.jobRepository.findOne({ where: { knowledgebaseId: knowledgebase.id, jobKey } })
        if (!job) {
            job = await this.jobRepository.save(
                this.jobRepository.create({
                    tenantId: knowledgebase.tenantId,
                    organizationId: knowledgebase.organizationId,
                    knowledgebaseId: knowledgebase.id,
                    sourceDocumentIdSnapshot: document.id,
                    sourceLifecycleGeneration: lifecycleGeneration,
                    sourcePublicationEpoch: document.publicationEpoch ?? 0,
                    sourceContentHash: document.contentHash,
                    jobKey,
                    type: 'source_map',
                    status: 'queued',
                    isCurrent: true,
                    generationRevision: revision,
                    generationAttempt: 0,
                    executionAttempt: 0,
                    configFingerprint: targetFingerprint,
                    generatorVersion: KNOWLEDGE_WIKI_GENERATOR_VERSION,
                    billingPrincipalId: input.userId
                })
            )
            job.rootJobId = job.id
            job = await this.jobRepository.save(job)
        }
        sourceState.desiredRootJobId = job.id
        await this.sourceStateRepository.save(sourceState)
        await this.knowledgebaseRepository.update(knowledgebase.id, {
            wikiStatus: 'indexing',
            wikiBuildError: null
        })
        await this.dispatcher.dispatch(job, input.userId)
        return job
    }

    async rebuild(input: KnowledgeWikiRebuildInput) {
        await this.knowledgebaseService.assertKnowledgebaseWriteAccess(input.knowledgebaseId, { select: { id: true } })
        const knowledgebase = await this.jobFence.loadKnowledgebase(input.knowledgebaseId)
        const config = normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig)
        if (!config.enabled) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgebaseWikiDisabled', {
                    defaultValue: 'Wiki is disabled for this knowledgebase'
                })
            )
        }
        const documents = await this.jobFence.findEligibleDocuments(knowledgebase.id)
        await this.assertRebuildSources(knowledgebase.id, documents.length)
        if (documents.length && input.confirmModelCharges !== true) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgebaseWikiRebuildChargeConfirmationRequired', {
                    defaultValue: 'Confirm model charges before rebuilding a non-empty Wiki'
                })
            )
        }
        const fingerprint = createKnowledgeWikiConfigFingerprint(config, resolveKnowledgeWikiModel(knowledgebase))
        const revision = Math.max(knowledgebase.wikiRevision ?? 0, knowledgebase.wikiActiveRevision ?? 0) + 1
        const jobKey = `rebuild:${revision}:${fingerprint}`
        const existing = await this.jobRepository.findOne({
            where: { knowledgebaseId: knowledgebase.id, jobKey, isCurrent: true }
        })
        if (existing) return existing
        const job = await this.jobRepository.save(
            this.jobRepository.create({
                tenantId: knowledgebase.tenantId,
                organizationId: knowledgebase.organizationId,
                knowledgebaseId: knowledgebase.id,
                jobKey,
                type: 'rebuild',
                status: 'queued',
                isCurrent: true,
                generationRevision: revision,
                generationAttempt: 0,
                executionAttempt: 0,
                configFingerprint: fingerprint,
                generatorVersion: KNOWLEDGE_WIKI_GENERATOR_VERSION,
                billingPrincipalId: input.userId,
                spendEnvelope: {
                    maxModelInvocations: Math.min(
                        10_000,
                        Math.max(1, input.maxModelInvocations ?? documents.length * 20)
                    ),
                    maxEstimatedTokens: Math.min(
                        100_000_000,
                        Math.max(1_000, input.maxEstimatedTokens ?? documents.length * 200_000)
                    )
                },
                expectedChildren: documents.length,
                succeededChildren: -1
            })
        )
        job.rootJobId = job.id
        await this.jobRepository.save(job)
        await this.knowledgebaseRepository.update(knowledgebase.id, {
            wikiStatus: 'indexing',
            wikiStagedRevision: revision,
            wikiRevision: revision,
            wikiBuildError: null
        })
        await this.dispatcher.dispatch(job, input.userId)
        return job
    }

    async retry(input: KnowledgeWikiRetryInput) {
        await this.knowledgebaseService.assertKnowledgebaseWriteAccess(input.knowledgebaseId, { select: { id: true } })
        const job = await this.jobRepository.findOne({
            where: { id: input.jobId, knowledgebaseId: input.knowledgebaseId, isCurrent: true }
        })
        if (!job) {
            throw new NotFoundException(
                t('server-ai:Error.KnowledgebaseWikiJobNotFound', { defaultValue: 'Wiki job was not found' })
            )
        }
        if (job.status !== 'failed') {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgebaseWikiJobRetryInvalid', {
                    defaultValue: 'Only failed Wiki jobs can be retried'
                })
            )
        }
        const indeterminate = await this.invocationRepository.count({
            where: { jobId: job.id, generationAttempt: job.generationAttempt, status: 'indeterminate' }
        })
        if (indeterminate && input.confirmAdditionalModelCharge !== true) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgebaseWikiRetryChargeConfirmationRequired', {
                    defaultValue: 'Confirm the possible additional model charge before retrying this invocation'
                })
            )
        }
        if (indeterminate) job.generationAttempt += 1
        job.status = 'queued'
        job.error = null
        job.errorCode = null
        job.completedAt = null
        await this.jobRepository.save(job)
        await this.dispatcher.dispatch(job, input.userId)
        return job
    }

    async processJob(jobId: string) {
        const job = await this.jobRepository.findOne({ where: { id: jobId } })
        if (!job || ['succeeded', 'stale', 'cancelled'].includes(job.status)) return job
        const stopHeartbeat = await this.lease.acquire(job)
        if (!stopHeartbeat) return job

        try {
            if (job.type === 'source_map') await this.processSourceMap(job)
            else if (job.type === 'page_reduce') await this.pageReducer.process(job)
            else if (job.type === 'finalize') await this.finalizer.process(job)
            else if (job.type === 'rebuild') await this.processRebuild(job)
            else if (job.type === 'retract') await this.retractionService.process(job)
            else await this.dispatcher.markSucceeded(job.id)
        } catch (error) {
            if (job.type === 'retract' && job.sourceDocumentIdSnapshot) {
                await this.sourceStateRepository.update(
                    {
                        knowledgebaseId: job.knowledgebaseId,
                        sourceDocumentIdSnapshot: job.sourceDocumentIdSnapshot,
                        lifecycleGeneration: job.sourceLifecycleGeneration
                    },
                    { cleanupFailed: true }
                )
            }
            await this.failJob(job, error)
            throw error
        } finally {
            await stopHeartbeat()
        }
        return this.jobRepository.findOne({ where: { id: job.id } })
    }

    private async processRebuild(job: KnowledgeWikiJob) {
        const knowledgebase = await this.jobFence.assert(job, false)
        const documents = await this.jobFence.findEligibleDocuments(knowledgebase.id)
        await this.assertRebuildSources(knowledgebase.id, documents.length, job.expectedChildren)
        const children: KnowledgeWikiJob[] = []
        for (const document of documents) {
            const state = await this.prepareRebuildSourceState(knowledgebase, document, job.id)
            const jobKey = `${job.jobKey}:source:${document.id}:${state.lifecycleGeneration}`
            let child = await this.jobRepository.findOne({ where: { knowledgebaseId: knowledgebase.id, jobKey } })
            if (!child) {
                child = await this.jobRepository.save(
                    this.jobRepository.create({
                        tenantId: knowledgebase.tenantId,
                        organizationId: knowledgebase.organizationId,
                        knowledgebaseId: knowledgebase.id,
                        rootJobId: job.id,
                        parentJobId: job.id,
                        sourceDocumentIdSnapshot: document.id,
                        sourceLifecycleGeneration: state.lifecycleGeneration,
                        sourcePublicationEpoch: document.publicationEpoch ?? 0,
                        sourceContentHash: document.contentHash,
                        jobKey,
                        type: 'source_map',
                        status: 'queued',
                        isCurrent: true,
                        generationRevision: job.generationRevision,
                        generationAttempt: job.generationAttempt,
                        executionAttempt: 0,
                        configFingerprint: job.configFingerprint,
                        generatorVersion: job.generatorVersion,
                        billingPrincipalId: job.billingPrincipalId,
                        spendEnvelope: job.spendEnvelope
                    })
                )
            }
            state.desiredRootJobId = child.id
            await this.sourceStateRepository.save(state)
            children.push(child)
        }
        job.expectedChildren = children.length
        job.status = 'succeeded'
        job.completedAt = new Date()
        await this.jobRepository.save(job)
        await Promise.all(children.map((child) => this.dispatcher.dispatch(child, job.billingPrincipalId)))
        if (!children.length) {
            await this.rebuildCoordinator.scheduleAfterMap(job)
        }
    }

    private async processSourceMap(job: KnowledgeWikiJob) {
        const knowledgebase = await this.jobFence.assert(job)
        const document = await this.documentRepository.findOne({
            where: { id: job.sourceDocumentIdSnapshot, knowledgebaseId: knowledgebase.id },
            relations: ['chunks']
        })
        if (!isEligibleKnowledgeWikiSource(document) || !this.jobFence.isSourceCurrent(job, document)) {
            await this.jobRepository.update(job.id, { status: 'stale', isCurrent: false, completedAt: new Date() })
            return
        }
        const chunks = (document.chunks ?? [])
            .filter((chunk) => !!chunk.id && !!chunk.pageContent)
            .sort((left, right) => left.id.localeCompare(right.id))
        const batches = createKnowledgeWikiMapBatches(
            chunks,
            normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig)
        )
        const outputs: KnowledgeWikiPageContributionPayload[] = []
        for (let ordinal = 0; ordinal < batches.length; ordinal++) {
            const batch = batches[ordinal]
            const mapOutput = await this.modelInvocationService.invokeMapModel(
                job,
                knowledgebase,
                document.name ?? document.id,
                batch,
                ordinal
            )
            outputs.push(...mapOutput.pages)
        }
        const pages = mergeKnowledgeWikiMapPages(outputs)
        await this.mapResultRepository.delete({ sourceJobId: job.id })
        const mapResults: KnowledgeWikiSourceMapResult[] = []
        for (const payload of pages) {
            const identity = createKnowledgeWikiMappedPageIdentity(payload.pageType, payload.canonicalName, document.id)
            mapResults.push(
                await this.mapResultRepository.save(
                    this.mapResultRepository.create({
                        tenantId: knowledgebase.tenantId,
                        organizationId: knowledgebase.organizationId,
                        knowledgebaseId: knowledgebase.id,
                        sourceJobId: job.id,
                        generationRevision: job.generationRevision,
                        sourceLifecycleGeneration: job.sourceLifecycleGeneration,
                        sourceDocumentIdSnapshot: document.id,
                        sourceContentHash: document.contentHash,
                        pageType: payload.pageType,
                        canonicalName: payload.canonicalName,
                        normalizedPageKey: identity.pageKey,
                        payload
                    })
                )
            )
        }

        const rebuildRoot = job.parentJobId
            ? await this.jobRepository.findOne({ where: { id: job.parentJobId, type: 'rebuild', isCurrent: true } })
            : null
        if (rebuildRoot) {
            await this.dispatcher.markSucceeded(job.id)
            await this.rebuildCoordinator.scheduleAfterMap(rebuildRoot)
            return
        }

        const affectedPageKeys = new Set(mapResults.map((result) => result.normalizedPageKey))
        const previous = await this.contributionRepository.find({
            where: { knowledgebaseId: knowledgebase.id, sourceDocumentIdSnapshot: document.id }
        })
        if (previous.length) {
            const priorPages = await this.pageRepository.find({
                where: { id: In(previous.map((item) => item.pageId)) }
            })
            priorPages.forEach((page) => affectedPageKeys.add(page.pageKey))
        }
        const reduceJobs: KnowledgeWikiJob[] = []
        for (const pageKey of affectedPageKeys) {
            const jobKey = `${job.jobKey}:reduce:${hashKnowledgeWikiValue(pageKey).slice(0, 20)}`
            let child = await this.jobRepository.findOne({ where: { knowledgebaseId: knowledgebase.id, jobKey } })
            if (!child) {
                child = await this.jobRepository.save(
                    this.jobRepository.create({
                        tenantId: knowledgebase.tenantId,
                        organizationId: knowledgebase.organizationId,
                        knowledgebaseId: knowledgebase.id,
                        rootJobId: job.rootJobId ?? job.id,
                        parentJobId: job.id,
                        sourceDocumentIdSnapshot: document.id,
                        sourceLifecycleGeneration: job.sourceLifecycleGeneration,
                        sourcePublicationEpoch: job.sourcePublicationEpoch,
                        sourceContentHash: job.sourceContentHash,
                        pageKey,
                        jobKey,
                        type: 'page_reduce',
                        status: 'queued',
                        isCurrent: true,
                        generationRevision: job.generationRevision,
                        generationAttempt: job.generationAttempt,
                        executionAttempt: 0,
                        configFingerprint: job.configFingerprint,
                        generatorVersion: job.generatorVersion,
                        billingPrincipalId: job.billingPrincipalId,
                        spendEnvelope: job.spendEnvelope
                    })
                )
            }
            reduceJobs.push(child)
        }
        const finalizeKey = `${job.jobKey}:finalize`
        let finalizeJob = await this.jobRepository.findOne({
            where: { knowledgebaseId: knowledgebase.id, jobKey: finalizeKey }
        })
        if (!finalizeJob) {
            finalizeJob = await this.jobRepository.save(
                this.jobRepository.create({
                    tenantId: knowledgebase.tenantId,
                    organizationId: knowledgebase.organizationId,
                    knowledgebaseId: knowledgebase.id,
                    rootJobId: job.rootJobId ?? job.id,
                    parentJobId: job.id,
                    sourceDocumentIdSnapshot: document.id,
                    sourceLifecycleGeneration: job.sourceLifecycleGeneration,
                    sourcePublicationEpoch: job.sourcePublicationEpoch,
                    sourceContentHash: job.sourceContentHash,
                    jobKey: finalizeKey,
                    type: 'finalize',
                    status: 'queued',
                    isCurrent: true,
                    generationRevision: job.generationRevision,
                    generationAttempt: job.generationAttempt,
                    executionAttempt: 0,
                    configFingerprint: job.configFingerprint,
                    generatorVersion: job.generatorVersion,
                    billingPrincipalId: job.billingPrincipalId,
                    expectedChildren: reduceJobs.length
                })
            )
        }
        job.expectedChildren = reduceJobs.length + 1
        job.status = 'succeeded'
        job.completedAt = new Date()
        await this.jobRepository.save(job)
        await Promise.all(reduceJobs.map((child) => this.dispatcher.dispatch(child, job.billingPrincipalId)))
        await this.dispatcher.dispatch(finalizeJob, job.billingPrincipalId, 1000)
    }

    private async invalidateSourcePages(knowledgebaseId: string, documentId: string) {
        const contributions = await this.contributionRepository.find({
            where: { knowledgebaseId, sourceDocumentIdSnapshot: documentId },
            select: { pageId: true }
        })
        const pageIds = [...new Set(contributions.map((item) => item.pageId))]
        if (pageIds.length) {
            await this.pageRepository.update(
                { knowledgebaseId, id: In(pageIds) },
                { status: 'stale', projectionStatus: 'disabled' }
            )
        }
    }

    private async prepareRebuildSourceState(
        knowledgebase: Knowledgebase,
        document: KnowledgeDocument,
        desiredRootJobId: string
    ) {
        const current = await this.sourceStateRepository.findOne({
            where: { knowledgebaseId: knowledgebase.id, sourceDocumentIdSnapshot: document.id }
        })
        return this.sourceStateRepository.create({
            ...(current ?? {}),
            tenantId: knowledgebase.tenantId,
            organizationId: knowledgebase.organizationId,
            knowledgebaseId: knowledgebase.id,
            sourceDocumentIdSnapshot: document.id,
            lifecycleGeneration: (current?.lifecycleGeneration ?? 0) + 1,
            lastEventType: 'enabled',
            lastContentHash: document.contentHash,
            eligible: true,
            cleanupPending: false,
            cleanupFailed: false,
            generationPending: true,
            generationPendingReason: null,
            desiredRootJobId
        })
    }

    private async assertRebuildSources(knowledgebaseId: string, sourceCount: number, expectedCount = 0) {
        if (sourceCount) return
        const publishedPages = await this.pageRepository.count({
            where: { knowledgebaseId, activeVersionId: Not(IsNull()) }
        })
        if (expectedCount > 0 || publishedPages > 0) throw new KnowledgeWikiError('knowledge_wiki_empty_sources')
    }

    private async failJob(job: KnowledgeWikiJob, error: unknown) {
        const message = getErrorMessage(error).slice(0, MAX_DISPATCH_ERROR_LENGTH)
        const current = await this.jobRepository.findOne({ where: { id: job.id } })
        if (
            !current ||
            current.executionAttempt !== job.executionAttempt ||
            ['succeeded', 'stale', 'cancelled'].includes(current.status)
        ) {
            return
        }
        const failed = await this.jobRepository.update(
            { id: job.id, executionAttempt: job.executionAttempt, status: 'running' },
            {
                status: 'failed',
                errorCode: error instanceof KnowledgeWikiError ? error.code : 'knowledge_wiki_generation_failed',
                error: message,
                completedAt: new Date(),
                lockedAt: null,
                leaseExpiresAt: null
            }
        )
        if (!failed.affected) return
        const readyPages = await this.pageRepository.count({
            where: { knowledgebaseId: job.knowledgebaseId, status: 'ready', activeVersionId: Not(IsNull()) }
        })
        await this.knowledgebaseRepository.update(job.knowledgebaseId, {
            wikiStatus: 'failed',
            wikiAvailability: readyPages ? 'degraded' : 'unavailable',
            wikiBuildError: message
        })
        this.logger.error(`Wiki job '${job.id}' failed: ${message}`)
    }
}
