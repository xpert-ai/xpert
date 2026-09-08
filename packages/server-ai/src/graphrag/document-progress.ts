import {
    IKnowledgebase,
    IKnowledgeDocument,
    IKnowledgeGraphIndexJob,
    KBDocumentStatusEnum,
    KnowledgeGraphDocumentProgress,
    KnowledgeGraphDocumentStageState,
    KnowledgeGraphIndexJobStatus,
    KnowledgeGraphIndexStage,
    KnowledgeGraphStatus
} from '@xpert-ai/contracts'

// Only an explicit indexed outcome proves completion; older success jobs may have skipped work.
export function projectGraphDocumentProgress(
    knowledgebase: Pick<IKnowledgebase, 'graphRag' | 'graphRevision' | 'graphStatus'>,
    document: Pick<
        IKnowledgeDocument,
        'id' | 'status' | 'disabled' | 'contentHash' | 'publicationEpoch' | 'hardDeletePendingAt'
    >,
    job: IKnowledgeGraphIndexJob | null
): KnowledgeGraphDocumentProgress {
    const base = { documentId: document.id }
    if (!knowledgebase.graphRag?.enabled) return { ...base, state: 'disabled' }
    if (document.disabled || document.hardDeletePendingAt) return { ...base, state: 'source_disabled' }
    if (document.status !== KBDocumentStatusEnum.FINISH) return { ...base, state: 'waiting_source' }
    if (!job) return { ...base, state: 'not_started' }
    if (
        job.sourceContentHash !== document.contentHash ||
        (job.sourcePublicationEpoch ?? 0) !== (document.publicationEpoch ?? 0) ||
        (job.revision ?? 0) !== (knowledgebase.graphRevision ?? 0) ||
        knowledgebase.graphStatus === KnowledgeGraphStatus.REBUILD_REQUIRED
    )
        return { ...base, state: 'outdated' }

    if (job.status === KnowledgeGraphIndexJobStatus.SUCCESS) {
        switch (job.result) {
            case 'empty':
                return { ...base, state: 'no_content' }
            case 'superseded':
            case 'disabled':
                return { ...base, state: 'outdated' }
            case 'indexed':
                return {
                    ...base,
                    state: 'ready',
                    stages: { extraction: 'complete', persistence: 'complete', indexing: 'complete' }
                }
            default:
                return { ...base, state: 'completed' }
        }
    }
    if (job.status === KnowledgeGraphIndexJobStatus.CANCELLED) return { ...base, state: 'cancelled' }

    const state =
        job.status === KnowledgeGraphIndexJobStatus.QUEUED
            ? 'queued'
            : job.status === KnowledgeGraphIndexJobStatus.FAILED
              ? 'failed'
              : 'running'
    const progress: KnowledgeGraphDocumentProgress = {
        ...base,
        state,
        error: state === 'failed' ? job.error : null,
        processedChunks: job.processedChunks,
        totalChunks: job.totalChunks
    }
    const stages: KnowledgeGraphIndexStage[] = ['extraction', 'persistence', 'indexing']
    const active = stages.indexOf(job.stage)
    if (active >= 0 || state === 'queued') {
        const stageState = (index: number): KnowledgeGraphDocumentStageState => {
            if (state === 'queued' || index > active) return 'pending'
            if (index < active) return 'complete'
            return state === 'failed' ? 'failed' : 'running'
        }
        progress.stages = { extraction: stageState(0), persistence: stageState(1), indexing: stageState(2) }
    }
    return progress
}
