import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Not, Repository } from 'typeorm'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiSourceMapResult } from './entities'
import { hashKnowledgeWikiValue } from './knowledge-wiki-generation.utils'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'

@Injectable()
export class KnowledgeWikiRebuildCoordinatorService {
    constructor(
        @InjectRepository(KnowledgeWikiJob)
        private readonly jobRepository: Repository<KnowledgeWikiJob>,
        @InjectRepository(KnowledgeWikiSourceMapResult)
        private readonly mapResultRepository: Repository<KnowledgeWikiSourceMapResult>,
        @InjectRepository(KnowledgeWikiPage)
        private readonly pageRepository: Repository<KnowledgeWikiPage>,
        private readonly dispatcher: KnowledgeWikiJobDispatcherService,
        private readonly dataSource: DataSource
    ) {}

    async scheduleAfterMap(rootJob: KnowledgeWikiJob) {
        const shouldSchedule = await this.dataSource.transaction(async (manager) => {
            const jobs = manager.getRepository(KnowledgeWikiJob)
            const root = await jobs.findOne({
                where: { id: rootJob.id, type: 'rebuild', isCurrent: true },
                lock: { mode: 'pessimistic_write' }
            })
            if (!root || root.succeededChildren >= root.expectedChildren) return false
            const pendingMaps = await jobs.count({
                where: {
                    parentJobId: root.id,
                    type: 'source_map',
                    isCurrent: true,
                    status: Not('succeeded')
                }
            })
            if (pendingMaps) return false
            root.succeededChildren = root.expectedChildren
            await jobs.save(root)
            return true
        })
        if (!shouldSchedule) return

        const sourceJobs = await this.jobRepository.find({
            where: { parentJobId: rootJob.id, type: 'source_map', isCurrent: true, status: 'succeeded' }
        })
        const mapResults = sourceJobs.length
            ? await this.mapResultRepository.find({ where: { sourceJobId: In(sourceJobs.map((job) => job.id)) } })
            : []
        const existingPages = await this.pageRepository.find({ where: { knowledgebaseId: rootJob.knowledgebaseId } })
        const pageKeys = new Set([
            ...mapResults.map((result) => result.normalizedPageKey),
            ...existingPages.map((page) => page.pageKey)
        ])
        const reduceJobs: KnowledgeWikiJob[] = []
        for (const pageKey of pageKeys) {
            const jobKey = `${rootJob.jobKey}:reduce:${hashKnowledgeWikiValue(pageKey).slice(0, 20)}`
            let child = await this.jobRepository.findOne({
                where: { knowledgebaseId: rootJob.knowledgebaseId, jobKey }
            })
            if (!child) {
                child = await this.jobRepository.save(
                    this.jobRepository.create({
                        tenantId: rootJob.tenantId,
                        organizationId: rootJob.organizationId,
                        knowledgebaseId: rootJob.knowledgebaseId,
                        rootJobId: rootJob.id,
                        parentJobId: rootJob.id,
                        pageKey,
                        jobKey,
                        type: 'page_reduce',
                        status: 'queued',
                        isCurrent: true,
                        generationRevision: rootJob.generationRevision,
                        generationAttempt: rootJob.generationAttempt,
                        executionAttempt: 0,
                        configFingerprint: rootJob.configFingerprint,
                        generatorVersion: rootJob.generatorVersion,
                        billingPrincipalId: rootJob.billingPrincipalId,
                        spendEnvelope: rootJob.spendEnvelope
                    })
                )
            }
            reduceJobs.push(child)
        }
        const finalizeKey = `${rootJob.jobKey}:finalize`
        let finalizeJob = await this.jobRepository.findOne({
            where: { knowledgebaseId: rootJob.knowledgebaseId, jobKey: finalizeKey }
        })
        if (!finalizeJob) {
            finalizeJob = await this.jobRepository.save(
                this.jobRepository.create({
                    tenantId: rootJob.tenantId,
                    organizationId: rootJob.organizationId,
                    knowledgebaseId: rootJob.knowledgebaseId,
                    rootJobId: rootJob.id,
                    parentJobId: rootJob.id,
                    jobKey: finalizeKey,
                    type: 'finalize',
                    status: 'queued',
                    isCurrent: true,
                    generationRevision: rootJob.generationRevision,
                    generationAttempt: rootJob.generationAttempt,
                    executionAttempt: 0,
                    configFingerprint: rootJob.configFingerprint,
                    generatorVersion: rootJob.generatorVersion,
                    billingPrincipalId: rootJob.billingPrincipalId,
                    expectedChildren: reduceJobs.length
                })
            )
        }
        await Promise.all(reduceJobs.map((child) => this.dispatcher.dispatch(child, rootJob.billingPrincipalId)))
        await this.dispatcher.dispatch(finalizeJob, rootJob.billingPrincipalId, 1000)
    }
}
