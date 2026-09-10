import { KBDocumentStatusEnum, KnowledgeWikiPageContributionPayload } from '@xpert-ai/contracts'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiPageReduceInput, KnowledgeWikiPageVersion } from './entities'
import { hashKnowledgeWikiValue } from './knowledge-wiki-generation.utils'
import { KnowledgeWikiReduceSource } from './knowledge-wiki-model-invocation.service'
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
        invokeReduceModel: jest.fn(
            async (
                _job: KnowledgeWikiJob,
                _kb: Knowledgebase,
                _page: KnowledgeWikiPage,
                _sources: KnowledgeWikiReduceSource[],
                _fingerprint: string
            ) => ({
                title: 'Team',
                summary: 'Ownership',
                contentMarkdown: 'Maintains the service.',
                aliases: []
            })
        )
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
    return { service, job, page, document, payload, previousInput, previousVersion, savedVersions, model, dispatcher }
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

describe('Wiki resolved source material', () => {
    it('passes complete cited source text in document order, retaining each fact anchor', async () => {
        const h = fixture(false)
        const originalText = '# Ownership\n\n' + 'Context paragraph.\n'.repeat(150) + '\nTeam maintains the service.'
        h.document.chunks = [
            {
                id: 'a-later',
                pageContent: 'A later source section.',
                metadata: { chunkId: 'later', chunkIndex: 1 }
            },
            { id: 'chunk', pageContent: originalText, metadata: { chunkId: 'earlier', chunkIndex: 0 } }
        ]
        h.payload.facts = [
            { text: 'A later fact.', sourceChunkIds: ['a-later'] },
            { text: 'Team maintains the service.', sourceChunkIds: ['chunk'] }
        ]

        await h.service.process(h.job)

        const sources = h.model.invokeReduceModel.mock.calls[0][3]
        expect(sources[0].evidence).toEqual([
            { sourceChunkId: 'chunk', quote: originalText, ordinal: 1, sectionAnchor: 'fact-2' },
            { sourceChunkId: 'a-later', quote: 'A later source section.', ordinal: 0, sectionAnchor: 'fact-1' }
        ])
    })

    it('keeps multiple names from the same source in one contribution without losing facts', async () => {
        const h = fixture(false)
        Object.assign(h.service, {
            mapResultRepository: {
                find: async () => [
                    {
                        sourceDocumentIdSnapshot: 'doc',
                        sourceLifecycleGeneration: 1,
                        candidateKey: '1',
                        payload: h.payload
                    },
                    {
                        sourceDocumentIdSnapshot: 'doc',
                        sourceLifecycleGeneration: 1,
                        candidateKey: '2',
                        payload: {
                            ...h.payload,
                            canonicalName: 'Team alias',
                            facts: [{ text: 'Additional fact.', sourceChunkIds: ['chunk'] }]
                        }
                    }
                ]
            }
        })
        await h.service.process(h.job)
        const sources = h.model.invokeReduceModel.mock.calls[0][3]
        expect(sources).toHaveLength(1)
        expect(sources[0].payload.facts.map((fact) => fact.text)).toEqual([
            'Team maintains the service.',
            'Additional fact.'
        ])
        expect(sources[0].evidence).toHaveLength(2)
    })

    it('replaces only the updated document contribution and retains other current sources', async () => {
        const h = fixture(false)
        const other = Object.assign(new KnowledgeDocument(), h.document, { id: 'other' })
        Object.assign(h.service, {
            contributionRepository: {
                find: async () => [
                    {
                        sourceDocumentIdSnapshot: 'doc',
                        sourceLifecycleGeneration: 0,
                        payload: { ...h.payload, facts: [{ text: 'Old fact.', sourceChunkIds: ['chunk'] }] }
                    },
                    {
                        sourceDocumentIdSnapshot: 'other',
                        sourceLifecycleGeneration: 1,
                        payload: { ...h.payload, facts: [{ text: 'Other source fact.', sourceChunkIds: ['chunk'] }] }
                    }
                ],
                create: (value: object) => value,
                save: async () => undefined
            },
            documentRepository: { find: async () => [h.document, other] },
            sourceStateRepository: {
                find: async () => [
                    { sourceDocumentIdSnapshot: 'doc', lifecycleGeneration: 1, lastContentHash: 'hash' },
                    { sourceDocumentIdSnapshot: 'other', lifecycleGeneration: 1, lastContentHash: 'hash' }
                ]
            }
        })
        await h.service.process(h.job)
        const sources = h.model.invokeReduceModel.mock.calls[0][3]
        expect(sources).toHaveLength(2)
        expect(sources.flatMap((source) => source.payload.facts.map((fact) => fact.text))).toEqual([
            'Team maintains the service.',
            'Other source fact.'
        ])
    })
})
