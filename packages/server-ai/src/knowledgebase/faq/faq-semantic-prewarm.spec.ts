import { RequestContext } from '@xpert-ai/plugin-sdk'
import type { IKnowledgebase, IKnowledgeFAQEntry, IUser } from '@xpert-ai/contracts'
import type { UserService } from '@xpert-ai/server-core'
import type { Queue, Job } from 'bull'
import type { KnowledgeDocumentChunkService } from '../../knowledge-document/chunk/chunk.service'
import type { KnowledgebaseService } from '../knowledgebase.service'
import type { FAQSemanticService } from './faq-semantic.service'
import { FAQSemanticPrewarmDispatcher, FAQSemanticPrewarmProcessor, FAQPrewarmJob } from './faq-semantic-prewarm'
import { faqContentHash } from './faq-semantic-cache.service'

jest.mock('../knowledgebase.service', () => ({ KnowledgebaseService: class KnowledgebaseService {} }))
jest.mock('../../knowledge-document/chunk/chunk.service', () => ({
    KnowledgeDocumentChunkService: class KnowledgeDocumentChunkService {}
}))
jest.mock('./faq-semantic.service', () => ({
    FAQSemanticService: class FAQSemanticService {},
    faqQuestionTexts: (value: {
        standardQuestion: string
        similarQuestions: string[]
        negativeQuestions: string[]
    }) => [value.standardQuestion, ...value.similarQuestions, ...value.negativeQuestions]
}))

const kb = {
    id: 'kb',
    tenantId: 'tenant',
    organizationId: 'org',
    faqConfig: { negativeMatchMode: 'semantic' }
} as IKnowledgebase
const entry = {
    id: 'faq',
    version: 2,
    standardQuestion: 'positive',
    similarQuestions: [],
    negativeQuestions: ['negative'],
    answerBlocks: ['answer'],
    enabled: true
} as IKnowledgeFAQEntry

describe('FAQ semantic prewarm lifecycle', () => {
    afterEach(() => jest.restoreAllMocks())

    it('schedules bounded retryable jobs with the saving principal and current content version', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        const queue = { addBulk: jest.fn(async () => []) }
        const dispatcher = new FAQSemanticPrewarmDispatcher(queue as unknown as Queue<FAQPrewarmJob>)
        await dispatcher.enqueue(kb, [entry])
        expect(queue.addBulk).toHaveBeenCalledWith([
            expect.objectContaining({
                data: expect.objectContaining({
                    userId: 'user',
                    tenantId: 'tenant',
                    organizationId: 'org',
                    faqId: 'faq',
                    version: 2
                }),
                opts: expect.objectContaining({ attempts: 3, removeOnFail: 100 })
            })
        ])
    })

    it('does not fail the saved operation when queue submission fails', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        const dispatcher = new FAQSemanticPrewarmDispatcher({
            addBulk: jest.fn(async () => {
                throw new Error('queue down')
            })
        } as unknown as Queue<FAQPrewarmJob>)
        await expect(dispatcher.enqueue(kb, [entry])).resolves.toBeUndefined()
    })

    it('skips exact libraries, disabled FAQs and FAQs without negatives', async () => {
        const queue = { addBulk: jest.fn() }
        const dispatcher = new FAQSemanticPrewarmDispatcher(queue as unknown as Queue<FAQPrewarmJob>)
        await dispatcher.enqueue(
            {
                ...kb,
                faqConfig: { indexMode: 'question_only', questionIndexMode: 'separate', negativeMatchMode: 'exact' }
            },
            [entry]
        )
        await dispatcher.enqueue(kb, [
            { ...entry, enabled: false },
            { ...entry, negativeQuestions: [] }
        ])
        expect(queue.addBulk).not.toHaveBeenCalled()
    })

    function processorFixture() {
        const chunk = {
            ...entry,
            metadata: { ...entry, contentKind: 'faq', chunkId: entry.id, faqVectorIds: [], vectorSyncStatus: 'ready' },
            document: { disabled: false }
        }
        const chunks = { findAll: jest.fn(async () => ({ items: [chunk] })) }
        const semantic = { prewarm: jest.fn(async () => undefined) }
        const users = { findOne: jest.fn(async () => ({ id: 'user', tenantId: 'tenant' }) as IUser) }
        const processor = new FAQSemanticPrewarmProcessor(
            { assertKnowledgebaseWriteAccess: jest.fn(async () => kb) } as unknown as KnowledgebaseService,
            chunks as unknown as KnowledgeDocumentChunkService,
            users as unknown as UserService,
            semantic as unknown as FAQSemanticService
        )
        const job = {
            data: {
                knowledgebaseId: 'kb',
                faqId: 'faq',
                version: 2,
                tenantId: 'tenant',
                organizationId: 'org',
                userId: 'user',
                contentHash: faqContentHash(['positive', 'negative'])
            }
        } as Job<FAQPrewarmJob>
        return { chunk, chunks, semantic, processor, job, users }
    }

    it('prewarms a current ready FAQ after checking tenant and organization scope', async () => {
        const f = processorFixture()
        await f.processor.process(f.job)
        expect(f.semantic.prewarm).toHaveBeenCalledWith(kb, f.chunk.metadata)
        expect(f.chunks.findAll).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'faq',
                    knowledgebaseId: 'kb',
                    tenantId: 'tenant',
                    organizationId: 'org'
                }
            })
        )
    })

    it.each(['version', 'content', 'disabled', 'pending', 'document_disabled'])(
        'ignores a stale job after %s changes',
        async (change) => {
            const f = processorFixture()
            if (change === 'version') f.chunk.version++
            if (change === 'content') f.chunk.metadata.negativeQuestions = ['new negative']
            if (change === 'disabled') f.chunk.metadata.enabled = false
            if (change === 'pending') f.chunk.metadata.vectorSyncStatus = 'pending'
            if (change === 'document_disabled') f.chunk.document.disabled = true
            await f.processor.process(f.job)
            expect(f.semantic.prewarm).not.toHaveBeenCalled()
        }
    )

    it('does not run model work for a deleted FAQ or a principal from another tenant', async () => {
        const f = processorFixture()
        f.chunks.findAll.mockResolvedValueOnce({ items: [] })
        await f.processor.process(f.job)
        f.users.findOne.mockResolvedValueOnce({ id: 'user', tenantId: 'other' } as IUser)
        await f.processor.process(f.job)
        expect(f.semantic.prewarm).not.toHaveBeenCalled()
    })
})
