import { normalizeKnowledgebaseWikiConfig } from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiPage } from './entities'
import { KNOWLEDGE_WIKI_GENERATOR_VERSION } from './knowledge-wiki-config'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiProjectionService } from './knowledge-wiki-projection.service'

const RECONCILE_INTERVAL_MS = 30_000
const RECONCILE_BATCH_SIZE = 50

@Injectable()
export class KnowledgeWikiReconcilerService {
    private readonly logger = new Logger(KnowledgeWikiReconcilerService.name)
    private running = false

    constructor(
        @InjectRepository(KnowledgeWikiJob)
        private readonly jobRepository: Repository<KnowledgeWikiJob>,
        @InjectRepository(KnowledgeWikiPage)
        private readonly pageRepository: Repository<KnowledgeWikiPage>,
        @InjectRepository(Knowledgebase)
        private readonly knowledgebaseRepository: Repository<Knowledgebase>,
        private readonly dispatcher: KnowledgeWikiJobDispatcherService,
        private readonly projectionService: KnowledgeWikiProjectionService
    ) {}

    @Interval(RECONCILE_INTERVAL_MS)
    async reconcile() {
        if (this.running) return
        this.running = true
        try {
            const now = new Date()
            const [dispatchFailures, expiredLeases] = await Promise.all([
                this.jobRepository.find({
                    where: [
                        {
                            status: 'queued',
                            isCurrent: true,
                            dispatchError: Not(IsNull()),
                            dispatchAfter: LessThanOrEqual(now)
                        },
                        {
                            status: 'queued',
                            isCurrent: true,
                            dispatchAttempts: 0,
                            dispatchAfter: LessThanOrEqual(now)
                        }
                    ],
                    order: { dispatchAfter: 'ASC' },
                    take: RECONCILE_BATCH_SIZE
                }),
                this.jobRepository.find({
                    where: {
                        status: 'running',
                        isCurrent: true,
                        leaseExpiresAt: LessThanOrEqual(now)
                    },
                    order: { leaseExpiresAt: 'ASC' },
                    take: RECONCILE_BATCH_SIZE
                })
            ])

            for (const job of expiredLeases) {
                const released = await this.jobRepository.update(
                    { id: job.id, status: 'running', leaseExpiresAt: LessThanOrEqual(now) },
                    { status: 'queued', lockedAt: null, leaseExpiresAt: null, heartbeatAt: null }
                )
                if (released.affected) await this.dispatcher.dispatch(job, job.billingPrincipalId)
            }
            for (const job of dispatchFailures) {
                await this.dispatcher.dispatch(job, job.billingPrincipalId)
            }

            await this.projectionService.retireSupersededVersions()
            await this.reconcileKnowledgebaseFailures()
            await this.reconcileGeneratorVersions()
        } catch (error) {
            this.logger.error(`Knowledge Wiki reconciliation failed: ${getErrorMessage(error)}`)
        } finally {
            this.running = false
        }
    }

    private async reconcileKnowledgebaseFailures() {
        const failedJobs = await this.jobRepository.find({
            where: { status: 'failed', isCurrent: true },
            select: { knowledgebaseId: true, error: true },
            order: { updatedAt: 'DESC' },
            take: RECONCILE_BATCH_SIZE
        })
        const knowledgebaseIds = [...new Set(failedJobs.map((job) => job.knowledgebaseId))]
        for (const knowledgebaseId of knowledgebaseIds) {
            const readyPages = await this.pageRepository.count({
                where: { knowledgebaseId, status: 'ready', activeVersionId: Not(IsNull()) }
            })
            const latest = failedJobs.find((job) => job.knowledgebaseId === knowledgebaseId)
            await this.knowledgebaseRepository.update(
                { id: knowledgebaseId, wikiStatus: 'indexing' },
                {
                    wikiStatus: 'failed',
                    wikiAvailability: readyPages ? 'degraded' : 'unavailable',
                    wikiBuildError: latest?.error ?? 'Wiki generation failed before queue dispatch'
                }
            )
        }
    }

    private async reconcileGeneratorVersions() {
        const candidates = await this.knowledgebaseRepository.find({
            where: { wikiStatus: In(['ready', 'failed']) },
            select: {
                id: true,
                wikiConfig: true,
                wikiGeneratorVersion: true,
                wikiAvailability: true
            },
            take: RECONCILE_BATCH_SIZE
        })
        for (const knowledgebase of candidates) {
            if (
                !normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig).enabled ||
                knowledgebase.wikiGeneratorVersion === KNOWLEDGE_WIKI_GENERATOR_VERSION
            ) {
                continue
            }
            await this.knowledgebaseRepository.update(knowledgebase.id, {
                wikiStatus: 'rebuild_required',
                wikiAvailability: knowledgebase.wikiAvailability === 'ready' ? 'degraded' : 'unavailable',
                wikiRebuildRequiredReason: 'generator_upgrade'
            })
        }
    }
}
