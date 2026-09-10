import { KnowledgeWikiClassificationService } from './knowledge-wiki-classification.service'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { DataSource, IsNull, Not, Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import {
    KnowledgeWikiJob,
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiPageVersion,
    KnowledgeWikiSourceState
} from './entities'
import { KnowledgeWikiIndexService } from './knowledge-wiki-index.service'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiJobFenceService } from './knowledge-wiki-job-fence.service'
import { KnowledgeWikiLinkService } from './knowledge-wiki-link.service'
import { KnowledgeWikiProjectionService } from './knowledge-wiki-projection.service'
import { KnowledgeWikiError } from './knowledge-wiki-error'

// Invariants: wait for reductions, stage projections, then publish all page pointers in one transaction.
// A failed child or page-version conflict must not activate the staged knowledgebase revision.
// Projection staging stays outside the transaction; recheck the job fence before publication.
// Lock the knowledgebase before pages, matching identity resolution's lock order.
@Injectable()
export class KnowledgeWikiFinalizeService {
    @Inject(KnowledgeWikiClassificationService) private readonly classification: KnowledgeWikiClassificationService
    constructor(
        @InjectRepository(KnowledgeWikiJob) private readonly jobRepository: Repository<KnowledgeWikiJob>,
        @InjectRepository(KnowledgeWikiPage) private readonly pageRepository: Repository<KnowledgeWikiPage>,
        @InjectRepository(KnowledgeWikiPageVersion)
        private readonly pageVersionRepository: Repository<KnowledgeWikiPageVersion>,
        @InjectRepository(KnowledgeWikiSourceState)
        private readonly sourceStateRepository: Repository<KnowledgeWikiSourceState>,
        private readonly jobFence: KnowledgeWikiJobFenceService,
        private readonly dispatcher: KnowledgeWikiJobDispatcherService,
        private readonly indexService: KnowledgeWikiIndexService,
        private readonly linkService: KnowledgeWikiLinkService,
        private readonly projectionService: KnowledgeWikiProjectionService,
        private readonly dataSource: DataSource
    ) {}

    async process(job: KnowledgeWikiJob) {
        const knowledgebase = await this.jobFence.assert(job)
        const parentJob = job.parentJobId
            ? await this.jobRepository.findOne({ where: { id: job.parentJobId, isCurrent: true } })
            : null
        const children = await this.jobRepository.find({
            where: { parentJobId: job.parentJobId, type: 'page_reduce', isCurrent: true }
        })
        if (children.some((child) => child.status === 'failed')) {
            throw new Error(
                t('server-ai:Error.KnowledgebaseWikiReduceFailed', {
                    defaultValue: 'One or more Wiki page reductions failed'
                })
            )
        }
        if (children.some((child) => child.status === 'queued' || child.status === 'running')) {
            await this.jobRepository.update(job.id, { status: 'queued', lockedAt: null, leaseExpiresAt: null })
            await this.dispatcher.dispatch(job, job.billingPrincipalId, 1500)
            return
        }
        let candidates: Array<{ page: KnowledgeWikiPage; version: KnowledgeWikiPageVersion | null }> = []
        for (const child of children) {
            if (!child.pageKey) continue
            const page = await this.pageRepository.findOne({
                where: { knowledgebaseId: knowledgebase.id, pageKey: child.pageKey }
            })
            if (!page) continue
            const version = await this.pageVersionRepository.findOne({
                where: { pageId: page.id, producerJobId: child.id, generationAttempt: child.generationAttempt }
            })
            candidates.push({ page, version })
        }
        if (parentJob?.type === 'rebuild') {
            const maps = await this.jobRepository.find({
                where: {
                    knowledgebaseId: knowledgebase.id,
                    parentJobId: parentJob.id,
                    type: 'source_map',
                    isCurrent: true
                }
            })
            const publishedPages = await this.pageRepository.count({
                where: { knowledgebaseId: knowledgebase.id, activeVersionId: Not(IsNull()) }
            })
            if (
                maps.length !== parentJob.expectedChildren ||
                maps.some((map) => map.status !== 'succeeded') ||
                (!candidates.some(({ page, version }) => page.pageType !== 'index' && version) &&
                    (publishedPages > 0 || parentJob.expectedChildren > 0))
            ) {
                throw new KnowledgeWikiError('knowledge_wiki_empty_publication')
            }
        }
        candidates = await this.indexService.prepare(knowledgebase, job, candidates)
        const conflicted = candidates.filter(
            ({ page, version }) =>
                version && page.activeVersionId !== version.id && page.version !== version.expectedPageVersion
        )
        if (conflicted.length) {
            await this.recoverConflict(
                job,
                children,
                conflicted.map(({ page }) => page.id),
                candidates
            )
            return
        }
        for (const candidate of candidates) {
            if (!candidate.version) continue
            if (
                candidate.page.activeVersionId === candidate.version.id &&
                candidate.version.projectionStatus === 'ready'
            )
                continue
            if (candidate.page.pageType !== 'index') {
                await this.linkService.stageGeneratedLinks(knowledgebase, candidate.page, candidate.version)
            }
            await this.projectionService.stage(knowledgebase, candidate.page, candidate.version)
        }
        await this.jobFence.assert(job)
        try {
            await this.dataSource.transaction(async (manager) => {
                await manager.getRepository(Knowledgebase).findOneOrFail({
                    where: { id: knowledgebase.id },
                    lock: { mode: 'pessimistic_write' }
                })
                for (const candidate of [...candidates].sort((left, right) =>
                    left.page.id.localeCompare(right.page.id)
                )) {
                    const pageRepository = manager.getRepository(KnowledgeWikiPage)
                    const current = await pageRepository.findOne({
                        where: { id: candidate.page.id, knowledgebaseId: knowledgebase.id },
                        lock: { mode: 'pessimistic_write' }
                    })
                    if (!current) throw new KnowledgeWikiError('knowledge_wiki_publication_conflict', candidate.page.id)
                    if (!candidate.version) {
                        const result = await pageRepository.update(
                            { id: candidate.page.id, version: candidate.page.version },
                            {
                                status: 'archived',
                                projectionStatus: 'disabled',
                                activeVersionId: null,
                                sourceCount: 0,
                                version: candidate.page.version + 1
                            }
                        )
                        if (!result.affected)
                            throw new KnowledgeWikiError('knowledge_wiki_publication_conflict', candidate.page.id)
                        continue
                    }
                    if (current.activeVersionId === candidate.version.id) continue
                    const result = await pageRepository.update(
                        { id: candidate.page.id, version: candidate.version.expectedPageVersion },
                        {
                            status: 'ready',
                            projectionStatus: 'ready',
                            activeVersionId: candidate.version.id,
                            sourceCount: await manager.getRepository(KnowledgeWikiPageContribution).count({
                                where: { pageVersionId: candidate.version.id }
                            }),
                            publishedAt: new Date(),
                            version: candidate.version.expectedPageVersion + 1
                        }
                    )
                    if (!result.affected) {
                        throw new KnowledgeWikiError('knowledge_wiki_publication_conflict', candidate.page.id)
                    }
                    await manager.getRepository(KnowledgeWikiPageVersion).update(candidate.version.id, {
                        status: 'ready',
                        projectionStatus: 'ready',
                        publishedAt: new Date()
                    })
                }
                await manager.getRepository(Knowledgebase).update(knowledgebase.id, {
                    wikiStatus: 'ready',
                    wikiAvailability: 'ready',
                    wikiActiveRevision: job.generationRevision,
                    wikiStagedRevision:
                        knowledgebase.wikiStagedRevision === job.generationRevision
                            ? null
                            : knowledgebase.wikiStagedRevision,
                    wikiConfigFingerprint: job.configFingerprint,
                    wikiGeneratorVersion: job.generatorVersion,
                    wikiBuildError: null
                })
                await this.classification.enqueuePublished(manager, knowledgebase, job, candidates)
            })
        } catch (error) {
            if (!(error instanceof KnowledgeWikiError) || error.code !== 'knowledge_wiki_publication_conflict')
                throw error
            await this.recoverConflict(job, children, [error.pageId], candidates)
            return
        }
        await this.projectionService.retireSupersededVersions(knowledgebase.id)
        await this.linkService.refreshCounts(knowledgebase.id)
        if (job.sourceDocumentIdSnapshot) {
            await this.sourceStateRepository.update(
                {
                    knowledgebaseId: knowledgebase.id,
                    sourceDocumentIdSnapshot: job.sourceDocumentIdSnapshot,
                    lifecycleGeneration: job.sourceLifecycleGeneration
                },
                parentJob?.type === 'retract'
                    ? {
                          cleanupPending: false,
                          cleanupFailed: false,
                          generationPending: false,
                          generationPendingReason: null
                      }
                    : { generationPending: false, generationPendingReason: null }
            )
        } else if (job.rootJobId) {
            await this.sourceStateRepository.update(
                {
                    knowledgebaseId: knowledgebase.id,
                    desiredRootJobId: job.rootJobId,
                    eligible: true
                },
                { generationPending: false, generationPendingReason: null }
            )
        }
        await this.dispatcher.markSucceeded(job.id)
    }

    private async recoverConflict(
        job: KnowledgeWikiJob,
        children: KnowledgeWikiJob[],
        pageIds: string[],
        candidates: Array<{ page: KnowledgeWikiPage; version: KnowledgeWikiPageVersion | null }>
    ) {
        if (job.generationAttempt >= 3) throw new KnowledgeWikiError('knowledge_wiki_publication_conflict', pageIds[0])
        const pageKeys = new Set(
            candidates
                .filter(({ page }) => pageIds.includes(page.id) && page.pageType !== 'index')
                .map(({ page }) => page.pageKey)
        )
        const retryChildren = children.filter((child) => pageKeys.has(child.pageKey))
        await this.dataSource.transaction(async (manager) => {
            const jobs = manager.getRepository(KnowledgeWikiJob)
            const owned = await jobs.update(
                { id: job.id, status: 'running', executionAttempt: job.executionAttempt, isCurrent: true },
                {
                    status: 'queued',
                    generationAttempt: job.generationAttempt + 1,
                    lockedAt: null,
                    leaseExpiresAt: null,
                    completedAt: null,
                    error: null,
                    errorCode: null
                }
            )
            if (!owned.affected) throw new KnowledgeWikiError('knowledge_wiki_publication_conflict', pageIds[0])
            for (const child of retryChildren) {
                const result = await jobs.update(
                    { id: child.id, status: 'succeeded', generationAttempt: child.generationAttempt, isCurrent: true },
                    { status: 'queued', completedAt: null, error: null, errorCode: null }
                )
                if (!result.affected) throw new KnowledgeWikiError('knowledge_wiki_publication_conflict', pageIds[0])
            }
        })
        // Recompute from current contributions. The reducer reuses its paid result if inputs did not change.
        for (const child of retryChildren) await this.dispatcher.dispatch(child, job.billingPrincipalId)
        await this.dispatcher.dispatch(job, job.billingPrincipalId, 1500)
    }
}
