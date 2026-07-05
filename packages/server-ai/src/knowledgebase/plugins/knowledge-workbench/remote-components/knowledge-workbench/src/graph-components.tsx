import * as React from 'react'
import cytoscape from 'cytoscape'
import { Badge, Button, CardContent, CardDescription, CardHeader, CardTitle, ScrollArea } from '@xpert-ai/shadcn-ui'
import { ExternalLink, Maximize2, Network, RotateCcw, Tags, ZoomIn, ZoomOut } from 'lucide-react'
import { t } from './i18n'
import type { GraphEdge, GraphEvidenceChunk, GraphNode, GraphNodeDetail, GraphSummary } from './types'
import { formatNumber, formatPercent } from './utils'

export function KnowledgeGraphPanel({
    graph,
    loading,
    searchTerm,
    focusedNodeId,
    onFocusNode,
    onClearFocus
}: {
    graph: GraphSummary | null
    loading: boolean
    searchTerm?: string
    focusedNodeId: string | null
    onFocusNode: (nodeId: string) => void
    onClearFocus: () => void
}) {
    const nodes = graph?.nodes ?? []
    const edges = graph?.edges ?? []
    const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null)
    const [showLabels, setShowLabels] = React.useState(true)
    const graphContainerRef = React.useRef<HTMLDivElement | null>(null)
    const cytoscapeRef = React.useRef<cytoscape.Core | null>(null)
    const onFocusNodeRef = React.useRef(onFocusNode)
    const onClearFocusRef = React.useRef(onClearFocus)
    const activeNodeId = hoveredNodeId ?? focusedNodeId
    const normalizedSearch = searchTerm?.trim().toLowerCase() ?? ''
    const nodeIdSet = React.useMemo(() => new Set(nodes.map((node) => node.id)), [nodes])
    const graphElements = React.useMemo(
        () => [
            ...nodes.map((node) => ({
                data: {
                    id: node.id,
                    label: node.name,
                    type: node.type,
                    searchHit:
                        normalizedSearch.length > 0 &&
                        `${node.name} ${node.type}`.toLowerCase().includes(normalizedSearch),
                    color: getGraphNodeColor(node.type),
                    size: Math.max(18, Math.min(42, 22 + Math.sqrt(node.mentionCount ?? node.value ?? 1) * 4))
                }
            })),
            ...edges
                .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
                .map((edge) => ({
                    data: {
                        id: edge.id,
                        source: edge.source,
                        target: edge.target,
                        label: edge.type,
                        weight: Math.max(0.75, Math.min(2.4, 0.8 + (edge.evidenceCount ?? 0) / 8))
                    }
                }))
        ],
        [edges, nodeIdSet, nodes, normalizedSearch]
    )
    const graphColors = React.useMemo(
        () => ({
            background: readCssColor('--background', '#ffffff'),
            foreground: readCssColor('--foreground', '#18181b'),
            mutedForeground: readCssColor('--muted-foreground', '#71717a'),
            border: readCssColor('--border', '#e4e4e7'),
            primary: readCssColor('--primary', '#0f766e'),
            fontFamily: readCssFontFamily()
        }),
        []
    )

    React.useEffect(() => {
        onFocusNodeRef.current = onFocusNode
        onClearFocusRef.current = onClearFocus
    }, [onClearFocus, onFocusNode])

    React.useEffect(() => {
        const container = graphContainerRef.current
        if (!container || !nodes.length) {
            return
        }

        const cy = cytoscape({
            container,
            elements: graphElements,
            wheelSensitivity: 0.18,
            minZoom: 0.22,
            maxZoom: 2.8,
            autoungrabify: false,
            style: [
                {
                    selector: 'node',
                    style: {
                        width: 'data(size)',
                        height: 'data(size)',
                        shape: 'ellipse',
                        'background-color': 'data(color)',
                        'border-width': 1.5,
                        'border-color': graphColors.background,
                        label: showLabels ? 'data(label)' : '',
                        color: graphColors.foreground,
                        'font-family': graphColors.fontFamily,
                        'font-size': 10,
                        'font-weight': 'normal',
                        'text-wrap': 'ellipsis',
                        'text-max-width': 104,
                        'text-valign': 'bottom',
                        'text-halign': 'center',
                        'text-margin-y': 7,
                        'text-outline-width': 0,
                        'text-opacity': 0.86,
                        'overlay-opacity': 0,
                        'transition-property':
                            'opacity, text-opacity, border-width, border-color, background-color, line-color, target-arrow-color',
                        'transition-duration': '120ms'
                    }
                },
                {
                    selector: 'node:selected, node.selected',
                    style: {
                        'border-color': graphColors.primary,
                        'border-width': 3
                    }
                },
                {
                    selector: 'node[searchHit]',
                    style: {
                        'border-color': graphColors.primary,
                        'border-width': 2.5,
                        'text-opacity': 1
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        width: 'data(weight)',
                        label: '',
                        color: graphColors.mutedForeground,
                        'font-family': graphColors.fontFamily,
                        'font-size': 9,
                        'font-weight': 'normal',
                        'line-color': graphColors.border,
                        'target-arrow-color': graphColors.border,
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'text-rotation': 'none',
                        'text-margin-y': -5,
                        'text-outline-width': 0,
                        'text-opacity': 0.72,
                        'overlay-opacity': 0,
                        'transition-property': 'opacity, text-opacity, line-color, target-arrow-color, width',
                        'transition-duration': '120ms'
                    }
                },
                {
                    selector: '.faded',
                    style: {
                        opacity: 0.18
                    }
                },
                {
                    selector: '.active-edge',
                    style: {
                        width: 2.4,
                        label: 'data(label)',
                        'line-color': graphColors.primary,
                        'target-arrow-color': graphColors.primary,
                        color: graphColors.foreground,
                        'text-opacity': 0.9
                    }
                },
                {
                    selector: '.active-node',
                    style: {
                        'border-color': graphColors.primary,
                        'text-opacity': 1
                    }
                }
            ] as any
        })

        cy.on('tap', 'node', (event) => {
            onFocusNodeRef.current(event.target.id())
        })
        cy.on('mouseover', 'node', (event) => {
            setHoveredNodeId(event.target.id())
            container.style.cursor = 'pointer'
        })
        cy.on('mouseout', 'node', () => {
            setHoveredNodeId(null)
            container.style.cursor = ''
        })
        cy.on('tap', (event) => {
            if (event.target === cy) {
                onClearFocusRef.current()
            }
        })

        cy.layout(getGraphLayoutOptions()).run()
        cytoscapeRef.current = cy

        const resizeObserver =
            typeof ResizeObserver === 'undefined'
                ? null
                : new ResizeObserver(() => {
                      cy.resize()
                      cy.fit(undefined, 36)
                  })
        resizeObserver?.observe(container)

        return () => {
            resizeObserver?.disconnect()
            cy.destroy()
            if (cytoscapeRef.current === cy) {
                cytoscapeRef.current = null
            }
        }
    }, [graphColors, graphElements, nodes.length, showLabels])

    React.useEffect(() => {
        const cy = cytoscapeRef.current
        if (!cy) {
            return
        }

        cy.batch(() => {
            cy.elements().removeClass('selected active-node active-edge faded')
            if (!activeNodeId) {
                return
            }

            const activeNode = cy.getElementById(activeNodeId)
            if (!activeNode.length) {
                return
            }

            const neighborhood = activeNode.closedNeighborhood()
            cy.elements().not(neighborhood).addClass('faded')
            activeNode.addClass('selected active-node')
            neighborhood.nodes().addClass('active-node')
            neighborhood.edges().addClass('active-edge')
        })
    }, [activeNodeId])

    React.useEffect(() => {
        const cy = cytoscapeRef.current
        if (!cy || !focusedNodeId) {
            return
        }

        const node = cy.getElementById(focusedNodeId)
        if (!node.length) {
            return
        }

        cy.animate(
            {
                fit: { eles: node.closedNeighborhood(), padding: 72 }
            },
            { duration: 220 }
        )
    }, [focusedNodeId])

    const fitGraph = React.useCallback(() => {
        cytoscapeRef.current?.animate({ fit: { padding: 48 } }, { duration: 180 })
    }, [])

    const resetLayout = React.useCallback(() => {
        const cy = cytoscapeRef.current
        if (!cy) {
            return
        }
        cy.layout(getGraphLayoutOptions()).run()
    }, [])

    const zoomGraph = React.useCallback((factor: number) => {
        const cy = cytoscapeRef.current
        if (!cy) {
            return
        }
        const nextZoom = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * factor))
        cy.animate(
            {
                zoom: nextZoom,
                center: { eles: cy.elements() }
            },
            { duration: 140 }
        )
    }, [])

    if (loading && !graph) {
        return <div className="grid min-h-0 flex-1 place-items-center text-muted-foreground">{t('loading')}</div>
    }
    if (graph?.unavailable) {
        return (
            <GraphEmptyState
                icon={<Network className="size-7" />}
                title={t('graphUnavailable')}
                description={graph.error || t('graphEmptyDescription')}
            />
        )
    }
    if (graph && !graph.enabled) {
        return (
            <GraphEmptyState
                icon={<Network className="size-7" />}
                title={t('graphDisabled')}
                description={t('graphEmptyDescription')}
            />
        )
    }
    if (!nodes.length) {
        return (
            <GraphEmptyState
                icon={<Network className="size-7" />}
                title={t('graphEmpty')}
                description={t('graphEmptyDescription')}
            />
        )
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <div className="flex min-h-8 flex-wrap items-center gap-2 text-xs text-muted-foreground/75">
                <Badge variant="secondary" className="rounded-md">
                    {graph?.status || 'ready'}
                </Badge>
                <span>
                    {formatNumber(graph?.entityCount ?? nodes.length)} {t('entities')}
                </span>
                <span className="text-border/80">|</span>
                <span>
                    {formatNumber(graph?.relationCount ?? edges.length)} {t('relations')}
                </span>
                <span className="text-border/80">|</span>
                <span>
                    {formatNumber(graph?.mentionCount ?? 0)} {t('mentions')}
                </span>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/20">
                <div ref={graphContainerRef} className="h-full min-h-[360px] w-full" />
                <div className="absolute left-3 top-3 flex items-center gap-1 rounded-md border bg-background/85 p-1 shadow-sm backdrop-blur">
                    <Button variant="ghost" size="icon-xs" title={t('fitGraph')} onClick={fitGraph}>
                        <Maximize2 className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" title={t('resetLayout')} onClick={resetLayout}>
                        <RotateCcw className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" title={t('zoomIn')} onClick={() => zoomGraph(1.18)}>
                        <ZoomIn className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" title={t('zoomOut')} onClick={() => zoomGraph(0.85)}>
                        <ZoomOut className="size-3.5" />
                    </Button>
                    <Button
                        variant={showLabels ? 'secondary' : 'ghost'}
                        size="icon-xs"
                        title={t('toggleLabels')}
                        onClick={() => setShowLabels((value) => !value)}
                    >
                        <Tags className="size-3.5" />
                    </Button>
                </div>
                {loading ? (
                    <div className="pointer-events-none absolute right-3 top-3 rounded-md border bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm">
                        {t('loading')}
                    </div>
                ) : null}
            </div>
        </div>
    )
}

export function KnowledgeGraphInspector({
    graph,
    node,
    detail,
    edges,
    loading,
    detailLoading,
    onFilterEntityType,
    onFilterRelationType,
    onOpenEvidence,
    onFocusNode
}: {
    graph: GraphSummary | null
    node: GraphNode | null
    detail: GraphNodeDetail | null
    edges: GraphEdge[]
    loading: boolean
    detailLoading: boolean
    onFilterEntityType: (type: string) => void
    onFilterRelationType: (type: string) => void
    onOpenEvidence: (chunk: GraphEvidenceChunk) => void
    onFocusNode: (nodeId: string) => void
}) {
    const headerNode = detail?.entity ?? node
    return (
        <>
            <CardHeader className="flex min-h-14 flex-row items-center justify-between gap-3 border-b px-3 py-2">
                <div className="grid min-w-0 gap-1">
                    <CardTitle className="truncate font-medium">{headerNode?.name || t('graph')}</CardTitle>
                    <CardDescription className="truncate">
                        {headerNode
                            ? `${headerNode.type} · ${formatNumber(headerNode.mentionCount ?? headerNode.value ?? 0)} ${t('mentions')}`
                            : `${formatNumber(graph?.entityCount ?? graph?.totalNodes ?? 0)} ${t('entities')} · ${formatNumber(graph?.relationCount ?? graph?.totalEdges ?? 0)} ${t('relations')}`}
                    </CardDescription>
                </div>
                <Network className="size-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-0">
                <ScrollArea className="h-full min-h-0">
                    <div className="grid gap-3 p-3">
                        {loading && !graph ? (
                            <div className="grid min-h-28 place-items-center text-muted-foreground">{t('loading')}</div>
                        ) : node ? (
                            <FocusedGraphNodeDetails
                                graph={graph}
                                node={node}
                                detail={detail}
                                edges={edges}
                                detailLoading={detailLoading}
                                onFocusNode={onFocusNode}
                                onOpenEvidence={onOpenEvidence}
                            />
                        ) : graph?.unavailable ? (
                            <GraphEmptyState
                                title={t('graphUnavailable')}
                                description={graph.error || t('graphEmptyDescription')}
                            />
                        ) : graph && !graph.enabled ? (
                            <GraphEmptyState title={t('graphDisabled')} description={t('graphEmptyDescription')} />
                        ) : (
                            <GraphOverview
                                graph={graph}
                                onFocusNode={onFocusNode}
                                onFilterEntityType={onFilterEntityType}
                                onFilterRelationType={onFilterRelationType}
                            />
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </>
    )
}

function GraphOverview({
    graph,
    onFocusNode,
    onFilterEntityType,
    onFilterRelationType
}: {
    graph: GraphSummary | null
    onFocusNode: (nodeId: string) => void
    onFilterEntityType: (type: string) => void
    onFilterRelationType: (type: string) => void
}) {
    if (!graph) {
        return <GraphEmptyState title={t('graph')} description={t('focusEntity')} />
    }

    const overview = buildGraphOverview(graph)
    return (
        <div className="grid gap-4">
            <section className="grid gap-2 border-b pb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-md">
                        {graph.status || 'ready'}
                    </Badge>
                    {graph.revision !== undefined && graph.revision !== null ? (
                        <Badge variant="outline" className="rounded-md">
                            {t('revision')} {formatNumber(graph.revision)}
                        </Badge>
                    ) : null}
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <GraphMetric label={t('entities')} value={graph.entityCount ?? graph.totalNodes ?? 0} />
                    <GraphMetric label={t('relations')} value={graph.relationCount ?? graph.totalEdges ?? 0} />
                    <GraphMetric label={t('mentions')} value={graph.mentionCount ?? 0} />
                </div>
                {graph.queuedJobCount || graph.runningJobCount || graph.failedJobCount ? (
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>
                            {t('queued')} {formatNumber(graph.queuedJobCount ?? 0)}
                        </span>
                        <span>
                            {t('running')} {formatNumber(graph.runningJobCount ?? 0)}
                        </span>
                        <span>
                            {t('failed')} {formatNumber(graph.failedJobCount ?? 0)}
                        </span>
                    </div>
                ) : null}
            </section>

            <DistributionList title={t('entityTypes')} items={overview.entityTypes} onSelect={onFilterEntityType} />
            <DistributionList
                title={t('relationTypes')}
                items={overview.relationTypes}
                onSelect={onFilterRelationType}
            />
            <section className="grid gap-2 border-b pb-3">
                <div className="text-sm font-medium">{t('topEntities')}</div>
                {overview.topEntities.length ? (
                    <div className="grid gap-1.5">
                        {overview.topEntities.map((item) => (
                            <button
                                key={item.node.id}
                                type="button"
                                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                                onClick={() => onFocusNode(item.node.id)}
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <span
                                        className="size-2.5 shrink-0 rounded-full"
                                        style={{ backgroundColor: getGraphNodeColor(item.node.type) }}
                                    />
                                    <span className="truncate font-medium">{item.node.name}</span>
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    {formatNumber(item.degree)} {t('degree')}
                                </span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground">{t('graphEmpty')}</div>
                )}
            </section>
            <section className="grid gap-2 text-sm text-muted-foreground">
                <div className="font-medium text-foreground">{t('graphLegend')}</div>
                <div>{t('nodeColorLegend')}</div>
                <div>{t('nodeSizeLegend')}</div>
                <div>{t('edgeWeightLegend')}</div>
            </section>
        </div>
    )
}

function FocusedGraphNodeDetails({
    graph,
    node,
    detail,
    edges,
    detailLoading,
    onFocusNode,
    onOpenEvidence
}: {
    graph: GraphSummary | null
    node: GraphNode
    detail: GraphNodeDetail | null
    edges: GraphEdge[]
    detailLoading: boolean
    onFocusNode: (nodeId: string) => void
    onOpenEvidence: (chunk: GraphEvidenceChunk) => void
}) {
    const entity = detail?.entity ?? node
    const displayEdges = detail ? detail.relations : edges
    const nodeById = new Map<string, GraphNode>(
        [...(graph?.nodes ?? []), ...(detail?.connectedEntities ?? []), entity].map((item) => [item.id, item])
    )
    const relationGroups = groupGraphRelations(displayEdges)
    const summaryText = entity.summary || entity.description

    return (
        <div className="grid gap-4">
            <section className="grid gap-2 border-b pb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-md">
                        {entity.type}
                    </Badge>
                    <Badge variant="outline" className="rounded-md">
                        {formatNumber(entity.mentionCount ?? entity.value ?? 0)} {t('mentions')}
                    </Badge>
                    <Badge variant="outline" className="rounded-md">
                        {formatNumber(displayEdges.length)} {t('degree')}
                    </Badge>
                    {typeof entity.confidence === 'number' ? (
                        <Badge variant="outline" className="rounded-md">
                            {t('confidence')} {formatPercent(entity.confidence)}
                        </Badge>
                    ) : null}
                    {detailLoading ? (
                        <Badge variant="outline" className="rounded-md">
                            {t('loading')}
                        </Badge>
                    ) : null}
                </div>
                <div className="break-words font-medium">{entity.name}</div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {entity.origin ? (
                        <span>
                            {t('origin')}: {entity.origin}
                        </span>
                    ) : null}
                    {entity.visibility ? (
                        <span>
                            {t('visibility')}: {entity.visibility}
                        </span>
                    ) : null}
                </div>
                {summaryText ? (
                    <p className="text-sm leading-6 text-muted-foreground">{summaryText}</p>
                ) : (
                    <p className="text-sm text-muted-foreground">{t('noEntityDescription')}</p>
                )}
                {detail?.entity.aliases?.length ? (
                    <div className="flex flex-wrap gap-1">
                        {detail.entity.aliases.map((alias) => (
                            <Badge key={alias} variant="outline" className="rounded-md">
                                {alias}
                            </Badge>
                        ))}
                    </div>
                ) : null}
            </section>

            <section className="grid gap-2 border-b pb-3">
                <div className="text-sm font-medium">{t('relations')}</div>
                {relationGroups.length ? (
                    <div className="grid gap-3">
                        {relationGroups.map((group) => (
                            <div key={group.type} className="grid gap-1.5">
                                <div className="text-xs font-medium text-muted-foreground">{group.type}</div>
                                {group.edges.map((edge) => {
                                    const other = getOtherGraphNode(edge, entity.id, nodeById)
                                    const otherName = getOtherGraphNodeName(edge, entity.id, other)
                                    return (
                                        <button
                                            key={edge.id}
                                            type="button"
                                            className="grid gap-1 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                                            onClick={() => other?.id && onFocusNode(other.id)}
                                        >
                                            <span className="truncate font-medium">{otherName}</span>
                                            <span className="truncate text-xs text-muted-foreground">
                                                {formatRelationDirection(edge, entity.id)} ·{' '}
                                                {formatNumber(edge.evidenceCount ?? 0)} {t('evidence')}
                                                {typeof edge.confidence === 'number'
                                                    ? ` · ${t('confidence')} ${formatPercent(edge.confidence)}`
                                                    : ''}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground">{t('noRelations')}</div>
                )}
            </section>

            <section className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">{t('graphEvidence')}</div>
                    {detail?.totals.chunks ? (
                        <span className="text-xs text-muted-foreground">
                            {formatNumber(detail.totals.chunks)} {t('chunks')}
                        </span>
                    ) : null}
                </div>
                {detailLoading && !detail ? (
                    <div className="grid min-h-20 place-items-center text-muted-foreground">{t('loading')}</div>
                ) : detail?.chunks.length ? (
                    <div className="divide-y">
                        {detail.chunks.map((chunk) => (
                            <GraphEvidenceChunkItem
                                key={chunk.chunkId ?? chunk.index}
                                chunk={chunk}
                                onOpen={onOpenEvidence}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground">{t('noEvidence')}</div>
                )}
            </section>
        </div>
    )
}

function GraphMetric({ label, value }: { label: string; value: number }) {
    return (
        <div className="grid gap-1 rounded-md bg-muted/40 px-2 py-2">
            <span className="text-base font-semibold">{formatNumber(value)}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
        </div>
    )
}

function DistributionList({
    title,
    items,
    onSelect
}: {
    title: string
    items: Array<{ label: string; count: number }>
    onSelect: (value: string) => void
}) {
    return (
        <section className="grid gap-2 border-b pb-3">
            <div className="text-sm font-medium">{title}</div>
            {items.length ? (
                <div className="grid gap-1.5">
                    {items.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                            onClick={() => onSelect(item.label)}
                        >
                            <span className="min-w-0 truncate">{item.label}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{formatNumber(item.count)}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="text-sm text-muted-foreground">{t('graphEmpty')}</div>
            )}
        </section>
    )
}

function GraphEvidenceChunkItem({
    chunk,
    onOpen
}: {
    chunk: GraphEvidenceChunk
    onOpen: (chunk: GraphEvidenceChunk) => void
}) {
    return (
        <div className="grid gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{formatGraphChunkLabel(chunk)}</div>
                    <div className="truncate text-xs text-muted-foreground">
                        {chunk.documentName || chunk.documentId || t('document')}
                        {chunk.page !== undefined && chunk.page !== null ? ` · ${t('page')} ${chunk.page}` : ''}
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={!chunk.documentId}
                    onClick={() => onOpen(chunk)}
                >
                    <ExternalLink className="size-3.5" />
                    {t('openEvidence')}
                </Button>
            </div>
            <p className="max-h-24 overflow-hidden text-sm leading-6 text-muted-foreground">
                {chunk.snippet || chunk.pageContent}
            </p>
            {chunk.evidence.length ? (
                <div className="grid gap-1 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                    {chunk.evidence.slice(0, 3).map((mention, index) => (
                        <div key={mention.id ?? index}>
                            {mention.quote || t('evidence')}
                            {typeof mention.confidence === 'number'
                                ? ` · ${t('confidence')} ${formatPercent(mention.confidence)}`
                                : ''}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    )
}

function buildGraphOverview(graph: GraphSummary) {
    const degreeByNodeId = new Map<string, number>()
    for (const edge of graph.edges ?? []) {
        degreeByNodeId.set(edge.source, (degreeByNodeId.get(edge.source) ?? 0) + 1)
        degreeByNodeId.set(edge.target, (degreeByNodeId.get(edge.target) ?? 0) + 1)
    }

    return {
        entityTypes: countBy((graph.nodes ?? []).map((node) => node.type)),
        relationTypes: countBy((graph.edges ?? []).map((edge) => edge.type)),
        topEntities: [...(graph.nodes ?? [])]
            .map((node) => ({
                node,
                degree: degreeByNodeId.get(node.id) ?? 0,
                score: (degreeByNodeId.get(node.id) ?? 0) * 2 + (node.mentionCount ?? node.value ?? 0)
            }))
            .sort((left, right) => right.score - left.score || left.node.name.localeCompare(right.node.name))
            .slice(0, 6)
    }
}

function countBy(values: string[]) {
    const counts = new Map<string, number>()
    for (const value of values) {
        if (value) {
            counts.set(value, (counts.get(value) ?? 0) + 1)
        }
    }
    return Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
        .slice(0, 8)
}

function groupGraphRelations(edges: Array<GraphEdge & { confidence?: number | null }>) {
    const groups = new Map<string, Array<GraphEdge & { confidence?: number | null }>>()
    for (const edge of edges) {
        const group = groups.get(edge.type) ?? []
        group.push(edge)
        groups.set(edge.type, group)
    }
    return Array.from(groups.entries())
        .map(([type, groupedEdges]) => ({
            type,
            edges: groupedEdges.sort(
                (left, right) =>
                    (right.evidenceCount ?? 0) - (left.evidenceCount ?? 0) || left.id.localeCompare(right.id)
            )
        }))
        .sort((left, right) => right.edges.length - left.edges.length || left.type.localeCompare(right.type))
}

function getOtherGraphNode(edge: GraphEdge, nodeId: string, nodeById: Map<string, GraphNode>) {
    const otherId = edge.source === nodeId ? edge.target : edge.source
    return nodeById.get(otherId)
}

function getOtherGraphNodeName(
    edge: GraphEdge & { sourceName?: string; targetName?: string },
    nodeId: string,
    other?: GraphNode
) {
    if (other?.name) {
        return other.name
    }
    return edge.source === nodeId ? edge.targetName || edge.target : edge.sourceName || edge.source || edge.type
}

function formatRelationDirection(edge: GraphEdge, nodeId: string) {
    if (edge.source === nodeId) {
        return t('outgoing')
    }
    if (edge.target === nodeId) {
        return t('incoming')
    }
    return t('relation')
}

function formatGraphChunkLabel(chunk: GraphEvidenceChunk) {
    const sequence = Number.isFinite(chunk.chunkIndex) ? chunk.chunkIndex : chunk.index
    return `${t('chunks')} ${sequence}`
}

function GraphEmptyState({
    icon,
    title,
    description
}: {
    icon?: React.ReactNode
    title: string
    description?: string
}) {
    return (
        <div className="grid min-h-0 flex-1 place-items-center p-5 text-center text-muted-foreground">
            <div className="grid max-w-sm gap-2 justify-items-center">
                {icon ? <div className="text-muted-foreground/65">{icon}</div> : null}
                <div className="font-medium text-foreground">{title}</div>
                {description ? <p className="text-xs text-muted-foreground/70">{description}</p> : null}
            </div>
        </div>
    )
}

function getGraphNodeColor(type: string) {
    const palette = ['#14b8a6', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#64748b', '#06b6d4', '#84cc16']
    let hash = 0
    for (const char of type || 'entity') {
        hash = (hash * 31 + char.charCodeAt(0)) % palette.length
    }
    return palette[Math.abs(hash) % palette.length]
}

function getGraphLayoutOptions() {
    return {
        name: 'cose',
        fit: true,
        padding: 36,
        animate: true,
        animationDuration: 420,
        randomize: false,
        nodeRepulsion: 6500,
        nodeOverlap: 14,
        idealEdgeLength: 92,
        edgeElasticity: 120,
        nestingFactor: 1.1,
        gravity: 0.28,
        numIter: 1100
    }
}

function readCssColor(variableName: string, fallback: string) {
    if (typeof document === 'undefined') {
        return fallback
    }

    const probe = document.createElement('span')
    probe.style.color = `var(${variableName})`
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    probe.style.pointerEvents = 'none'
    const colorHost = document.body || document.documentElement
    colorHost.appendChild(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color && color !== 'canvastext' ? color : fallback
}

function readCssFontFamily() {
    if (typeof document === 'undefined') {
        return 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }

    const computed = getComputedStyle(document.body || document.documentElement)
    return (
        computed.getPropertyValue('--font-sans').trim() ||
        computed.fontFamily ||
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    )
}
