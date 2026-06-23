import * as React from 'react'
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
import type { DocumentPreview, DocumentRow, GraphSummary, KnowledgebaseRow } from './types'
import { compact, extractCitationTarget, readError } from './utils'

declare const ReactDOM: any

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
    const [focusedGraphNodeId, setFocusedGraphNodeId] = React.useState<string | null>(null)
    const [highlightedChunkId, setHighlightedChunkId] = React.useState<string | null>(null)
    const [searchOpen, setSearchOpen] = React.useState(false)
    const [sortMode, setSortMode] = React.useState<'updated' | 'name'>('updated')
    const [createFolderDialogOpen, setCreateFolderDialogOpen] = React.useState(false)
    const [folderNameInput, setFolderNameInput] = React.useState('')
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
            options: { documentId?: string; nextPage?: number; nextParentId?: string | null; nextKbId?: string } = {}
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
                        documentId: options.documentId
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
        [ready, activeKnowledgebaseId, graphSearch, graphEntityType, focusedGraphNodeId]
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
    }, [viewMode, graphSupported, activeKnowledgebaseId, graphSearch, graphEntityType, focusedGraphNodeId])

    React.useEffect(() => {
        syncAssistantContext(activeKnowledgebaseId, selectedRows)
    }, [activeKnowledgebaseId, selectedIds])

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
        setFocusedGraphNodeId(null)
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
        await invokeClientCommand('workbench.file.open', {
            id: row.id,
            name: row.name || 'source-document',
            mimeType: row.mimeType || preview?.originalFile?.mimeType,
            size: typeof row.size === 'number' ? row.size : undefined,
            url,
            previewUrl: url
        })
    }

    const openKnowledgebaseDocuments = async () => {
        if (!activeKnowledgebaseId) {
            return
        }

        await invokeClientCommand('workbench.navigation.open', {
            target: 'knowledgebase.documents',
            knowledgebaseId: activeKnowledgebaseId
        })
    }

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
                                {activeKnowledgebase.documentNum ?? 0} {t('docs')} · {activeKnowledgebase.chunkNum ?? 0}{' '}
                                {t('totalChunks')}
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

                <section className="grid min-h-0 flex-1 grid-cols-[minmax(320px,0.54fr)_minmax(320px,0.46fr)] gap-3 max-[760px]:grid-cols-1 max-[760px]:grid-rows-[minmax(280px,1fr)_minmax(260px,0.8fr)]">
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
                                {viewMode === 'graph' && graph ? (
                                    <Badge variant="secondary" className="rounded-md">
                                        {graph.entityCount ?? graph.totalNodes ?? 0} {t('entities')} ·{' '}
                                        {graph.relationCount ?? graph.totalEdges ?? 0} {t('relations')}
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
                                                    setGraphSearch(event.target.value)
                                                }}
                                            />
                                        </div>
                                        <Select
                                            value={graphEntityType || '__all'}
                                            onValueChange={(value) => {
                                                setFocusedGraphNodeId(null)
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
                                        {focusedGraphNodeId ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 rounded-md px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                onClick={() => setFocusedGraphNodeId(null)}
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
                                focusedNodeId={focusedGraphNodeId}
                                onFocusNode={(nodeId) => setFocusedGraphNodeId(nodeId)}
                                onClearFocus={() => setFocusedGraphNodeId(null)}
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

                    <WorkbenchPreviewPanel
                        viewMode={viewMode}
                        graph={graph}
                        focusedGraphNode={focusedGraphNode}
                        focusedGraphEdges={focusedGraphEdges}
                        graphLoading={graphLoading}
                        preview={preview}
                        previewMode={previewMode}
                        selected={selected}
                        highlightedChunkId={highlightedChunkId}
                        onFocusGraphNode={(nodeId) => setFocusedGraphNodeId(nodeId)}
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

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
