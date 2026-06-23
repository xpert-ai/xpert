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
import { Check, ExternalLink, FileText } from 'lucide-react'
import { MarkdownPreview } from './document-components'
import { KnowledgeGraphInspector } from './graph-components'
import { t } from './i18n'
import type { DocumentPreview, DocumentRow, GraphEdge, GraphNode, GraphSummary } from './types'

export function WorkbenchPreviewPanel({
    viewMode,
    graph,
    focusedGraphNode,
    focusedGraphEdges,
    graphLoading,
    preview,
    previewMode,
    selected,
    highlightedChunkId,
    onFocusGraphNode,
    onPreviewModeChange,
    onOpenOriginal,
    onToggleDocument
}: {
    viewMode: 'documents' | 'graph'
    graph: GraphSummary | null
    focusedGraphNode: GraphNode | null
    focusedGraphEdges: GraphEdge[]
    graphLoading: boolean
    preview: DocumentPreview | null
    previewMode: 'markdown' | 'text'
    selected: Record<string, DocumentRow>
    highlightedChunkId: string | null
    onFocusGraphNode: (nodeId: string) => void
    onPreviewModeChange: (mode: 'markdown' | 'text') => void
    onOpenOriginal: (row: DocumentRow) => void
    onToggleDocument: (row: DocumentRow) => void
}) {
    const previewChunks = preview ? (preview.chunks?.length ? preview.chunks : (preview.transformedPreview ?? [])) : []
    const chunkRefs = React.useRef<Record<string, HTMLElement | null>>({})
    const previewChunkIds = previewChunks.map((chunk, index) => chunk.chunkId || chunk.id || String(index)).join('|')

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
    }, [highlightedChunkId, preview?.document.id, previewChunkIds])

    return (
        <Card className="min-h-0 gap-0 overflow-hidden rounded-lg py-0">
            {viewMode === 'graph' ? (
                <KnowledgeGraphInspector
                    graph={graph}
                    node={focusedGraphNode}
                    edges={focusedGraphEdges}
                    loading={graphLoading}
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
                                {previewChunks.map((chunk, index) => (
                                    <article
                                        key={chunk.chunkId || chunk.id || index}
                                        ref={(node) => {
                                            const ids = [chunk.chunkId, chunk.id].filter((id): id is string => !!id)
                                            for (const id of ids) {
                                                if (node) {
                                                    chunkRefs.current[id] = node
                                                } else {
                                                    delete chunkRefs.current[id]
                                                }
                                            }
                                        }}
                                        data-chunk-id={chunk.chunkId || chunk.id}
                                        className={
                                            chunk.chunkId && highlightedChunkId === chunk.chunkId
                                                ? 'scroll-mt-3 rounded-lg border border-primary bg-primary/10'
                                                : 'scroll-mt-3 rounded-lg border bg-muted/30'
                                        }
                                    >
                                        <header className="flex items-center justify-between gap-2 border-b px-3 py-2 font-medium">
                                            <span>
                                                {t('chunks')} {index + 1}
                                            </span>
                                            {chunk.chunkId ? (
                                                <span className="truncate text-muted-foreground">{chunk.chunkId}</span>
                                            ) : null}
                                        </header>
                                        <div className="px-3 py-2">
                                            {previewMode === 'markdown' ? (
                                                <MarkdownPreview value={chunk.pageContent || ''} />
                                            ) : (
                                                <pre className="whitespace-pre-wrap break-words font-sans">
                                                    {chunk.pageContent || ''}
                                                </pre>
                                            )}
                                        </div>
                                    </article>
                                ))}
                                {!previewChunks.length ? (
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
