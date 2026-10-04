import { useEffect } from 'react'
import { connectHost, notify } from './bridge'
import { t } from './i18n'
import { extractCitationTarget, extractInitialCitationTarget, type KnowledgeWorkbenchCitationTarget } from './utils'

type WorkbenchHostState = {
    setActiveKnowledgebaseId: (id: string) => void
    setViewMode: (mode: 'documents' | 'graph') => void
    setHighlightedChunkId: (id: string | null) => void
    setParentId: (id: string | null) => void
    setPage: (page: number) => void
    setInitialCitationTarget: (target: KnowledgeWorkbenchCitationTarget | null) => void
    setReady: (ready: boolean) => void
    loadData: (options: {
        documentId: string
        chunkId?: string
        nextParentId: null
        nextKbId?: string
    }) => Promise<void>
    resetContext: () => void
}

export function useWorkbenchHost({
    setActiveKnowledgebaseId,
    setViewMode,
    setHighlightedChunkId,
    setParentId,
    setPage,
    setInitialCitationTarget,
    setReady,
    loadData,
    resetContext
}: WorkbenchHostState) {
    useEffect(
        () =>
            connectHost(
                (query) => {
                    const citationTarget = extractInitialCitationTarget(query)
                    const initialKb = citationTarget?.knowledgebaseId ?? query?.parameters?.knowledgebaseId
                    if (typeof initialKb === 'string') setActiveKnowledgebaseId(initialKb)
                    if (citationTarget) {
                        setViewMode('documents')
                        setHighlightedChunkId(citationTarget.chunkId ?? null)
                        setParentId(null)
                        setPage(1)
                    }
                    setInitialCitationTarget(citationTarget)
                    setReady(true)
                },
                (event) => {
                    const target = extractCitationTarget(event)
                    if (!target.documentId) return
                    setViewMode('documents')
                    if (target.knowledgebaseId) setActiveKnowledgebaseId(target.knowledgebaseId)
                    setHighlightedChunkId(target.chunkId ?? null)
                    setParentId(null)
                    setPage(1)
                    void loadData({
                        documentId: target.documentId,
                        chunkId: target.chunkId,
                        nextParentId: null,
                        nextKbId: target.knowledgebaseId
                    })
                    notify(t('sourceHighlighted'))
                },
                resetContext
            ),
        [
            setActiveKnowledgebaseId,
            setViewMode,
            setHighlightedChunkId,
            setParentId,
            setPage,
            setInitialCitationTarget,
            setReady,
            loadData,
            resetContext
        ]
    )
}
