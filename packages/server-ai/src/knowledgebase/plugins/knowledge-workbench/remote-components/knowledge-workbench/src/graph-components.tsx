import * as React from 'react'
import cytoscape from 'cytoscape'
import { Badge, CardContent, CardDescription, CardHeader, CardTitle, ScrollArea } from '@xpert-ai/shadcn-ui'
import { Network } from 'lucide-react'
import { t } from './i18n'
import type { GraphEdge, GraphNode, GraphSummary } from './types'
import { formatNumber, formatPercent } from './utils'

export function KnowledgeGraphPanel({
    graph,
    loading,
    focusedNodeId,
    onFocusNode,
    onClearFocus
}: {
    graph: GraphSummary | null
    loading: boolean
    focusedNodeId: string | null
    onFocusNode: (nodeId: string) => void
    onClearFocus: () => void
}) {
    const nodes = graph?.nodes ?? []
    const edges = graph?.edges ?? []
    const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null)
    const graphContainerRef = React.useRef<HTMLDivElement | null>(null)
    const cytoscapeRef = React.useRef<cytoscape.Core | null>(null)
    const onFocusNodeRef = React.useRef(onFocusNode)
    const onClearFocusRef = React.useRef(onClearFocus)
    const activeNodeId = hoveredNodeId ?? focusedNodeId
    const nodeIdSet = React.useMemo(() => new Set(nodes.map((node) => node.id)), [nodes])
    const graphElements = React.useMemo(
        () => [
            ...nodes.map((node) => ({
                data: {
                    id: node.id,
                    label: node.name,
                    type: node.type,
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
        [edges, nodeIdSet, nodes]
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
                        label: 'data(label)',
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
    }, [graphColors, graphElements, nodes.length])

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
    edges,
    loading,
    onFocusNode
}: {
    graph: GraphSummary | null
    node: GraphNode | null
    edges: GraphEdge[]
    loading: boolean
    onFocusNode: (nodeId: string) => void
}) {
    const nodeById = new Map((graph?.nodes ?? []).map((item) => [item.id, item]))
    return (
        <>
            <CardHeader className="flex min-h-14 flex-row items-center justify-between gap-3 border-b px-3 py-2">
                <div className="grid min-w-0 gap-1">
                    <CardTitle className="truncate font-medium">{node?.name || t('graph')}</CardTitle>
                    <CardDescription className="truncate">
                        {node
                            ? node.type
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
                            <>
                                <div className="grid gap-2 rounded-lg border bg-muted/25 p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary" className="rounded-md">
                                            {node.type}
                                        </Badge>
                                        <Badge variant="outline" className="rounded-md">
                                            {formatNumber(node.mentionCount ?? node.value ?? 0)} {t('mentions')}
                                        </Badge>
                                        {typeof node.confidence === 'number' ? (
                                            <Badge variant="outline" className="rounded-md">
                                                {t('confidence')} {formatPercent(node.confidence)}
                                            </Badge>
                                        ) : null}
                                    </div>
                                    <div className="break-words font-medium">{node.name}</div>
                                </div>
                                <div className="grid gap-2">
                                    <div className="font-medium">{t('relations')}</div>
                                    {edges.map((edge) => {
                                        const otherId = edge.source === node.id ? edge.target : edge.source
                                        const other = nodeById.get(otherId)
                                        return (
                                            <button
                                                key={edge.id}
                                                className="grid gap-1 rounded-lg border bg-background p-3 text-left hover:bg-muted/40"
                                                onClick={() => otherId && onFocusNode(otherId)}
                                            >
                                                <span className="font-medium">{edge.type}</span>
                                                <span className="truncate text-xs text-muted-foreground/70">
                                                    {other?.name || otherId} · {formatNumber(edge.evidenceCount ?? 0)}{' '}
                                                    {t('evidence')}
                                                </span>
                                            </button>
                                        )
                                    })}
                                    {!edges.length ? (
                                        <div className="rounded-lg border border-dashed p-3 text-muted-foreground">
                                            {t('graphEmpty')}
                                        </div>
                                    ) : null}
                                </div>
                            </>
                        ) : graph?.unavailable ? (
                            <GraphEmptyState
                                title={t('graphUnavailable')}
                                description={graph.error || t('graphEmptyDescription')}
                            />
                        ) : graph && !graph.enabled ? (
                            <GraphEmptyState title={t('graphDisabled')} description={t('graphEmptyDescription')} />
                        ) : (
                            <GraphEmptyState title={t('graph')} description={t('focusEntity')} />
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </>
    )
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
