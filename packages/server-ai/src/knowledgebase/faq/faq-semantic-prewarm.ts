import type { IKnowledgebase, IKnowledgeFAQEntry } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserService } from '@xpert-ai/server-core'
import { InjectQueue, Process, Processor } from '@nestjs/bull'
import { Injectable, Logger } from '@nestjs/common'
import type { Job, Queue } from 'bull'
import { t } from 'i18next'
import { KnowledgeDocumentChunkService } from '../../knowledge-document/chunk/chunk.service'
import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'
import { KnowledgebaseService } from '../knowledgebase.service'
import { isKnowledgeFAQChunkMetadata } from './faq-projection'
import { faqContentHash, withFAQTimeout } from './faq-semantic-cache.service'
import { FAQSemanticService, faqQuestionTexts } from './faq-semantic.service'

export const JOB_FAQ_SEMANTIC_PREWARM = 'knowledge-faq-semantic-prewarm'
export type FAQPrewarmJob = {
    knowledgebaseId: string
    faqId: string
    version: number
    contentHash: string
    tenantId: string
    organizationId: string
    userId: string
}

@Injectable()
export class FAQSemanticPrewarmDispatcher {
    private readonly logger = new Logger(FAQSemanticPrewarmDispatcher.name)
    constructor(@InjectQueue(JOB_FAQ_SEMANTIC_PREWARM) private readonly queue: Queue<FAQPrewarmJob>) {}

    async enqueue(knowledgebase: IKnowledgebase, entries: IKnowledgeFAQEntry[]) {
        if (knowledgebase.faqConfig?.negativeMatchMode !== 'semantic') return
        const candidates = entries.filter((entry) => entry.enabled && entry.negativeQuestions?.length)
        if (!candidates.length) return
        try {
            const userId = RequestContext.currentUserId()
            if (!userId || !knowledgebase.tenantId || !knowledgebase.organizationId)
                throw new Error('missing_principal')
            await withFAQTimeout(
                this.queue.addBulk(
                    candidates.map((entry) => {
                        const data: FAQPrewarmJob = {
                            knowledgebaseId: knowledgebase.id,
                            faqId: entry.id,
                            version: entry.version,
                            contentHash: faqContentHash(faqQuestionTexts(entry)),
                            tenantId: knowledgebase.tenantId,
                            organizationId: knowledgebase.organizationId,
                            userId
                        }
                        return {
                            data,
                            opts: {
                                jobId: `faq-semantic-${faqContentHash(data)}`,
                                attempts: 3,
                                backoff: { type: 'exponential', delay: 2000 },
                                timeout: 45_000,
                                removeOnComplete: true,
                                removeOnFail: 100
                            }
                        }
                    })
                ),
                2000
            )
        } catch {
            this.logger.warn(
                t('server-ai:Error.KnowledgeFAQPrewarmFailed', {
                    defaultValue: 'FAQ saved, but semantic vector prewarming could not be scheduled.'
                })
            )
        }
    }
}

@Processor(JOB_FAQ_SEMANTIC_PREWARM)
export class FAQSemanticPrewarmProcessor {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly chunks: KnowledgeDocumentChunkService,
        private readonly users: UserService,
        private readonly semantic: FAQSemanticService
    ) {}

    @Process({ concurrency: 2 })
    async process(job: Job<FAQPrewarmJob>) {
        const data = job.data
        const user = await this.users.findOne(data.userId, { relations: ['role'] })
        if (!user || user.tenantId !== data.tenantId) return
        return runWithCapturedRequestContext(
            captureRequestContext({ user, tenantId: data.tenantId, organizationId: data.organizationId }),
            async () => {
                const kb = await this.knowledgebaseService.assertKnowledgebaseWriteAccess(data.knowledgebaseId)
                if (
                    kb.tenantId !== data.tenantId ||
                    kb.organizationId !== data.organizationId ||
                    kb.faqConfig?.negativeMatchMode !== 'semantic'
                )
                    return
                const { items } = await this.chunks.findAll({
                    where: {
                        id: data.faqId,
                        knowledgebaseId: kb.id,
                        tenantId: data.tenantId,
                        organizationId: data.organizationId
                    },
                    take: 1,
                    relations: ['document']
                })
                const chunk = items[0]
                if (
                    !chunk ||
                    chunk.version !== data.version ||
                    chunk.document?.disabled ||
                    !isKnowledgeFAQChunkMetadata(chunk.metadata)
                )
                    return
                const metadata = chunk.metadata
                if (
                    !metadata.enabled ||
                    metadata.vectorSyncStatus !== 'ready' ||
                    !metadata.negativeQuestions?.length ||
                    faqContentHash(faqQuestionTexts(metadata)) !== data.contentHash
                )
                    return
                // Only immutable, content-addressed cache entries are written; no FAQ state is published by a late job.
                await this.semantic.prewarm(kb, metadata)
            }
        )
    }
}
