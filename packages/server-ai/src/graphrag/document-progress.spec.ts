import { KBDocumentStatusEnum, KnowledgeGraphIndexJobStatus, KnowledgeGraphStatus } from '@xpert-ai/contracts'
import { projectGraphDocumentProgress } from './document-progress'

describe('Graph document progress', () => {
    const knowledgebase = { graphRag: { enabled: true }, graphRevision: 2 }
    const document = { id: 'doc', status: KBDocumentStatusEnum.FINISH, contentHash: 'hash', publicationEpoch: 1 }
    const job = {
        documentId: 'doc',
        type: 'document' as const,
        status: KnowledgeGraphIndexJobStatus.RUNNING,
        sourceContentHash: 'hash',
        sourcePublicationEpoch: 1,
        revision: 2,
        stage: 'indexing' as const,
        totalChunks: 8,
        processedChunks: 8
    }

    it('shows unavailable when Graph is disabled, even with a previous successful job', () => {
        expect(projectGraphDocumentProgress({ graphRag: { enabled: false } }, document, job).state).toBe('disabled')
    })

    it('keeps indexing active when all chunks have been extracted', () => {
        expect(projectGraphDocumentProgress(knowledgebase, document, job)).toMatchObject({
            state: 'running',
            stages: { extraction: 'complete', persistence: 'complete', indexing: 'running' }
        })
    })

    it('only completes the steps after the indexed result is persisted', () => {
        expect(
            projectGraphDocumentProgress(knowledgebase, document, {
                ...job,
                status: KnowledgeGraphIndexJobStatus.SUCCESS,
                result: 'indexed'
            })
        ).toMatchObject({
            state: 'ready',
            stages: { extraction: 'complete', persistence: 'complete', indexing: 'complete' }
        })
    })

    it('retains the failing stage and the real error', () => {
        expect(
            projectGraphDocumentProgress(knowledgebase, document, {
                ...job,
                stage: 'persistence',
                status: KnowledgeGraphIndexJobStatus.FAILED,
                error: 'write failed'
            })
        ).toMatchObject({
            state: 'failed',
            error: 'write failed',
            stages: {
                extraction: 'complete',
                persistence: 'failed',
                indexing: 'pending'
            }
        })
    })

    it.each(['empty', 'superseded', 'disabled'] as const)(
        'never treats a skipped %s job as an indexed graph',
        (result) => {
            expect(
                projectGraphDocumentProgress(knowledgebase, document, {
                    ...job,
                    status: KnowledgeGraphIndexJobStatus.SUCCESS,
                    result
                }).state
            ).not.toBe('ready')
        }
    )

    it('does not invent stage completion for legacy success records', () => {
        const progress = projectGraphDocumentProgress(knowledgebase, document, {
            ...job,
            stage: null,
            status: KnowledgeGraphIndexJobStatus.SUCCESS
        })
        expect(progress.state).toBe('completed')
        expect(progress.stages).toBeUndefined()
    })

    it('invalidates results after content, publication epoch, or graph revision changes', () => {
        for (const patch of [{ contentHash: 'new' }, { publicationEpoch: 2 }]) {
            expect(projectGraphDocumentProgress(knowledgebase, { ...document, ...patch }, job).state).toBe('outdated')
        }
        expect(projectGraphDocumentProgress({ ...knowledgebase, graphRevision: 3 }, document, job).state).toBe(
            'outdated'
        )
        expect(
            projectGraphDocumentProgress(
                { ...knowledgebase, graphStatus: KnowledgeGraphStatus.REBUILD_REQUIRED },
                document,
                job
            ).state
        ).toBe('outdated')
    })

    it('distinguishes a disabled source, waiting for parsing, and no job', () => {
        expect(projectGraphDocumentProgress(knowledgebase, { ...document, disabled: true }, job).state).toBe(
            'source_disabled'
        )
        expect(
            projectGraphDocumentProgress(knowledgebase, { ...document, status: KBDocumentStatusEnum.RUNNING }, null)
                .state
        ).toBe('waiting_source')
        expect(projectGraphDocumentProgress(knowledgebase, document, null).state).toBe('not_started')
    })
})
