import * as React from 'react'
import { WORKBENCH_FILE_OPEN_COMMAND, type WorkbenchOpenFile } from '@xpert-ai/contracts'
import {
    Badge,
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    ScrollArea,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tabs,
    TabsList,
    TabsTrigger,
    TooltipProvider,
    cn,
    installShadcnThemeVars
} from '@xpert-ai/shadcn-ui'
import { ArrowDownUp, ChevronLeft, ChevronRight, FilePlus2, FolderPlus, RefreshCw, Search } from 'lucide-react'
import {
    CHANNEL,
    PROTOCOL_VERSION,
    applyTheme,
    executeAction,
    executeFileAction,
    invokeClientCommand,
    notify,
    requestData,
    resolveHostResponse,
    sendToHost,
    setInstanceId,
    syncAssistantContext
} from './bridge'
import { DocumentListRow, sortDocumentRows } from './document-components'
import { KnowledgeGraphPanel } from './graph-components'
import { setLocale, t } from './i18n'
import { IconButton, KnowledgebaseOverview } from './layout-components'
import { WorkbenchPreviewPanel } from './preview-components'
import type {
    DocumentPreview,
    DocumentRow,
    GraphEvidenceChunk,
    GraphNodeDetail,
    GraphSummary,
    KnowledgebaseRow
} from './types'
import { compact, extractCitationTarget, normalizeFileSize, readError } from './utils'

declare const ReactDOM: any

const PREVIEW_WIDTH_STORAGE_KEY = 'xpert.knowledgeWorkbench.previewWidth'
// Store the preview column as a percentage so it survives different workbench widths.
const DEFAULT_PREVIEW_WIDTH_PERCENT = 46
const MIN_PREVIEW_WIDTH_PERCENT = 28
const MAX_PREVIEW_WIDTH_PERCENT = 72
const MIN_WORKBENCH_COLUMN_WIDTH = 320
const RESIZE_HANDLE_WIDTH = 10

function App() {
    const [ready, setReady] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [knowledgebases, setKnowledgebases] = React.useState<KnowledgebaseRow[]>([])
    const [activeKnowledgebaseId, setActiveKnowledgebaseId] = React.useState('')
    const [parentId, setParentId] = React.useState<string | null>(null)
    const [breadcrumb, setBreadcrumb] = React.useState<Array<{ id: string; name?: string }>>([])
    const [items, setItems] = React.useState<DocumentRow[]>([])
    const [total, setTotal] = React.useState(0)
    const [search, setSearch] = React.useState('')
    const [page, setPage] = React.useState(1)
    const [pageSize] = React.useState(20)
    const [selected, setSelected] = React.useState<Record<string, DocumentRow>>({})
    const [preview, setPreview] = React.useState<DocumentPreview | null>(null)
    const [previewMode, setPreviewMode] = React.useState<'markdown' | 'text'>('markdown')
    const [viewMode, setViewMode] = React.useState<'documents' | 'graph'>('documents')
    const [graph, setGraph] = React.useState<GraphSummary | null>(null)
    const [graphLoading, setGraphLoading] = React.useState(false)
    const [graphSearch, setGraphSearch] = React.useState('')
    const [graphEntityType, setGraphEntityType] = React.useState('')
    const [graphRelationType, setGraphRelationType] = React.useState('')
    const [focusedGraphNodeId, setFocusedGraphNodeId] = React.useState<string | null>(null)
    const [focusedGraphNodeDetail, setFocusedGraphNodeDetail] = React.useState<GraphNodeDetail | null>(null)
    const [graphDetailLoading, setGraphDetailLoading] = React.useState(false)
    const [highlightedChunkId, setHighlightedChunkId] = React.useState<string | null>(null)
    const [searchOpen, setSearchOpen] = React.useState(false)
    const [sortMode, setSortMode] = React.useState<'updated' | 'name'>('updated')
    const [createFolderDialogOpen, setCreateFolderDialogOpen] = React.useState(false)
    const [folderNameInput, setFolderNameInput] = React.useState('')
    const [previewWidth, setPreviewWidth] = React.useState(readStoredPreviewWidth)
    const [isNarrowViewport, setIsNarrowViewport] = React.useState(isNarrowWorkbenchViewport)
    const layoutRef = React.useRef<HTMLElement | null>(null)
    const fileInputRef = React.useRef<HTMLInputElement | null>(null)

    const selectedRows = React.useMemo(() => Object.values(selected), [selected])
    const selectedIds = React.useMemo(() => selectedRows.map((row) => row.id).join('|'), [selectedRows])
    const activeKnowledgebase = knowledgebases.find((item) => item.id === activeKnowledgebaseId) ?? null
    const visibleItems = React.useMemo(() => sortDocumentRows(items, sortMode), [items, sortMode])
    const graphSupported = activeKnowledgebase?.graphEnabled === true
    const graphNodes = graph?.nodes ?? []
    const graphEdges = graph?.edges ?? []
    const focusedGraphNode = graphNodes.find((node) => node.id === focusedGraphNodeId) ?? null
    const focusedGraphEdges = focusedGraphNode
        ? graphEdges.filter((edge) => edge.source === focusedGraphNode.id || edge.target === focusedGraphNode.id)
        : []

    const loadData = React.useCallback(
        async (
            options: {
                documentId?: string
                chunkId?: string
                nextPage?: number
                nextParentId?: string | null
                nextKbId?: string
            } = {}
        ) => {
            if (!ready) {
                return
            }
            const resolvedKbId = options.nextKbId ?? activeKnowledgebaseId
            if (!resolvedKbId && knowledgebases.length) {
                return
            }
            setLoading(true)
            setError(null)
            try {
                const data = await requestData({
                    page: options.nextPage ?? page,
                    pageSize,
                    search,
                    parameters: compact({
                        knowledgebaseId: resolvedKbId,
                        parentId: options.nextParentId === undefined ? parentId : options.nextParentId,
                        documentId: options.documentId,
                        chunkId: options.chunkId
                    })
                })
                const summary = data.summary ?? {}
                const nextKbs = summary.knowledgebases ?? knowledgebases
                const nextKbId = summary.activeKnowledgebaseId ?? resolvedKbId ?? nextKbs[0]?.id ?? ''
                setKnowledgebases(nextKbs)
                setActiveKnowledgebaseId(nextKbId)
                setItems(data.items ?? [])
                setTotal(data.total ?? 0)
                setBreadcrumb(summary.breadcrumb ?? [])
                if (summary.selectedDocument) {
                    setPreview(summary.selectedDocument)
                } else if (options.documentId) {
                    setPreview(null)
                }
            } catch (loadError) {
                setError(readError(loadError))
            } finally {
                setLoading(false)
            }
        },
        [ready, activeKnowledgebaseId, knowledgebases, page, pageSize, search, parentId]
    )

    const loadGraphData = React.useCallback(
        async (
            options: {
                nextKbId?: string
                nextSearch?: string
                nextEntityType?: string
                nextRelationType?: string
                nextFocusEntityId?: string | null
            } = {}
        ) => {
            if (!ready) {
                return
            }
            const resolvedKbId = options.nextKbId ?? activeKnowledgebaseId
            if (!resolvedKbId) {
                return
            }
            setGraphLoading(true)
            setError(null)
            try {
                const entityType = options.nextEntityType === undefined ? graphEntityType : options.nextEntityType
                const relationType =
                    options.nextRelationType === undefined ? graphRelationType : options.nextRelationType
                const focusEntityId =
                    options.nextFocusEntityId === undefined ? focusedGraphNodeId : options.nextFocusEntityId
                const data = await requestData({
                    page: 1,
                    pageSize: 1,
                    search: options.nextSearch ?? graphSearch,
                    parameters: compact({
                        table: 'graph',
                        knowledgebaseId: resolvedKbId,
                        entityType,
                        relationType,
                        focusEntityId,
                        take: 120
                    })
                })
                const summary = data.summary ?? {}
                if (summary.knowledgebases?.length) {
                    setKnowledgebases(summary.knowledgebases)
                }
                setGraph(summary.graph ?? null)
            } catch (graphError) {
                setError(readError(graphError))
                setGraph(null)
            } finally {
                setGraphLoading(false)
            }
        },
        [ready, activeKnowledgebaseId, graphSearch, graphEntityType, graphRelationType, focusedGraphNodeId]
    )

    const loadGraphNodeDetail = React.useCallback(
        async (entityId: string) => {
            if (!ready || !activeKnowledgebaseId) {
                return
            }
            setGraphDetailLoading(true)
            setError(null)
            try {
                const data = await requestData({
                    page: 1,
                    pageSize: 1,
                    parameters: compact({
                        table: 'graph-node-detail',
                        knowledgebaseId: activeKnowledgebaseId,
                        entityId,
                        neighborHops: 1,
                        take: 6,
                        mentionTake: 3
                    })
                })
                setFocusedGraphNodeDetail(data.summary?.graphNodeDetail ?? null)
            } catch (detailError) {
                setFocusedGraphNodeDetail(null)
                setError(readError(detailError))
            } finally {
                setGraphDetailLoading(false)
            }
        },
        [ready, activeKnowledgebaseId]
    )

    React.useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const message = event.data
            if (!message || message.channel !== CHANNEL || message.protocolVersion !== PROTOCOL_VERSION) {
                return
            }

            if (message.type === 'init') {
                setInstanceId(message.instanceId)
                setLocale(message.locale)
                applyTheme(message.theme)
                installShadcnThemeVars({ density: 'compact' })
                const initialKb = message.initialQuery?.parameters?.knowledgebaseId
                if (typeof initialKb === 'string') {
                    setActiveKnowledgebaseId(initialKb)
                }
                setReady(true)
                return
            }

            if (message.type === 'hostEvent') {
                const target = extractCitationTarget(message.event)
                if (target.documentId) {
                    setViewMode('documents')
                    if (target.knowledgebaseId) {
                        setActiveKnowledgebaseId(target.knowledgebaseId)
                    }
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
                }
                return
            }
            if (resolveHostResponse(message)) {
                return
            }
        }

        window.addEventListener('message', onMessage)
        sendToHost('ready')
        return () => window.removeEventListener('message', onMessage)
    }, [loadData])

    React.useEffect(() => {
        if (ready) {
            void loadData()
        }
    }, [ready])

    React.useEffect(() => {
        if (!graphSupported && viewMode === 'graph') {
            setViewMode('documents')
            setFocusedGraphNodeId(null)
            setFocusedGraphNodeDetail(null)
        }
    }, [graphSupported, viewMode])

    React.useEffect(() => {
        const timer = window.setTimeout(() => {
            if (ready) {
                setPage(1)
                void loadData({ nextPage: 1 })
            }
        }, 250)
        return () => window.clearTimeout(timer)
    }, [search])

    React.useEffect(() => {
        if (viewMode !== 'graph' || !graphSupported) {
            return
        }
        const timer = window.setTimeout(() => {
            void loadGraphData()
        }, 250)
        return () => window.clearTimeout(timer)
    }, [
        viewMode,
        graphSupported,
        activeKnowledgebaseId,
        graphSearch,
        graphEntityType,
        graphRelationType,
        focusedGraphNodeId
    ])

    React.useEffect(() => {
        if (viewMode !== 'graph' || !graphSupported || !focusedGraphNodeId) {
            setFocusedGraphNodeDetail(null)
            setGraphDetailLoading(false)
            return
        }
        const timer = window.setTimeout(() => {
            void loadGraphNodeDetail(focusedGraphNodeId)
        }, 120)
        return () => window.clearTimeout(timer)
    }, [viewMode, graphSupported, focusedGraphNodeId, loadGraphNodeDetail])

    React.useEffect(() => {
        syncAssistantContext(activeKnowledgebaseId, selectedRows)
    }, [activeKnowledgebaseId, selectedIds])

    React.useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) {
            return
        }

        const media = window.matchMedia('(max-width: 760px)')
        const syncViewport = () => setIsNarrowViewport(media.matches)
        syncViewport()
        media.addEventListener?.('change', syncViewport)
        return () => media.removeEventListener?.('change', syncViewport)
    }, [])

    React.useEffect(() => {
        const resize = () =>
            sendToHost('resize', {
                height: Math.max(620, document.documentElement.scrollHeight),
                viewportBound: true
            })
        resize()
        const timer = window.setTimeout(resize, 60)
        return () => window.clearTimeout(timer)
    })

    const changeKnowledgebase = (value: string) => {
        setActiveKnowledgebaseId(value)
        setParentId(null)
        setPage(1)
        setSelected({})
        setPreview(null)
        setGraph(null)
        setGraphSearch('')
        setGraphEntityType('')
        setGraphRelationType('')
        setFocusedGraphNodeId(null)
        setFocusedGraphNodeDetail(null)
        setViewMode('documents')
        setHighlightedChunkId(null)
        void loadData({ nextKbId: value, nextParentId: null, nextPage: 1 })
    }

    const openFolder = (row: DocumentRow) => {
        setParentId(row.id)
        setPage(1)
        setPreview(null)
        setHighlightedChunkId(null)
        void loadData({ nextParentId: row.id, nextPage: 1 })
    }

    const openRoot = () => {
        setParentId(null)
        setPage(1)
        setPreview(null)
        setHighlightedChunkId(null)
        void loadData({ nextParentId: null, nextPage: 1 })
    }

    const previewDocument = (row: DocumentRow) => {
        setHighlightedChunkId(null)
        setPreviewMode('markdown')
        setPreview({ document: row, chunks: [], totalChunks: row.chunkNum ?? 0 })
        void loadData({ documentId: row.id })
    }

    const toggleDocument = (row: DocumentRow) => {
        if (row.isFolder) {
            return
        }
        setSelected((current) => {
            const next = { ...current }
            if (next[row.id]) {
                delete next[row.id]
            } else {
                next[row.id] = row
            }
            return next
        })
    }

    const uploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = Array.from(event.target.files ?? [])
        event.target.value = ''
        if (!files.length || !activeKnowledgebaseId) {
            return
        }
        setLoading(true)
        try {
            for (const file of files) {
                await executeFileAction(
                    'upload_document',
                    file,
                    compact({
                        knowledgebaseId: activeKnowledgebaseId,
                        parentId,
                        process: true
                    })
                )
            }
            notify(t('uploadDone'))
            await loadData()
        } catch (uploadError) {
            notify(readError(uploadError), 'error')
        } finally {
            setLoading(false)
        }
    }

    const createFolder = async () => {
        const name = folderNameInput.trim()
        if (!name || !activeKnowledgebaseId) {
            return
        }
        setLoading(true)
        try {
            await executeAction(
                'create_folder',
                compact({
                    name,
                    knowledgebaseId: activeKnowledgebaseId,
                    parentId
                })
            )
            setCreateFolderDialogOpen(false)
            setFolderNameInput('')
            await loadData()
        } catch (folderError) {
            notify(readError(folderError), 'error')
        } finally {
            setLoading(false)
        }
    }

    const openOriginal = async (row: DocumentRow) => {
        const url = row.fileUrl || preview?.originalFile?.url
        if (!url) {
            return
        }
        const file = {
            id: row.id,
            name: row.name || 'source-document',
            mimeType: row.mimeType || preview?.originalFile?.mimeType,
            size: normalizeFileSize(row.size ?? preview?.originalFile?.size),
            url,
            previewUrl: url
        } satisfies WorkbenchOpenFile
        await invokeClientCommand(WORKBENCH_FILE_OPEN_COMMAND, file)
    }

    const openGraphEvidence = React.useCallback(
        (chunk: GraphEvidenceChunk) => {
            if (!chunk.documentId) {
                return
            }
            setViewMode('documents')
            setParentId(null)
            setPage(1)
            setPreviewMode('markdown')
            setHighlightedChunkId(chunk.chunkId ?? null)
            setPreview({
                document: {
                    id: chunk.documentId,
                    knowledgebaseId: chunk.knowledgebaseId ?? activeKnowledgebaseId,
                    name: chunk.documentName ?? chunk.documentId,
                    type: chunk.mimeType ?? null,
                    mimeType: chunk.mimeType ?? null,
                    fileUrl: chunk.fileUrl ?? null,
                    isFolder: false
                },
                chunks: [],
                totalChunks: 0
            })
            void loadData({
                documentId: chunk.documentId,
                chunkId: chunk.chunkId,
                nextParentId: null,
                nextKbId: chunk.knowledgebaseId ?? activeKnowledgebaseId
            })
            notify(t('sourceHighlighted'))
        },
        [activeKnowledgebaseId, loadData]
    )

    const openKnowledgebaseDocuments = async () => {
        if (!activeKnowledgebaseId) {
            return
        }

        await invokeClientCommand('workbench.navigation.open', {
            target: 'knowledgebase.documents',
            knowledgebaseId: activeKnowledgebaseId
        })
    }

    const resolvePreviewWidth = React.useCallback(
        (clientX: number) => {
            const rect = layoutRef.current?.getBoundingClientRect()
            if (!rect?.width) {
                return previewWidth
            }
            // Pixel minimum wins on narrow containers so neither pane collapses below usable width.
            const minByPixels = (MIN_WORKBENCH_COLUMN_WIDTH / rect.width) * 100
            const minWidth = Math.max(MIN_PREVIEW_WIDTH_PERCENT, Math.min(45, minByPixels))
            const maxWidth = Math.min(MAX_PREVIEW_WIDTH_PERCENT, 100 - minWidth)
            return clampPreviewWidth(((rect.right - clientX) / rect.width) * 100, minWidth, maxWidth)
        },
        [previewWidth]
    )

    const handlePreviewResizeStart = React.useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (isNarrowViewport) {
                return
            }

            event.preventDefault()
            let nextWidth = previewWidth
            const previousCursor = document.body.style.cursor
            const previousUserSelect = document.body.style.userSelect
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'

            // Capture movement on document so dragging remains smooth outside the narrow handle.
            const onPointerMove = (moveEvent: PointerEvent) => {
                nextWidth = resolvePreviewWidth(moveEvent.clientX)
                setPreviewWidth(nextWidth)
            }
            const onPointerUp = () => {
                document.removeEventListener('pointermove', onPointerMove)
                document.removeEventListener('pointerup', onPointerUp)
                document.body.style.cursor = previousCursor
                document.body.style.userSelect = previousUserSelect
                storePreviewWidth(nextWidth)
            }

            document.addEventListener('pointermove', onPointerMove)
            document.addEventListener('pointerup', onPointerUp)
        },
        [isNarrowViewport, previewWidth, resolvePreviewWidth]
    )

    const handlePreviewResizeKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
            return
        }
        event.preventDefault()
        setPreviewWidth((current) => {
            const next = clampPreviewWidth(current + (event.key === 'ArrowLeft' ? 2 : -2))
            storePreviewWidth(next)
            return next
        })
    }, [])

    const resetPreviewWidth = React.useCallback(() => {
        setPreviewWidth(DEFAULT_PREVIEW_WIDTH_PERCENT)
        storePreviewWidth(DEFAULT_PREVIEW_WIDTH_PERCENT)
    }, [])

    const layoutStyle = React.useMemo<React.CSSProperties | undefined>(
        () =>
            isNarrowViewport
                ? undefined
                : {
                      gridTemplateColumns: `minmax(${MIN_WORKBENCH_COLUMN_WIDTH}px, ${
                          100 - previewWidth
                      }fr) ${RESIZE_HANDLE_WIDTH}px minmax(${MIN_WORKBENCH_COLUMN_WIDTH}px, ${previewWidth}fr)`
                  },
        [isNarrowViewport, previewWidth]
    )

    const pageCount = Math.max(1, Math.ceil(total / pageSize))

    return (
        <TooltipProvider>
            <main className="flex h-screen min-h-[620px] flex-col gap-2 bg-background p-3 font-sans text-foreground">
                <header className="flex min-h-10 items-center justify-between gap-2 max-[760px]:items-stretch max-[760px]:flex-col">
                    <div className="flex min-w-0 items-center gap-2 max-[760px]:w-full">
                        <span className="shrink-0 font-medium text-muted-foreground">{t('knowledgebase')}</span>
                        <Select
                            value={activeKnowledgebaseId}
                            onValueChange={changeKnowledgebase}
                            disabled={!knowledgebases.length}
                        >
                            <SelectTrigger className="h-9 min-w-0 max-w-[300px] flex-1 bg-card max-[760px]:max-w-none">
                                <SelectValue placeholder={t('knowledgebase')} />
                            </SelectTrigger>
                            <SelectContent position="popper">
                                {knowledgebases.map((kb) => (
                                    <SelectItem key={kb.id} value={kb.id}>
                                        {kb.name || kb.id}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {activeKnowledgebase ? (
                            <Badge variant="secondary" className="shrink-0 rounded-md">
                                {activeKnowledgebase.documentNum ?? 0} {t('docs')}
                            </Badge>
                        ) : null}
                    </div>

                    <div className="flex min-w-0 items-center gap-2 max-[760px]:w-full">
                        <IconButton title={t('refresh')} onClick={() => loadData()} disabled={loading}>
                            <RefreshCw className={loading ? 'animate-spin' : ''} />
                        </IconButton>
                        <input ref={fileInputRef} hidden multiple type="file" onChange={uploadFiles} />
                    </div>
                </header>

                {error ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
                        {error}
                    </div>
                ) : null}
                {!knowledgebases.length ? (
                    <div className="grid min-h-24 place-items-center rounded-lg border border-dashed text-muted-foreground">
                        {t('noKnowledgebase')}
                    </div>
                ) : null}

                <section
                    ref={layoutRef}
                    className="grid min-h-0 flex-1 grid-cols-[minmax(320px,0.54fr)_10px_minmax(320px,0.46fr)] gap-0 max-[760px]:grid-cols-1 max-[760px]:grid-rows-[minmax(280px,1fr)_minmax(260px,0.8fr)] max-[760px]:gap-3"
                    style={layoutStyle}
                >
                    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-background">
                        <KnowledgebaseOverview
                            knowledgebase={activeKnowledgebase}
                            breadcrumb={breadcrumb}
                            onRoot={openRoot}
                            onNavigate={(item) => {
                                setParentId(item.id)
                                setPage(1)
                                setHighlightedChunkId(null)
                                void loadData({ nextParentId: item.id, nextPage: 1 })
                            }}
                            onManage={() => {
                                void openKnowledgebaseDocuments()
                            }}
                        />
                        <div className="flex min-h-12 items-center justify-between gap-2 border-b px-4 py-2 max-[900px]:px-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <h2 className="truncate font-semibold">
                                    {viewMode === 'graph' ? t('graph') : `${t('content')}(${total})`}
                                </h2>
                                {graphSupported ? (
                                    <Tabs
                                        value={viewMode}
                                        onValueChange={(value) =>
                                            setViewMode(value === 'graph' ? 'graph' : 'documents')
                                        }
                                    >
                                        <TabsList className="h-8" variant="line">
                                            <TabsTrigger value="documents" className="px-2">
                                                {t('documentsView')}
                                            </TabsTrigger>
                                            <TabsTrigger value="graph" className="px-2">
                                                {t('graphView')}
                                            </TabsTrigger>
                                        </TabsList>
                                    </Tabs>
                                ) : null}
                                {viewMode === 'documents' && selectedRows.length ? (
                                    <Badge variant="secondary" className="rounded-md">
                                        {selectedRows.length} {t('selected')}
                                    </Badge>
                                ) : null}
                            </div>
                            <div className="flex min-w-0 items-center gap-1">
                                {viewMode === 'graph' ? (
                                    <>
                                        <div className="relative w-[180px] max-[900px]:w-[136px]">
                                            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                            <Input
                                                value={graphSearch}
                                                className="h-8 rounded-md border-0 bg-muted/70 pl-8 shadow-none"
                                                placeholder={t('search')}
                                                onChange={(event) => {
                                                    setFocusedGraphNodeId(null)
                                                    setFocusedGraphNodeDetail(null)
                                                    setGraphSearch(event.target.value)
                                                }}
                                            />
                                        </div>
                                        <Select
                                            value={graphEntityType || '__all'}
                                            onValueChange={(value) => {
                                                setFocusedGraphNodeId(null)
                                                setFocusedGraphNodeDetail(null)
                                                setGraphEntityType(value === '__all' ? '' : value)
                                            }}
                                            disabled={!graph?.entityTypes?.length}
                                        >
                                            <SelectTrigger className="h-8 w-[136px] bg-card">
                                                <SelectValue placeholder={t('entityType')} />
                                            </SelectTrigger>
                                            <SelectContent position="popper">
                                                <SelectItem value="__all">{t('allTypes')}</SelectItem>
                                                {(graph?.entityTypes ?? []).map((type) => (
                                                    <SelectItem key={type} value={type}>
                                                        {type}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select
                                            value={graphRelationType || '__all'}
                                            onValueChange={(value) => {
                                                setFocusedGraphNodeId(null)
                                                setFocusedGraphNodeDetail(null)
                                                setGraphRelationType(value === '__all' ? '' : value)
                                            }}
                                            disabled={!graph?.relationTypes?.length}
                                        >
                                            <SelectTrigger className="h-8 w-[136px] bg-card">
                                                <SelectValue placeholder={t('relationType')} />
                                            </SelectTrigger>
                                            <SelectContent position="popper">
                                                <SelectItem value="__all">{t('allRelations')}</SelectItem>
                                                {(graph?.relationTypes ?? []).map((type) => (
                                                    <SelectItem key={type} value={type}>
                                                        {type}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {focusedGraphNodeId ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                onClick={() => {
                                                    setFocusedGraphNodeId(null)
                                                    setFocusedGraphNodeDetail(null)
                                                }}
                                            >
                                                {t('clearFocus')}
                                            </Button>
                                        ) : null}
                                        <IconButton
                                            title={t('refresh')}
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={() => loadGraphData()}
                                            disabled={graphLoading}
                                        >
                                            <RefreshCw className={cn('size-3.5', graphLoading ? 'animate-spin' : '')} />
                                        </IconButton>
                                    </>
                                ) : (
                                    <>
                                        {searchOpen ? (
                                            <div className="relative w-[170px] max-[900px]:w-[136px]">
                                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                                <Input
                                                    autoFocus
                                                    value={search}
                                                    className="h-8 rounded-md border-0 bg-muted/70 pl-8 shadow-none"
                                                    placeholder={t('search')}
                                                    onChange={(event) => setSearch(event.target.value)}
                                                />
                                            </div>
                                        ) : null}
                                        <IconButton
                                            title={t('search')}
                                            variant="ghost"
                                            size="icon-xs"
                                            className={cn(
                                                'text-muted-foreground hover:bg-muted',
                                                searchOpen ? 'bg-muted text-foreground' : ''
                                            )}
                                            onClick={() => setSearchOpen((value) => !value)}
                                        >
                                            <Search className="size-3.5" />
                                        </IconButton>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 rounded-md px-2 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                                            onClick={() =>
                                                setSortMode((value) => (value === 'updated' ? 'name' : 'updated'))
                                            }
                                            title={sortMode === 'updated' ? t('sortByUpdated') : t('sortByName')}
                                        >
                                            <ArrowDownUp className="size-3.5" />
                                            {t('sort')}
                                        </Button>
                                        <IconButton
                                            title={t('newFolder')}
                                            variant="ghost"
                                            size="icon-xs"
                                            className="text-muted-foreground hover:bg-muted"
                                            onClick={() => setCreateFolderDialogOpen(true)}
                                            disabled={!activeKnowledgebaseId || loading}
                                        >
                                            <FolderPlus className="size-3.5" />
                                        </IconButton>
                                        <IconButton
                                            title={t('upload')}
                                            variant="ghost"
                                            size="icon-xs"
                                            className="text-muted-foreground hover:bg-muted"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={!activeKnowledgebaseId || loading}
                                        >
                                            <FilePlus2 className="size-3.5" />
                                        </IconButton>
                                    </>
                                )}
                            </div>
                        </div>
                        {viewMode === 'graph' ? (
                            <KnowledgeGraphPanel
                                graph={graph}
                                loading={graphLoading}
                                searchTerm={graphSearch}
                                focusedNodeId={focusedGraphNodeId}
                                onFocusNode={(nodeId) => {
                                    setFocusedGraphNodeId(nodeId)
                                    setFocusedGraphNodeDetail(null)
                                }}
                                onClearFocus={() => {
                                    setFocusedGraphNodeId(null)
                                    setFocusedGraphNodeDetail(null)
                                }}
                            />
                        ) : (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <ScrollArea className="min-h-0 flex-1">
                                    <div className="py-2">
                                        <div className="space-y-1">
                                            {visibleItems.map((row) => (
                                                <DocumentListRow
                                                    key={row.id}
                                                    row={row}
                                                    active={preview?.document.id === row.id}
                                                    selected={Boolean(selected[row.id])}
                                                    onOpen={() =>
                                                        row.isFolder ? openFolder(row) : previewDocument(row)
                                                    }
                                                    onToggle={() => toggleDocument(row)}
                                                />
                                            ))}
                                        </div>
                                        {!visibleItems.length && !loading ? (
                                            <div className="grid min-h-28 place-items-center text-muted-foreground">
                                                {t('noDocuments')}
                                            </div>
                                        ) : null}
                                        {visibleItems.length ? (
                                            <div className="pt-4 text-center text-muted-foreground/55">
                                                {t('noMore')}
                                            </div>
                                        ) : null}
                                    </div>
                                </ScrollArea>
                                <div
                                    className={cn(
                                        'flex min-h-10 items-center justify-end gap-2 border-t px-5 text-muted-foreground',
                                        pageCount <= 1 ? 'hidden' : ''
                                    )}
                                >
                                    <Button
                                        variant="outline"
                                        size="icon-xs"
                                        disabled={page <= 1 || loading}
                                        onClick={() => {
                                            const next = Math.max(1, page - 1)
                                            setPage(next)
                                            void loadData({ nextPage: next })
                                        }}
                                    >
                                        <ChevronLeft />
                                    </Button>
                                    <span>
                                        {page} / {pageCount}
                                    </span>
                                    <Button
                                        variant="outline"
                                        size="icon-xs"
                                        disabled={page >= pageCount || loading}
                                        onClick={() => {
                                            const next = Math.min(pageCount, page + 1)
                                            setPage(next)
                                            void loadData({ nextPage: next })
                                        }}
                                    >
                                        <ChevronRight />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </section>

                    <div
                        role="separator"
                        aria-label={t('resizePreview')}
                        aria-orientation="vertical"
                        tabIndex={0}
                        className="group flex cursor-col-resize items-stretch justify-center px-1 outline-none max-[760px]:hidden"
                        onPointerDown={handlePreviewResizeStart}
                        onKeyDown={handlePreviewResizeKeyDown}
                        onDoubleClick={resetPreviewWidth}
                    >
                        <span className="my-1 w-px rounded-full bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
                    </div>

                    <WorkbenchPreviewPanel
                        viewMode={viewMode}
                        graph={graph}
                        focusedGraphNode={focusedGraphNode}
                        focusedGraphNodeDetail={focusedGraphNodeDetail}
                        focusedGraphEdges={focusedGraphEdges}
                        graphLoading={graphLoading}
                        graphDetailLoading={graphDetailLoading}
                        preview={preview}
                        previewMode={previewMode}
                        selected={selected}
                        highlightedChunkId={highlightedChunkId}
                        onFocusGraphNode={(nodeId) => {
                            setFocusedGraphNodeId(nodeId)
                            setFocusedGraphNodeDetail(null)
                        }}
                        onFilterGraphEntityType={(type) => {
                            setFocusedGraphNodeId(null)
                            setFocusedGraphNodeDetail(null)
                            setGraphEntityType(type)
                        }}
                        onFilterGraphRelationType={(type) => {
                            setFocusedGraphNodeId(null)
                            setFocusedGraphNodeDetail(null)
                            setGraphRelationType(type)
                        }}
                        onOpenGraphEvidence={openGraphEvidence}
                        onPreviewModeChange={setPreviewMode}
                        onOpenOriginal={(row) => {
                            void openOriginal(row)
                        }}
                        onToggleDocument={toggleDocument}
                    />
                </section>

                <Dialog
                    open={createFolderDialogOpen}
                    onOpenChange={(open) => {
                        setCreateFolderDialogOpen(open)
                        if (!open) {
                            setFolderNameInput('')
                        }
                    }}
                >
                    <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                            <DialogTitle>{t('newFolder')}</DialogTitle>
                            <DialogDescription>{t('newFolderDescription')}</DialogDescription>
                        </DialogHeader>
                        <form
                            className="grid gap-4"
                            onSubmit={(event) => {
                                event.preventDefault()
                                void createFolder()
                            }}
                        >
                            <Input
                                autoFocus
                                value={folderNameInput}
                                placeholder={t('folderNamePlaceholder')}
                                onChange={(event) => setFolderNameInput(event.target.value)}
                            />
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="outline">
                                        {t('cancel')}
                                    </Button>
                                </DialogClose>
                                <Button type="submit" disabled={!folderNameInput.trim() || loading}>
                                    {t('create')}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </main>
        </TooltipProvider>
    )
}

function readStoredPreviewWidth() {
    if (typeof window === 'undefined') {
        return DEFAULT_PREVIEW_WIDTH_PERCENT
    }
    const stored = Number(window.localStorage?.getItem(PREVIEW_WIDTH_STORAGE_KEY))
    return Number.isFinite(stored) ? clampPreviewWidth(stored) : DEFAULT_PREVIEW_WIDTH_PERCENT
}

function storePreviewWidth(value: number) {
    if (typeof window === 'undefined') {
        return
    }
    window.localStorage?.setItem(PREVIEW_WIDTH_STORAGE_KEY, String(Math.round(clampPreviewWidth(value))))
}

function clampPreviewWidth(value: number, min = MIN_PREVIEW_WIDTH_PERCENT, max = MAX_PREVIEW_WIDTH_PERCENT) {
    return Math.min(Math.max(value, min), max)
}

function isNarrowWorkbenchViewport() {
    return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 760px)').matches
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
