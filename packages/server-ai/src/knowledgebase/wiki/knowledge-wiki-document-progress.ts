import { KnowledgeWikiDocumentProgress, KnowledgeWikiJobStatus, KBDocumentStatusEnum } from '@xpert-ai/contracts'

/** Read-model fields produced by the scoped SQL projection, not a second persisted lifecycle. */
export type DocumentWikiProgressRow = {
    documentId: string
    documentStatus: string
    disabled: boolean | null
    hasSource: boolean
    currentSource: boolean | null
    needsUpdate: boolean | null
    generationPending: boolean | null
    mapStatus: KnowledgeWikiJobStatus | null
    mapCurrent: boolean | null
    reducePending: boolean
    versionCount: number
    projectionPending: boolean
    projectionFailed: boolean
    finalizeStatus: KnowledgeWikiJobStatus | null
    batchPending: boolean
    failureJobId: string | null
    failureType: string | null
    failureShared?: boolean
    failureError: string | null
    failureCode: string | null
    uncertain: boolean
}

export function deriveDocumentWikiProgress(
    row: DocumentWikiProgressRow,
    indexed: boolean,
    canManage: boolean
): KnowledgeWikiDocumentProgress {
    const result: KnowledgeWikiDocumentProgress = {
        documentId: row.documentId,
        state: 'not_started',
        canView: false,
        stages: { generation: 'pending', indexing: 'pending', publication: 'pending' }
    }
    if (row.disabled || row.documentStatus !== KBDocumentStatusEnum.FINISH) return result
    if (
        (row.hasSource && (!row.currentSource || row.needsUpdate)) ||
        (row.mapStatus && (!row.mapCurrent || ['stale', 'cancelled'].includes(row.mapStatus)))
    ) {
        result.state = 'outdated'
        return result
    }
    result.canView = indexed
    if (!row.mapStatus) {
        if (indexed) {
            result.state = 'ready'
            result.stages = { generation: 'complete', indexing: 'complete', publication: 'complete' }
        } else if (row.generationPending) result.state = 'queued'
        return result
    }
    result.waitingForBatch = row.batchPending
    const generated = row.mapStatus === 'succeeded' && !row.reducePending && row.versionCount > 0
    if (generated) result.stages.generation = 'complete'
    if (generated && !row.projectionPending && !row.projectionFailed) result.stages.indexing = 'complete'
    if (row.failureJobId || row.projectionFailed) {
        result.state = 'failed'
        if (row.failureShared) {
            result.waitingForBatch = true
        } else if (row.failureType === 'source_map' || row.failureType === 'page_reduce' || !generated) {
            result.stages.generation = 'failed'
        } else if (result.stages.indexing !== 'complete') result.stages.indexing = 'failed'
        else result.stages.publication = 'failed'
        if (canManage) {
            if (row.failureError) result.error = row.failureError
            if (row.failureCode) result.errorCode = row.failureCode
            if (row.failureJobId)
                result.retry = {
                    jobId: row.failureJobId,
                    requiresAdditionalChargeConfirmation: row.uncertain
                }
        }
        return result
    }
    if (row.finalizeStatus === 'succeeded') {
        if (indexed) {
            result.state = 'ready'
            result.stages = { generation: 'complete', indexing: 'complete', publication: 'complete' }
        } else if (!row.versionCount) {
            result.state = 'no_content'
            result.stages = { generation: 'complete', indexing: 'skipped', publication: 'skipped' }
        } else result.state = 'outdated'
        return result
    }
    if (row.mapStatus === 'queued') result.state = 'queued'
    else if (!generated) {
        result.state = 'generating'
        result.stages.generation = 'running'
    } else if (result.stages.indexing !== 'complete') {
        result.state = 'indexing'
        if (row.finalizeStatus === 'running') result.stages.indexing = 'running'
    } else {
        result.state = 'publishing'
        if (row.finalizeStatus === 'running') result.stages.publication = 'running'
    }
    return result
}
