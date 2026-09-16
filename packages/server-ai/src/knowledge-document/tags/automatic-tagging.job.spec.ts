jest.mock('./automatic-tagging.service', () => ({ KnowledgeAutomaticTaggingService: class {} }))
jest.mock('../../knowledgebase/tags/knowledge-tag.service', () => ({ KnowledgeTagService: class {} }))
import { Job, Queue } from 'bull'
import { RequestContext, UserService } from '@xpert-ai/server-core'
import { RequestContext as PluginRequestContext } from '@xpert-ai/plugin-sdk'
import { KnowledgeTagService } from '../../knowledgebase/tags/knowledge-tag.service'
import { KnowledgeProcessingReadyService } from '../processing-lifecycle.module'
import { KnowledgeAutoTaggingConsumer, KnowledgeAutoTaggingEnqueueHandler } from './automatic-tagging.job'
import { KnowledgeAutoTaggingEnqueueCommand, KnowledgeAutoTaggingJob } from './automatic-tagging.command'
import { KnowledgeAutomaticTaggingService } from './automatic-tagging.service'

describe('automatic tagging queue boundary', () => {
    it('enqueues ids only with bounded retries and stable deduplication identity', async () => {
        const queue = { add: jest.fn().mockResolvedValue({ id: 'job' }) }
        const tags = {
            context: jest.fn().mockResolvedValue({
                knowledgebase: { automaticTagging: { enabled: true } },
                document: {
                    id: 'doc',
                    tenantId: 'tenant',
                    organizationId: 'org',
                    publicationEpoch: 2,
                    tagRevision: 3
                }
            })
        }
        const handler = new KnowledgeAutoTaggingEnqueueHandler(
            queue as unknown as Queue<KnowledgeAutoTaggingJob>,
            tags as unknown as KnowledgeTagService
        )
        await handler.execute(
            new KnowledgeAutoTaggingEnqueueCommand({ knowledgebaseId: 'kb', documentId: 'doc', userId: 'user' })
        )
        expect(queue.add).toHaveBeenCalledWith(
            { knowledgebaseId: 'kb', documentId: 'doc', userId: 'user', tenantId: 'tenant', organizationId: 'org' },
            expect.objectContaining({ jobId: 'doc-2-3', attempts: 3, backoff: { type: 'exponential', delay: 2000 } })
        )
        tags.context.mockResolvedValue({ knowledgebase: {}, document: {} })
        await handler.execute(
            new KnowledgeAutoTaggingEnqueueCommand({ knowledgebaseId: 'kb', documentId: 'doc', userId: 'user' })
        )
        expect(queue.add).toHaveBeenCalledTimes(1)
    })

    it('waits for CQRS readiness and restores both tenant context implementations', async () => {
        const users = {
            findOne: jest.fn().mockResolvedValue({ id: 'user', tenantId: 'tenant', preferredLanguage: 'en' })
        }
        const tagging = {
            process: jest.fn(async () => {
                expect(RequestContext.currentTenantId()).toBe('tenant')
                expect(RequestContext.getOrganizationId()).toBe('org')
                expect(PluginRequestContext.currentTenantId()).toBe('tenant')
                expect(PluginRequestContext.getOrganizationId()).toBe('org')
                return 'classified'
            })
        }
        const lifecycle = new KnowledgeProcessingReadyService()
        const worker = new KnowledgeAutoTaggingConsumer(
            users as unknown as UserService,
            tagging as unknown as KnowledgeAutomaticTaggingService,
            lifecycle
        )
        const result = worker.process({
            data: {
                knowledgebaseId: 'kb',
                documentId: 'doc',
                userId: 'user',
                tenantId: 'tenant',
                organizationId: 'org'
            }
        } as Job<KnowledgeAutoTaggingJob>)
        expect(tagging.process).not.toHaveBeenCalled()
        lifecycle.onApplicationBootstrap()
        await expect(result).resolves.toBe('classified')
        expect(tagging.process).toHaveBeenCalledWith('kb', 'doc')
    })
})
