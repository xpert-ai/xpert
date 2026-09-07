import { KBDocumentStatusEnum, KnowledgeWikiPageContributionPayload } from '@xpert-ai/contracts'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiPageReduceInput, KnowledgeWikiPageVersion } from './entities'
import { hashKnowledgeWikiValue } from './knowledge-wiki-generation.utils'
import { KnowledgeWikiPageReduceService } from './knowledge-wiki-page-reduce.service'

function fixture(changed: boolean) {
    const payload: KnowledgeWikiPageContributionPayload = {
        schemaVersion: 1,
        pageType: 'entity',
        canonicalName: 'Team',
        aliases: [],
        summary: 'Team ownership',
        facts: [{ text: 'Team maintains the service.', sourceChunkIds: ['chunk'] }],
        suggestedLinks: []
    }
    const job = Object.assign(new KnowledgeWikiJob(), {
        id: 'reduce',
        parentJobId: 'map',
        knowledgebaseId: 'kb',
        sourceDocumentIdSnapshot: 'doc',
        pageKey: 'entity:team',
        generationAttempt: 0,
        executionAttempt: 2,
        status: 'running',
        isCurrent: true
    })
    const page = Object.assign(new KnowledgeWikiPage(), {
        id: 'page',
        pageKey: job.pageKey,
        version: 5,
        activeVersionId: 'published'
    })
    const document = Object.assign(new KnowledgeDocument(), {
        id: 'doc',
        knowledgebaseId: 'kb',
        status: KBDocumentStatusEnum.FINISH,
        contentHash: changed ? 'changed-hash' : 'hash',
        chunks: [{ id: 'chunk', pageContent: 'Team maintains the service.' }]
    })
    const previousInput = Object.assign(new KnowledgeWikiPageReduceInput(), {
        id: 'input',
        generationAttempt: 0,
        expectedPageVersion: 4,
        status: 'succeeded',
        inputFingerprint: hashKnowledgeWikiValue([{ sourceDocumentId: 'doc', contentHash: 'hash', payload }])
    })
    const previousVersion = Object.assign(new KnowledgeWikiPageVersion(), {
        id: 'staged',
        pageId: page.id,
        producerJobId: job.id,
        generationAttempt: 0,
        expectedPageVersion: 4,
        status: 'building',
        projectionStatus: 'ready'
    })
    const savedVersions: KnowledgeWikiPageVersion[] = []
    const model = {
        invokeReduceModel: jest.fn(async () => ({
            title: 'Team',
            summary: 'Ownership',
            contentMarkdown: 'Maintains the service.',
            aliases: []
        }))
    }
    const dispatcher = { markSucceeded: jest.fn() }
    const service = Object.assign(Object.create(KnowledgeWikiPageReduceService.prototype), {
        jobFence: { assert: async () => Object.assign(new Knowledgebase(), { id: 'kb' }) },
        jobRepository: { findOne: async () => null, update: async () => ({ affected: 1 }) },
        pageRepository: { findOne: async () => page },
        mapResultRepository: {
            find: async () => [{ sourceDocumentIdSnapshot: 'doc', sourceLifecycleGeneration: 1, payload }]
        },
        contributionRepository: { find: async () => [], create: (value: object) => value, save: async () => undefined },
        documentRepository: { find: async () => [document] },
        sourceStateRepository: {
            find: async () => [
                { sourceDocumentIdSnapshot: 'doc', lifecycleGeneration: 1, lastContentHash: document.contentHash }
            ]
        },
        reduceInputRepository: {
            findOne: async () => previousInput,
            create: (value: Partial<KnowledgeWikiPageReduceInput>) =>
                Object.assign(new KnowledgeWikiPageReduceInput(), value),
            save: async (value: KnowledgeWikiPageReduceInput) => value
        },
        reduceInputSourceRepository: { create: (value: object) => value, save: async () => undefined },
        evidenceRepository: { create: (value: object) => value, save: async () => undefined },
        pageVersionRepository: {
            findOne: async ({ where }: { where: { generationAttempt: number } }) =>
                where.generationAttempt === 0 ? previousVersion : null,
            create: (value: Partial<KnowledgeWikiPageVersion>) =>
                Object.assign(new KnowledgeWikiPageVersion(), { id: 'replacement' }, value),
            save: async (value: KnowledgeWikiPageVersion) => {
                savedVersions.push(value)
                return value
            }
        },
        modelInvocationService: model,
        dispatcher
    }) as KnowledgeWikiPageReduceService
    return { service, job, page, previousInput, previousVersion, savedVersions, model, dispatcher }
}

describe('Wiki reduce after publication conflict', () => {
    it('reuses the same generation attempt and staged version when the current sources are unchanged', async () => {
        const { service, job, page, previousVersion, model } = fixture(false)
        await service.process(job)
        expect(job.generationAttempt).toBe(0)
        expect(previousVersion).toMatchObject({ id: 'staged', expectedPageVersion: 5 })
        expect(model.invokeReduceModel).toHaveBeenCalledWith(
            expect.objectContaining({ generationAttempt: 0 }),
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.any(String)
        )
        expect(page.activeVersionId).toBe('published')
    })

    it('creates a new generation attempt when the current source content has changed', async () => {
        const { service, job, page, previousInput, previousVersion, savedVersions } = fixture(true)
        await service.process(job)
        expect(job.generationAttempt).toBe(1)
        expect(previousInput.status).toBe('stale')
        expect(previousVersion.expectedPageVersion).toBe(4)
        expect(savedVersions).toEqual([
            expect.objectContaining({ id: 'replacement', generationAttempt: 1, expectedPageVersion: 5 })
        ])
        expect(page.activeVersionId).toBe('published')
    })
})
