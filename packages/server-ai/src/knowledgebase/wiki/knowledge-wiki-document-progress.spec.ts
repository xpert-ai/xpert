import { deriveDocumentWikiProgress, DocumentWikiProgressRow } from './knowledge-wiki-document-progress'

const base: DocumentWikiProgressRow = {
    documentId: 'doc',
    documentStatus: 'finish',
    disabled: false,
    hasSource: true,
    currentSource: true,
    needsUpdate: false,
    generationPending: true,
    mapStatus: 'succeeded',
    mapCurrent: true,
    reducePending: false,
    versionCount: 1,
    projectionPending: true,
    projectionFailed: false,
    finalizeStatus: 'queued',
    batchPending: false,
    failureJobId: null,
    failureType: null,
    failureError: null,
    failureCode: null,
    uncertain: false
}
describe('Document Wiki lifecycle projection', () => {
    it('keeps identity resolution in the generation stage and exposes its failed job for retry', () => {
        expect(
            deriveDocumentWikiProgress(
                { ...base, reducePending: true, versionCount: 0, finalizeStatus: null },
                false,
                true
            )
        ).toMatchObject({ state: 'generating', stages: { generation: 'running' } })
        expect(
            deriveDocumentWikiProgress(
                {
                    ...base,
                    reducePending: true,
                    versionCount: 0,
                    failureJobId: 'dedup',
                    failureType: 'identity_resolve'
                },
                false,
                true
            )
        ).toMatchObject({ state: 'failed', stages: { generation: 'failed' }, retry: { jobId: 'dedup' } })
    })
    it.each(['queued', 'running'] as const)('reports an active source-map state (%s)', (mapStatus) => {
        expect(deriveDocumentWikiProgress({ ...base, mapStatus }, false, true).state).toBe(
            mapStatus === 'queued' ? 'queued' : 'generating'
        )
    })
    it('does not mark this document generation failed when another source blocks a shared publication', () => {
        expect(
            deriveDocumentWikiProgress(
                { ...base, failureJobId: 'another-source', failureType: 'source_map', failureShared: true },
                false,
                true
            )
        ).toMatchObject({
            state: 'failed',
            waitingForBatch: true,
            stages: { generation: 'complete', publication: 'pending' }
        })
    })
    it('does not turn a source parsing failure into a Wiki failure', () => {
        expect(
            deriveDocumentWikiProgress({ ...base, documentStatus: 'error', failureJobId: 'old' }, false, true).state
        ).toBe('not_started')
    })
    it('does not equate successful extraction with Wiki readiness', () => {
        expect(deriveDocumentWikiProgress(base, false, true)).toMatchObject({
            state: 'indexing',
            stages: { generation: 'complete', indexing: 'pending', publication: 'pending' }
        })
    })
    it('distinguishes indexing, publishing and published content', () => {
        expect(deriveDocumentWikiProgress({ ...base, finalizeStatus: 'running' }, false, true).stages.indexing).toBe(
            'running'
        )
        expect(deriveDocumentWikiProgress({ ...base, projectionPending: false }, false, true).state).toBe('publishing')
        expect(
            deriveDocumentWikiProgress({ ...base, finalizeStatus: 'succeeded', projectionPending: false }, true, true)
                .state
        ).toBe('ready')
    })
    it('invalidates completion when source content changes', () => {
        expect(deriveDocumentWikiProgress({ ...base, currentSource: false }, true, true).state).toBe('outdated')
    })
    it('reports successful empty output without claiming search readiness', () => {
        expect(
            deriveDocumentWikiProgress({ ...base, versionCount: 0, finalizeStatus: 'succeeded' }, false, true)
        ).toMatchObject({
            state: 'no_content',
            canView: false,
            stages: { generation: 'complete', indexing: 'skipped' }
        })
    })
    it('uses a batch blocker without treating this source map as failed', () => {
        expect(
            deriveDocumentWikiProgress(
                { ...base, batchPending: true, reducePending: false, versionCount: 0, finalizeStatus: null },
                false,
                true
            )
        ).toMatchObject({ state: 'generating', waitingForBatch: true })
    })
    it('protects diagnostics and retry from read-only consumers', () => {
        const failed = {
            ...base,
            failureJobId: 'job',
            failureType: 'finalize',
            failureError: 'private error',
            uncertain: true
        }
        expect(deriveDocumentWikiProgress(failed, false, false)).toMatchObject({ state: 'failed' })
        expect(deriveDocumentWikiProgress(failed, false, false)).not.toHaveProperty('error')
        expect(deriveDocumentWikiProgress(failed, false, false)).not.toHaveProperty('retry')
        expect(deriveDocumentWikiProgress(failed, false, true)).toMatchObject({
            error: 'private error',
            retry: { jobId: 'job', requiresAdditionalChargeConfirmation: true }
        })
    })
    it('keeps one current state while older usable pages remain browsable', () => {
        expect(deriveDocumentWikiProgress({ ...base, mapStatus: 'running' }, true, true)).toMatchObject({
            state: 'generating',
            canView: true
        })
    })
})
