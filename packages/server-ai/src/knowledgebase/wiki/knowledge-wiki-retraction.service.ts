import { normalizeKnowledgebaseWikiConfig } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import {
    KnowledgeWikiJob,
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiSourceState
} from './entities'
import { KNOWLEDGE_WIKI_GENERATOR_VERSION } from './knowledge-wiki-config'
import { hashKnowledgeWikiValue } from './knowledge-wiki-generation.utils'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { retireSupersededKnowledgeWikiJobs } from './knowledge-wiki-job-current'
import { KnowledgeWikiProjectionService } from './knowledge-wiki-projection.service'
import { KnowledgeWikiRetractSourceInput } from './types'

@Injectable()
export class KnowledgeWikiRetractionService {
    constructor(
        @InjectRepository(Knowledgebase)
        private readonly knowledgebaseRepository: Repository<Knowledgebase>,
        @InjectRepository(KnowledgeWikiJob)
        private readonly jobRepository: Repository<KnowledgeWikiJob>,
        @InjectRepository(KnowledgeWikiPage)
        private readonly pageRepository: Repository<KnowledgeWikiPage>,
        @InjectRepository(KnowledgeWikiPageContribution)
        private readonly contributionRepository: Repository<KnowledgeWikiPageContribution>,
        @InjectRepository(KnowledgeWikiSourceState)
        private readonly sourceStateRepository: Repository<KnowledgeWikiSourceState>,
        private readonly projectionService: KnowledgeWikiProjectionService,
        private readonly dispatcher: KnowledgeWikiJobDispatcherService
    ) {}

    async enqueue(input: KnowledgeWikiRetractSourceInput) {
        const knowledgebase = await this.knowledgebaseRepository.findOne({ where: { id: input.knowledgebaseId } })
        if (!knowledgebase?.tenantId) return null
        const current = await this.sourceStateRepository.findOne({
            where: { knowledgebaseId: knowledgebase.id, sourceDocumentIdSnapshot: input.documentId }
        })
        const contributions = await this.contributionRepository.find({
            where: { knowledgebaseId: knowledgebase.id, sourceDocumentIdSnapshot: input.documentId },
            select: { pageId: true }
        })
        const pageIds = [...new Set(contributions.map((contribution) => contribution.pageId))]
        if (!current && !pageIds.length) return null

        const lifecycleGeneration = (current?.lifecycleGeneration ?? 0) + 1
        const state = await this.sourceStateRepository.save(
            this.sourceStateRepository.create({
                ...(current ?? {}),
                tenantId: knowledgebase.tenantId,
                organizationId: knowledgebase.organizationId,
                knowledgebaseId: knowledgebase.id,
                sourceDocumentIdSnapshot: input.documentId,
                lifecycleGeneration,
                lastEventType: input.reason,
                eligible: false,
                cleanupPending: true,
                cleanupFailed: false,
                generationPending: false,
                generationPendingReason: null,
                desiredRootJobId: null
            })
        )
        if (pageIds.length) {
            await this.pageRepository.update(
                { knowledgebaseId: knowledgebase.id, id: In(pageIds) },
                { status: 'stale', projectionStatus: 'disabled' }
            )
        }

        const revision = knowledgebase.wikiActiveRevision ?? knowledgebase.wikiRevision ?? 0
        const jobKey = `retract:${input.documentId}:${lifecycleGeneration}:${revision}`
        let job = await this.jobRepository.findOne({ where: { knowledgebaseId: knowledgebase.id, jobKey } })
        if (!job) {
            job = await this.jobRepository.save(
                this.jobRepository.create({
                    tenantId: knowledgebase.tenantId,
                    organizationId: knowledgebase.organizationId,
                    knowledgebaseId: knowledgebase.id,
                    sourceDocumentIdSnapshot: input.documentId,
                    sourceLifecycleGeneration: lifecycleGeneration,
                    jobKey,
                    type: 'retract',
                    status: 'queued',
                    isCurrent: true,
                    generationRevision: revision,
                    generationAttempt: 0,
                    executionAttempt: 0,
                    configFingerprint: knowledgebase.wikiConfigFingerprint ?? 'disabled',
                    generatorVersion: knowledgebase.wikiGeneratorVersion ?? KNOWLEDGE_WIKI_GENERATOR_VERSION,
                    billingPrincipalId: input.userId
                })
            )
            job.rootJobId = job.id
            await this.jobRepository.save(job)
        }
        state.desiredRootJobId = job.id
        await this.sourceStateRepository.save(state)
        await retireSupersededKnowledgeWikiJobs(this.jobRepository, knowledgebase.id)
        await this.dispatcher.dispatch(job, input.userId)
        return job
    }

    async process(job: KnowledgeWikiJob) {
        if (!job.sourceDocumentIdSnapshot) {
            await this.dispatcher.markSucceeded(job.id)
            return
        }
        const [knowledgebase, state] = await Promise.all([
            this.knowledgebaseRepository.findOne({ where: { id: job.knowledgebaseId } }),
            this.sourceStateRepository.findOne({
                where: {
                    knowledgebaseId: job.knowledgebaseId,
                    sourceDocumentIdSnapshot: job.sourceDocumentIdSnapshot
                }
            })
        ])
        if (!knowledgebase || !state || state.lifecycleGeneration !== job.sourceLifecycleGeneration || state.eligible) {
            await this.jobRepository.update(job.id, { status: 'stale', isCurrent: false, completedAt: new Date() })
            return
        }

        const contributions = await this.contributionRepository.find({
            where: {
                knowledgebaseId: job.knowledgebaseId,
                sourceDocumentIdSnapshot: job.sourceDocumentIdSnapshot
            },
            select: { pageId: true, pageVersionId: true }
        })
        await this.projectionService.retireVersions(
            knowledgebase,
            contributions.map((contribution) => contribution.pageVersionId)
        )
        const activeFingerprint = knowledgebase.wikiConfigFingerprint
        if (
            !normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig).enabled ||
            !activeFingerprint ||
            knowledgebase.wikiStatus === 'rebuild_required'
        ) {
            await this.sourceStateRepository.update(state.id, {
                cleanupPending: false,
                generationPending: !!normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig).enabled,
                generationPendingReason: activeFingerprint ? 'full_rebuild_required' : null
            })
            await this.dispatcher.markSucceeded(job.id)
            return
        }

        const pages = contributions.length
            ? await this.pageRepository.find({ where: { id: In(contributions.map((item) => item.pageId)) } })
            : []
        const reduceJobs: KnowledgeWikiJob[] = []
        for (const page of pages) {
            const jobKey = `${job.jobKey}:reduce:${hashKnowledgeWikiValue(page.pageKey).slice(0, 20)}`
            let child = await this.jobRepository.findOne({ where: { knowledgebaseId: job.knowledgebaseId, jobKey } })
            if (!child) {
                child = await this.jobRepository.save(
                    this.jobRepository.create({
                        tenantId: job.tenantId,
                        organizationId: job.organizationId,
                        knowledgebaseId: job.knowledgebaseId,
                        rootJobId: job.id,
                        parentJobId: job.id,
                        sourceDocumentIdSnapshot: job.sourceDocumentIdSnapshot,
                        sourceLifecycleGeneration: job.sourceLifecycleGeneration,
                        pageKey: page.pageKey,
                        jobKey,
                        type: 'page_reduce',
                        status: 'queued',
                        isCurrent: true,
                        generationRevision: job.generationRevision,
                        generationAttempt: job.generationAttempt,
                        executionAttempt: 0,
                        configFingerprint: activeFingerprint,
                        generatorVersion: job.generatorVersion,
                        billingPrincipalId: job.billingPrincipalId
                    })
                )
            }
            reduceJobs.push(child)
        }
        const finalizeKey = `${job.jobKey}:finalize`
        let finalizeJob = await this.jobRepository.findOne({
            where: { knowledgebaseId: job.knowledgebaseId, jobKey: finalizeKey }
        })
        if (!finalizeJob) {
            finalizeJob = await this.jobRepository.save(
                this.jobRepository.create({
                    tenantId: job.tenantId,
                    organizationId: job.organizationId,
                    knowledgebaseId: job.knowledgebaseId,
                    rootJobId: job.id,
                    parentJobId: job.id,
                    sourceDocumentIdSnapshot: job.sourceDocumentIdSnapshot,
                    sourceLifecycleGeneration: job.sourceLifecycleGeneration,
                    jobKey: finalizeKey,
                    type: 'finalize',
                    status: 'queued',
                    isCurrent: true,
                    generationRevision: job.generationRevision,
                    generationAttempt: job.generationAttempt,
                    executionAttempt: 0,
                    configFingerprint: activeFingerprint,
                    generatorVersion: job.generatorVersion,
                    billingPrincipalId: job.billingPrincipalId,
                    expectedChildren: reduceJobs.length
                })
            )
        }
        await this.dispatcher.markSucceeded(job.id)
        await Promise.all(reduceJobs.map((child) => this.dispatcher.dispatch(child, job.billingPrincipalId)))
        await this.dispatcher.dispatch(finalizeJob, job.billingPrincipalId, 1000)
    }
}
