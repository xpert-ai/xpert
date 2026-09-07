import { getErrorMessage } from '@xpert-ai/server-common'
import { InjectQueue } from '@nestjs/bull'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { t } from 'i18next'
import { Repository } from 'typeorm'
import { KnowledgeWikiJob } from './entities'
import { JOB_KNOWLEDGE_WIKI_GENERATION, KnowledgeWikiGenerationQueueJob } from './types'

const MAX_ERROR_LENGTH = 4000

@Injectable()
export class KnowledgeWikiJobDispatcherService {
    constructor(
        @InjectRepository(KnowledgeWikiJob)
        private readonly jobRepository: Repository<KnowledgeWikiJob>,
        @InjectQueue(JOB_KNOWLEDGE_WIKI_GENERATION)
        private readonly queue: Queue<KnowledgeWikiGenerationQueueJob>
    ) {}

    async dispatch(job: KnowledgeWikiJob, userId?: string | null, delay = 0) {
        if (!userId || !job.tenantId) {
            const message = t('server-ai:Error.KnowledgebaseWikiBillingPrincipalRequired', {
                defaultValue: 'A billing principal and tenant are required to dispatch Wiki generation'
            })
            await this.jobRepository.update(job.id, {
                status: 'failed',
                errorCode: 'missing_billing_principal',
                error: message,
                dispatchError: message,
                dispatchAttempts: job.dispatchAttempts + 1,
                completedAt: new Date()
            })
            return
        }
        try {
            await this.queue.add(
                {
                    jobId: job.id,
                    userId,
                    tenantId: job.tenantId,
                    organizationId: job.organizationId
                },
                {
                    jobId: `wiki:${job.id}:${job.executionAttempt + job.dispatchAttempts + 1}`,
                    delay,
                    attempts: 1,
                    removeOnComplete: true
                }
            )
            await this.jobRepository.update(job.id, {
                dispatchError: null,
                dispatchAttempts: job.dispatchAttempts + 1,
                dispatchAfter: delay ? new Date(Date.now() + delay) : null
            })
        } catch (error) {
            await this.jobRepository.update(job.id, {
                dispatchError: getErrorMessage(error).slice(0, MAX_ERROR_LENGTH),
                dispatchAttempts: job.dispatchAttempts + 1,
                dispatchAfter: new Date(Date.now() + 30_000)
            })
        }
    }

    async markSucceeded(jobId: string) {
        await this.jobRepository.update(jobId, {
            status: 'succeeded',
            completedAt: new Date(),
            lockedAt: null,
            leaseExpiresAt: null,
            heartbeatAt: new Date()
        })
    }
}
