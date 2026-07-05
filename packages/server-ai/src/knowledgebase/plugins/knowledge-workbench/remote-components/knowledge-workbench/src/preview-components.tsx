import * as React from 'react'
import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    ScrollArea,
    Tabs,
    TabsList,
    TabsTrigger
} from '@xpert-ai/shadcn-ui'
import { Check, ChevronRight, ExternalLink, FileText } from 'lucide-react'
import { MarkdownPreview } from './document-components'
import { KnowledgeGraphInspector } from './graph-components'
import { t } from './i18n'
import type {
    ChunkPreview,
    DocumentPreview,
    DocumentRow,
    GraphEdge,
    GraphEvidenceChunk,
    GraphNode,
    GraphNodeDetail,
    GraphSummary
} from './types'

type PreviewChunkNode = {
    chunk: ChunkPreview
    index: number
    sequence: number
    id: string
    children: PreviewChunkNode[]
}

export function WorkbenchPreviewPanel({
    viewMode,
    graph,
    focusedGraphNode,
    focusedGraphNodeDetail,
    focusedGraphEdges,
    graphLoading,
    graphDetailLoading,
    preview,
    previewMode,
    selected,
    highlightedChunkId,
    onFocusGraphNode,
    onFilterGraphEntityType,
    onFilterGraphRelationType,
    onOpenGraphEvidence,
    onPreviewModeChange,
    onOpenOriginal,
    onToggleDocument
}: {
    viewMode: 'documents' | 'graph'
    graph: GraphSummary | null
    focusedGraphNode: GraphNode | null
    focusedGraphNodeDetail: GraphNodeDetail | null
    focusedGraphEdges: GraphEdge[]
    graphLoading: boolean
    graphDetailLoading: boolean
    preview: DocumentPreview | null
    previewMode: 'markdown' | 'text'
    selected: Record<string, DocumentRow>
    highlightedChunkId: string | null
    onFocusGraphNode: (nodeId: string) => void
    onFilterGraphEntityType: (type: string) => void
    onFilterGraphRelationType: (type: string) => void
    onOpenGraphEvidence: (chunk: GraphEvidenceChunk) => void
    onPreviewModeChange: (mode: 'markdown' | 'text') => void
    onOpenOriginal: (row: DocumentRow) => void
    onToggleDocument: (row: DocumentRow) => void
}) {
    const previewChunkTree = React.useMemo(
        () =>
            preview
                ? buildPreviewChunkTree(preview.chunks?.length ? preview.chunks : (preview.transformedPreview ?? []))
                : [],
        [preview]
    )
    const [expandedChunkIds, setExpandedChunkIds] = React.useState<Record<string, boolean>>({})
    const chunkRefs = React.useRef<Record<string, HTMLElement | null>>({})
    const previewChunkIds = React.useMemo(
        () =>
            flattenPreviewChunkNodes(previewChunkTree)
                .map((node) => node.id)
                .join('|'),
        [previewChunkTree]
    )
    const highlightedAncestorIds = React.useMemo(
        () => (highlightedChunkId ? findChunkAncestorIds(previewChunkTree, highlightedChunkId) : []),
        [highlightedChunkId, previewChunkTree]
    )
    const expandedChunkKey = React.useMemo(
        () =>
            Object.entries(expandedChunkIds)
                .filter(([, expanded]) => expanded)
                .map(([id]) => id)
                .sort()
                .join('|'),
        [expandedChunkIds]
    )

    React.useEffect(() => {
        setExpandedChunkIds({})
    }, [preview?.document.id])

    React.useEffect(() => {
        if (!highlightedChunkId || !highlightedAncestorIds.length) {
            return
        }

        setExpandedChunkIds((current) => {
            let changed = false
            const next = { ...current }
            for (const ancestorId of highlightedAncestorIds) {
                if (!next[ancestorId]) {
                    next[ancestorId] = true
                    changed = true
                }
            }
            return changed ? next : current
        })
    }, [highlightedChunkId, highlightedAncestorIds])

    React.useEffect(() => {
        if (!highlightedChunkId) {
            return
        }

        const frame = window.requestAnimationFrame(() => {
            chunkRefs.current[highlightedChunkId]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            })
        })

        return () => window.cancelAnimationFrame(frame)
    }, [expandedChunkKey, highlightedChunkId, preview?.document.id, previewChunkIds])

    const handleToggleChunkExpanded = React.useCallback((chunkNodeId: string) => {
        setExpandedChunkIds((current) => ({
            ...current,
            [chunkNodeId]: !current[chunkNodeId]
        }))
    }, [])

    const registerChunkRef = React.useCallback((chunk: ChunkPreview, node: HTMLElement | null) => {
        const ids = getPreviewChunkIds(chunk)
        for (const id of ids) {
            if (node) {
                chunkRefs.current[id] = node
            } else {
                delete chunkRefs.current[id]
            }
        }
    }, [])

    return (
        <Card className="min-h-0 gap-0 overflow-hidden rounded-lg py-0">
            {viewMode === 'graph' ? (
                <KnowledgeGraphInspector
                    graph={graph}
                    node={focusedGraphNode}
                    detail={focusedGraphNodeDetail}
                    edges={focusedGraphEdges}
                    loading={graphLoading}
                    detailLoading={graphDetailLoading}
                    onFilterEntityType={onFilterGraphEntityType}
                    onFilterRelationType={onFilterGraphRelationType}
                    onOpenEvidence={onOpenGraphEvidence}
                    onFocusNode={onFocusGraphNode}
                />
            ) : preview ? (
                <>
                    <CardHeader className="flex min-h-14 flex-row items-center justify-between gap-3 border-b px-3 !pb-0 pt-2">
                        <div className="grid min-w-0 gap-1">
                            <CardTitle className="truncate font-medium">
                                {preview.document.name || preview.document.id}
                            </CardTitle>
                            <CardDescription className="truncate">
                                {preview.document.type || preview.document.mimeType || t('document')}
                            </CardDescription>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <Tabs
                                value={previewMode}
                                onValueChange={(value) => onPreviewModeChange(value === 'text' ? 'text' : 'markdown')}
                            >
                                <TabsList className="h-9 rounded-full bg-muted/70 p-1">
                                    <TabsTrigger value="markdown" className="rounded-full px-3">
                                        {t('markdown')}
                                    </TabsTrigger>
                                    <TabsTrigger value="text" className="rounded-full px-3">
                                        {t('rawText')}
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                            {preview.document.fileUrl ? (
                                <Button variant="outline" size="sm" onClick={() => onOpenOriginal(preview.document)}>
                                    <ExternalLink />
                                    {t('open')}
                                </Button>
                            ) : null}
                            {!preview.document.isFolder ? (
                                <Button
                                    variant={selected[preview.document.id] ? 'secondary' : 'outline'}
                                    size="icon-sm"
                                    onClick={() => onToggleDocument(preview.document)}
                                >
                                    {selected[preview.document.id] ? <Check /> : <FileText />}
                                </Button>
                            ) : null}
                        </div>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1 p-0">
                        <ScrollArea className="h-full min-h-0">
                            <div className="space-y-2 p-3">
                                {previewChunkTree.map((node) => (
                                    <PreviewChunkArticle
                                        key={node.id}
                                        node={node}
                                        previewMode={previewMode}
                                        highlightedChunkId={highlightedChunkId}
                                        expandedChunkIds={expandedChunkIds}
                                        onToggleChunkExpanded={handleToggleChunkExpanded}
                                        registerChunkRef={registerChunkRef}
                                    />
                                ))}
                                {!previewChunkTree.length ? (
                                    <div className="grid min-h-28 place-items-center text-muted-foreground">
                                        {t('preview')}
                                    </div>
                                ) : null}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </>
            ) : (
                <div className="grid min-h-full place-items-center text-muted-foreground">{t('preview')}</div>
            )}
        </Card>
    )
}

function PreviewChunkArticle({
    node,
    previewMode,
    highlightedChunkId,
    expandedChunkIds,
    onToggleChunkExpanded,
    registerChunkRef
}: {
    node: PreviewChunkNode
    previewMode: 'markdown' | 'text'
    highlightedChunkId: string | null
    expandedChunkIds: Record<string, boolean>
    onToggleChunkExpanded: (chunkNodeId: string) => void
    registerChunkRef: (chunk: ChunkPreview, node: HTMLElement | null) => void
}) {
    const highlighted = isChunkHighlighted(node.chunk, highlightedChunkId)
    const headerDetails = getChunkHeaderDetails(node.chunk)

    return (
        <article
            ref={(element) => registerChunkRef(node.chunk, element)}
            data-chunk-id={node.chunk.chunkId || node.chunk.id}
            className={
                highlighted
                    ? 'scroll-mt-3 rounded-lg border border-primary bg-primary/10'
                    : 'scroll-mt-3 rounded-lg border bg-muted/30'
            }
        >
            <header className="flex items-center justify-between gap-2 border-b px-3 py-2 font-medium">
                <span>
                    {t('chunks')} {node.sequence}
                </span>
                {headerDetails ? (
                    <span className="truncate text-muted-foreground" title={headerDetails}>
                        {headerDetails}
                    </span>
                ) : null}
            </header>
            <ChunkPreviewContent chunk={node.chunk} previewMode={previewMode} className="px-3 py-2" />
            {node.children.length ? (
                <ChunkChildren
                    node={node}
                    previewMode={previewMode}
                    highlightedChunkId={highlightedChunkId}
                    expandedChunkIds={expandedChunkIds}
                    onToggleChunkExpanded={onToggleChunkExpanded}
                    registerChunkRef={registerChunkRef}
                />
            ) : null}
        </article>
    )
}

function ChunkChildren({
    node,
    previewMode,
    highlightedChunkId,
    expandedChunkIds,
    onToggleChunkExpanded,
    registerChunkRef
}: {
    node: PreviewChunkNode
    previewMode: 'markdown' | 'text'
    highlightedChunkId: string | null
    expandedChunkIds: Record<string, boolean>
    onToggleChunkExpanded: (chunkNodeId: string) => void
    registerChunkRef: (chunk: ChunkPreview, node: HTMLElement | null) => void
}) {
    const expanded = expandedChunkIds[node.id] === true
    const childrenId = `chunk-children-${node.index}`

    return (
        <div className="border-t px-3 py-2">
            <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-muted-foreground hover:bg-muted"
                aria-expanded={expanded}
                aria-controls={childrenId}
                onClick={() => onToggleChunkExpanded(node.id)}
            >
                <ChevronRight
                    className={
                        expanded
                            ? 'size-4 shrink-0 rotate-90 transition-transform'
                            : 'size-4 shrink-0 transition-transform'
                    }
                />
                <span>
                    {node.children.length} {t('childChunks')}
                </span>
            </button>
            {expanded ? (
                <div id={childrenId} className="mt-2 space-y-2 border-l-2 border-border pl-3">
                    {node.children.map((child, index) => (
                        <PreviewChildChunk
                            key={child.id}
                            node={child}
                            childIndex={index}
                            previewMode={previewMode}
                            highlightedChunkId={highlightedChunkId}
                            expandedChunkIds={expandedChunkIds}
                            onToggleChunkExpanded={onToggleChunkExpanded}
                            registerChunkRef={registerChunkRef}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    )
}

function PreviewChildChunk({
    node,
    childIndex,
    previewMode,
    highlightedChunkId,
    expandedChunkIds,
    onToggleChunkExpanded,
    registerChunkRef
}: {
    node: PreviewChunkNode
    childIndex: number
    previewMode: 'markdown' | 'text'
    highlightedChunkId: string | null
    expandedChunkIds: Record<string, boolean>
    onToggleChunkExpanded: (chunkNodeId: string) => void
    registerChunkRef: (chunk: ChunkPreview, node: HTMLElement | null) => void
}) {
    const highlighted = isChunkHighlighted(node.chunk, highlightedChunkId)
    const headerDetails = getChunkHeaderDetails(node.chunk)

    return (
        <div
            ref={(element) => registerChunkRef(node.chunk, element)}
            data-chunk-id={node.chunk.chunkId || node.chunk.id}
            className={
                highlighted
                    ? 'scroll-mt-3 rounded-md bg-primary/10 ring-1 ring-primary'
                    : 'scroll-mt-3 rounded-md bg-background/70'
            }
        >
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm font-medium">
                <span className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        C-{childIndex + 1}
                    </span>
                    <span>
                        {t('chunks')} {node.sequence}
                    </span>
                </span>
                {headerDetails ? (
                    <span className="truncate text-muted-foreground" title={headerDetails}>
                        {headerDetails}
                    </span>
                ) : null}
            </div>
            <ChunkPreviewContent chunk={node.chunk} previewMode={previewMode} className="px-2 pb-2" />
            {node.children.length ? (
                <div className="px-2 pb-2">
                    <ChunkChildren
                        node={node}
                        previewMode={previewMode}
                        highlightedChunkId={highlightedChunkId}
                        expandedChunkIds={expandedChunkIds}
                        onToggleChunkExpanded={onToggleChunkExpanded}
                        registerChunkRef={registerChunkRef}
                    />
                </div>
            ) : null}
        </div>
    )
}

function ChunkPreviewContent({
    chunk,
    previewMode,
    className
}: {
    chunk: ChunkPreview
    previewMode: 'markdown' | 'text'
    className: string
}) {
    return (
        <div className={className}>
            {previewMode === 'markdown' ? (
                <MarkdownPreview value={chunk.pageContent || ''} />
            ) : (
                <pre className="whitespace-pre-wrap break-words font-sans">{chunk.pageContent || ''}</pre>
            )}
        </div>
    )
}

function getChunkHeaderDetails(chunk: ChunkPreview) {
    const metadata = getMetadataRecord(chunk.metadata)
    const parts: string[] = []
    const pages = getChunkPageValues(chunk, metadata)
    const lines = getChunkLineRange(metadata)
    const image = getChunkImageLabel(metadata)

    if (pages.length) {
        parts.push(`${t('chunkPage')} ${pages.join(', ')}`)
    }
    if (lines) {
        parts.push(`${t('chunkLines')} ${lines}`)
    }
    if (image) {
        parts.push(image)
    }

    const chunkIndex = getChunkIndex(chunk)
    if (!parts.length && Number.isFinite(chunkIndex)) {
        parts.push(`${t('chunkIndex')} ${chunkIndex}`)
    }

    return parts.join(' · ')
}

function getChunkPageValues(chunk: ChunkPreview, metadata: Record<string, unknown> | undefined) {
    const values: string[] = []

    collectDisplayValues(chunk.page, values)
    collectDisplayValues(metadata?.page, values)
    collectDisplayValues(metadata?.pageNumber, values)
    collectDisplayValues(metadata?.pageNo, values)

    const loc = getMetadataRecord(metadata?.loc)
    collectDisplayValues(loc?.page, values)
    collectDisplayValues(loc?.pageNumber, values)

    // Parent chunks often store page-bearing image assets while VLM children store page directly.
    const assets = Array.isArray(metadata?.assets) ? metadata.assets : []
    for (const asset of assets) {
        collectDisplayValues(getMetadataRecord(asset)?.page, values)
    }

    return Array.from(new Set(values))
}

function getChunkLineRange(metadata: Record<string, unknown> | undefined) {
    const loc = getMetadataRecord(metadata?.loc)
    const lines = getMetadataRecord(loc?.lines)
    const from = getDisplayValue(lines?.from ?? metadata?.lineFrom ?? metadata?.startLine)
    const to = getDisplayValue(lines?.to ?? metadata?.lineTo ?? metadata?.endLine)

    if (from && to && from !== to) {
        return `${from}-${to}`
    }
    return from ?? to
}

function getChunkImageLabel(metadata: Record<string, unknown> | undefined) {
    const mediaType = getStringValue(metadata?.mediaType)?.toLowerCase()
    const sourceType = getStringValue(metadata?.sourceType)?.toLowerCase()
    const hasImage =
        mediaType === 'image' ||
        sourceType?.includes('image') ||
        Boolean(getStringValue(metadata?.imageUrl) || getStringValue(metadata?.imagePath))

    if (!hasImage) {
        return undefined
    }

    const order = getDisplayValue(metadata?.order)
    return order ? `${t('chunkImage')} ${order}` : t('chunkImage')
}

function collectDisplayValues(value: unknown, result: string[]) {
    if (Array.isArray(value)) {
        value.forEach((item) => collectDisplayValues(item, result))
        return
    }

    const normalized = getDisplayValue(value)
    if (normalized) {
        result.push(normalized)
    }
}

function getDisplayValue(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value)
    }
    if (typeof value === 'string' && value.trim()) {
        return value.trim()
    }
    return undefined
}

function buildPreviewChunkTree(chunks: ChunkPreview[]): PreviewChunkNode[] {
    const sortedNodes: PreviewChunkNode[] = sortPreviewChunks(chunks).map(({ chunk, index, sequence }) => ({
        chunk,
        index,
        sequence,
        id: getPreviewChunkNodeId(chunk, index),
        children: []
    }))
    const byChunkId = new Map<string, PreviewChunkNode>()
    for (const node of sortedNodes) {
        for (const id of getPreviewChunkIds(node.chunk)) {
            if (!byChunkId.has(id)) {
                byChunkId.set(id, node)
            }
        }
    }

    const roots: PreviewChunkNode[] = []
    for (const node of sortedNodes) {
        const parentId = getPreviewChunkParentId(node.chunk)
        const parent = parentId ? byChunkId.get(parentId) : undefined
        if (parent && parent !== node) {
            parent.children.push(node)
        } else {
            // A highlighted or paged-in child may arrive without its parent; keep it visible as a root.
            roots.push(node)
        }
    }

    return roots
}

function sortPreviewChunks<T extends { chunkIndex?: number; metadata?: unknown }>(chunks: T[]) {
    // Display the stored chunkIndex itself; only older chunks without chunkIndex fall back to API order.
    return chunks
        .map((chunk, index) => {
            const chunkIndex = getChunkIndex(chunk)
            return {
                chunk,
                index,
                sequence: Number.isFinite(chunkIndex) ? chunkIndex : index + 1
            }
        })
        .sort((left, right) => {
            const leftIndex = getChunkIndex(left.chunk)
            const rightIndex = getChunkIndex(right.chunk)
            if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex) && leftIndex !== rightIndex) {
                return leftIndex - rightIndex
            }
            if (Number.isFinite(leftIndex) !== Number.isFinite(rightIndex)) {
                return Number.isFinite(leftIndex) ? -1 : 1
            }
            return left.index - right.index
        })
}

function getChunkIndex(chunk: { chunkIndex?: number; metadata?: unknown }) {
    if (Number.isFinite(chunk.chunkIndex)) {
        return chunk.chunkIndex
    }
    const metadata = chunk.metadata
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        const value = (metadata as Record<string, unknown>).chunkIndex
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value
        }
    }
    return undefined
}

function flattenPreviewChunkNodes(nodes: PreviewChunkNode[]) {
    const result: PreviewChunkNode[] = []
    const visit = (node: PreviewChunkNode) => {
        result.push(node)
        node.children.forEach(visit)
    }
    nodes.forEach(visit)
    return result
}

function findChunkAncestorIds(nodes: PreviewChunkNode[], targetChunkId: string, ancestors: string[] = []): string[] {
    for (const node of nodes) {
        if (getPreviewChunkIds(node.chunk).includes(targetChunkId)) {
            return ancestors
        }
        const childAncestors = findChunkAncestorIds(node.children, targetChunkId, [...ancestors, node.id])
        if (childAncestors.length) {
            return childAncestors
        }
    }
    return []
}

function isChunkHighlighted(chunk: ChunkPreview, highlightedChunkId: string | null) {
    return highlightedChunkId ? getPreviewChunkIds(chunk).includes(highlightedChunkId) : false
}

function getPreviewChunkNodeId(chunk: ChunkPreview, index: number) {
    return chunk.chunkId || chunk.id || `preview-chunk-${index}`
}

function getPreviewChunkIds(chunk: ChunkPreview) {
    const ids = [chunk.chunkId, chunk.id].map(getStringValue).filter((id): id is string => Boolean(id))
    return Array.from(new Set(ids))
}

function getPreviewChunkParentId(chunk: ChunkPreview) {
    // Prefer the explicit DTO field, while remaining compatible with existing metadata-only chunks.
    return getStringValue(chunk.parentId) ?? getMetadataStringField(chunk.metadata, 'parentId')
}

function getMetadataStringField(metadata: unknown, key: string) {
    return getStringValue(getMetadataRecord(metadata)?.[key])
}

function getMetadataRecord(metadata: unknown) {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
        return metadata as Record<string, unknown>
    }
    return undefined
}

function getStringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
