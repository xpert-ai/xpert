// Invariants: persist each downstream stage under the pipeline lock before dispatching it.
// Reduce/finalize remain siblings of identity resolution so existing source and publication fences apply.
import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager, In, Not } from 'typeorm'
import {
    KnowledgeWikiJob,
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiSourceMapResult
} from './entities'
import { hashKnowledgeWikiValue } from './knowledge-wiki-generation.utils'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiError } from './knowledge-wiki-error'

@Injectable()
export class KnowledgeWikiPageSchedulerService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly dispatcher: KnowledgeWikiJobDispatcherService
    ) {}

    async completeMap(map: KnowledgeWikiJob, rebuild: KnowledgeWikiJob | null) {
        const pipeline = rebuild ?? map
        const child = await this.dataSource.transaction(async (manager) => {
            await this.lockPipeline(manager, pipeline, !rebuild)
            const jobs = manager.getRepository(KnowledgeWikiJob)
            const completed = await jobs.update(
                { id: map.id, executionAttempt: map.executionAttempt, status: 'running', isCurrent: true },
                {
                    status: 'succeeded',
                    completedAt: new Date()
                }
            )
            if (!completed.affected) throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
            if (
                rebuild &&
                (await jobs.count({
                    where: { parentJobId: rebuild.id, type: 'source_map', isCurrent: true, status: Not('succeeded') }
                }))
            )
                return null
            return this.ensureJob(manager, pipeline, 'identity_resolve', 'identity')
        })
        if (child) await this.dispatcher.dispatch(child, pipeline.billingPrincipalId)
    }

    async scheduleIdentity(pipeline: KnowledgeWikiJob) {
        const child = await this.dataSource.transaction(async (manager) => {
            await this.lockPipeline(manager, pipeline)
            return this.ensureJob(manager, pipeline, 'identity_resolve', 'identity')
        })
        await this.dispatcher.dispatch(child, pipeline.billingPrincipalId)
    }

    async schedulePages(pipeline: KnowledgeWikiJob, resolver: KnowledgeWikiJob) {
        const children = await this.dataSource.transaction(async (manager) => {
            await this.lockPipeline(manager, pipeline)
            const jobs = manager.getRepository(KnowledgeWikiJob)
            const mapJobs =
                pipeline.type === 'rebuild'
                    ? await jobs.find({
                          where: { parentJobId: pipeline.id, type: 'source_map', isCurrent: true, status: 'succeeded' }
                      })
                    : [pipeline]
            const results = mapJobs.length
                ? await manager.getRepository(KnowledgeWikiSourceMapResult).find({
                      where: {
                          sourceJobId: In(mapJobs.map((job) => job.id)),
                          knowledgebaseId: pipeline.knowledgebaseId
                      }
                  })
                : []
            if (results.some((result) => !result.normalizedPageKey)) return null
            const keys = new Set(results.map((result) => result.normalizedPageKey))
            const pages = manager.getRepository(KnowledgeWikiPage)
            if (pipeline.type === 'rebuild') {
                const existing = await pages.find({ where: { knowledgebaseId: pipeline.knowledgebaseId } })
                existing.filter((page) => page.pageType !== 'index').forEach((page) => keys.add(page.pageKey))
            } else {
                const previous = await manager.getRepository(KnowledgeWikiPageContribution).find({
                    where: {
                        knowledgebaseId: pipeline.knowledgebaseId,
                        sourceDocumentIdSnapshot: pipeline.sourceDocumentIdSnapshot
                    }
                })
                if (previous.length) {
                    const existing = await pages.find({
                        where: {
                            id: In(previous.map((item) => item.pageId)),
                            knowledgebaseId: pipeline.knowledgebaseId
                        }
                    })
                    existing.forEach((page) => keys.add(page.pageKey))
                }
            }
            const reductions: KnowledgeWikiJob[] = []
            for (const key of [...keys].sort()) {
                reductions.push(
                    await this.ensureJob(
                        manager,
                        pipeline,
                        'page_reduce',
                        `reduce:${hashKnowledgeWikiValue(key).slice(0, 20)}`,
                        key
                    )
                )
            }
            const finalize = await this.ensureJob(manager, pipeline, 'finalize', 'finalize')
            const completed = await jobs.update(
                { id: resolver.id, executionAttempt: resolver.executionAttempt, status: 'running', isCurrent: true },
                {
                    status: 'succeeded',
                    completedAt: new Date()
                }
            )
            if (!completed.affected) throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
            return [...reductions, finalize]
        })
        if (!children) return false
        for (const child of children)
            await this.dispatcher.dispatch(child, pipeline.billingPrincipalId, child.type === 'finalize' ? 1000 : 0)
        return true
    }

    private async lockPipeline(manager: EntityManager, pipeline: KnowledgeWikiJob, allowRunning = false) {
        const current = await manager.getRepository(KnowledgeWikiJob).findOne({
            where: { id: pipeline.id, knowledgebaseId: pipeline.knowledgebaseId, isCurrent: true },
            lock: { mode: 'pessimistic_write' }
        })
        if (!current || (current.status !== 'succeeded' && !(allowRunning && current.status === 'running')))
            throw new KnowledgeWikiError('knowledge_wiki_identity_stale')
    }

    private async ensureJob(
        manager: EntityManager,
        pipeline: KnowledgeWikiJob,
        type: KnowledgeWikiJob['type'],
        suffix: string,
        pageKey?: string
    ) {
        const jobs = manager.getRepository(KnowledgeWikiJob)
        const jobKey = `${pipeline.jobKey}:${suffix}`
        const existing = await jobs.findOne({ where: { knowledgebaseId: pipeline.knowledgebaseId, jobKey } })
        if (existing) return existing
        return jobs.save(
            jobs.create({
                tenantId: pipeline.tenantId,
                organizationId: pipeline.organizationId,
                knowledgebaseId: pipeline.knowledgebaseId,
                rootJobId: pipeline.rootJobId ?? pipeline.id,
                parentJobId: pipeline.id,
                sourceDocumentIdSnapshot: pipeline.sourceDocumentIdSnapshot,
                sourceLifecycleGeneration: pipeline.sourceLifecycleGeneration,
                sourcePublicationEpoch: pipeline.sourcePublicationEpoch,
                sourceContentHash: pipeline.sourceContentHash,
                pageKey: pageKey ?? null,
                jobKey,
                type,
                status: 'queued',
                isCurrent: true,
                dispatchAttempts: 0,
                dispatchAfter: new Date(),
                generationRevision: pipeline.generationRevision,
                generationAttempt: 0,
                executionAttempt: 0,
                configFingerprint: pipeline.configFingerprint,
                generatorVersion: pipeline.generatorVersion,
                billingPrincipalId: pipeline.billingPrincipalId,
                spendEnvelope: pipeline.spendEnvelope
            })
        )
    }
}
