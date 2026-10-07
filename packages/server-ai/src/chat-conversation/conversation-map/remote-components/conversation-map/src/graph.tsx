import React, { createContext, useContext, useMemo, useEffect, useState, useCallback } from 'react'
import {
    ReactFlow,
    ReactFlowProvider,
    useReactFlow,
    useStore,
    getNodesBounds,
    getViewportForBounds,
    Background,
    Controls,
    MiniMap,
    Handle,
    Position,
    type NodeProps,
    type NodeChange
} from '@xyflow/react'
import {
    Folder,
    MessagesSquare,
    GitBranch,
    MessageSquare,
    MessageSquareShare,
    MessageSquarePlus,
    Plus,
    Minus,
    MoreHorizontal
} from 'lucide-react'
import {
    Button,
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    Tooltip,
    TooltipTrigger,
    TooltipContent
} from '@xpert-ai/shadcn-ui'
import type { MapNode } from '../../../schema'
import type { Prefs } from './bridge'
import type { Labels } from './i18n'
import { layout, type TopicNode, type NodeSize } from './layout'
import { NodeDetails, NodeUpdatedAt } from './node-details'
export type NodeAction = 'locate' | 'rename' | 'side-chat' | 'branch' | 'copy'
type GraphActions = {
    labels: Labels
    locale: string
    select: (node: MapNode) => void
    toggle: (node: MapNode) => void
    action: (action: NodeAction, node: MapNode) => void
    direction: 'TB' | 'LR'
    selected?: string
    pending: boolean
}
const Actions = createContext<GraphActions | null>(null)
export const icons = { project: Folder, conversation: MessagesSquare, thread: GitBranch, turn: MessageSquare }
function Topic({ data }: NodeProps<TopicNode>) {
    const ctx = useContext(Actions)!
    const { topic, expanded, summary } = data
    const Icon = icons[topic.kind]
    const selected = ctx.selected === topic.id
    return (
        <div
            className={`relative flex w-full flex-col rounded-lg border bg-card text-card-foreground shadow-xs ${selected ? 'border-info ring-2 ring-info/20' : 'border-border'}`}
        >
            <Handle
                type="target"
                position={ctx.direction === 'TB' ? Position.Top : Position.Left}
                isConnectable={false}
            />
            <div className="flex shrink-0 items-start gap-2 p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-info">
                    <Icon className="size-5" aria-hidden />
                </span>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            className="nodrag h-auto min-w-0 flex-1 flex-col items-start gap-0 p-0 text-left"
                            onClick={() => ctx.select(topic)}
                        >
                            <span
                                className={`w-full text-base font-semibold ${summary ? 'line-clamp-2 whitespace-normal break-words' : 'truncate'}`}
                            >
                                {topic.title}
                            </span>
                            <span className="block text-sm text-muted-foreground">
                                {ctx.labels[topic.kind]}
                                {topic.shared ? ` · ${ctx.labels.sharedHint}` : ''}
                                {topic.current ? ` · ${ctx.labels.current}` : ''}
                            </span>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm break-words">{topic.title}</TooltipContent>
                </Tooltip>
                {topic.conversationId && <NodeMenu node={topic} labels={ctx.labels} action={ctx.action} />}
            </div>
            {topic.kind !== 'project' && (
                <div className="px-3 pb-3">
                    <NodeDetails node={topic} labels={ctx.labels} compact={!summary} />
                </div>
            )}
            {(topic.updatedAt || topic.conversationId) && (
                <div className="mx-3 flex min-h-10 shrink-0 items-center gap-1 border-t py-1">
                    <div className="min-w-0 flex-1">
                        <NodeUpdatedAt node={topic} labels={ctx.labels} locale={ctx.locale} />
                    </div>
                    <NodeQuickActions node={topic} labels={ctx.labels} pending={ctx.pending} action={ctx.action} />
                </div>
            )}
            <Handle
                type="source"
                position={ctx.direction === 'TB' ? Position.Bottom : Position.Right}
                isConnectable={false}
            />
            {topic.expandable && (
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon-xs"
                            className={`nodrag absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-card ${selected ? 'border-info' : 'border-border'}`}
                            aria-label={expanded ? ctx.labels.collapse : ctx.labels.expand}
                            aria-expanded={expanded}
                            onClick={(event) => {
                                event.stopPropagation()
                                ctx.toggle(topic)
                            }}
                        >
                            {expanded ? (
                                <Minus className="size-3.5" aria-hidden />
                            ) : (
                                <Plus className="size-3.5" aria-hidden />
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={8}>
                        {expanded ? ctx.labels.collapse : ctx.labels.expand}
                    </TooltipContent>
                </Tooltip>
            )}
        </div>
    )
}
export function NodeQuickActions({
    node,
    labels: l,
    pending,
    action,
    compact = false
}: {
    node: MapNode
    labels: Labels
    pending: boolean
    action: GraphActions['action']
    compact?: boolean
}) {
    if (!node.conversationId || !node.threadId) return null
    return (
        <>
            <NodeIconButton
                label={l.locate}
                reason={pending ? l.loading : undefined}
                compact={compact}
                onClick={() => action('locate', node)}
            >
                <MessageSquareShare className="size-4" aria-hidden />
            </NodeIconButton>
            {node.kind === 'thread' && (
                <NodeIconButton
                    label={l.side}
                    compact={compact}
                    reason={pending ? l.loading : node.status !== 'idle' ? l.busy : undefined}
                    onClick={() => action('side-chat', node)}
                >
                    <MessageSquarePlus className="size-4" aria-hidden />
                </NodeIconButton>
            )}
        </>
    )
}
function NodeIconButton({
    label,
    reason,
    onClick,
    children,
    compact = false
}: {
    label: string
    reason?: string
    onClick: () => void
    children: React.ReactNode
    compact?: boolean
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size={compact ? 'icon-xs' : 'icon-sm'}
                    className="nodrag aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                    aria-label={label}
                    aria-disabled={Boolean(reason)}
                    onClick={(event) => {
                        event.stopPropagation()
                        if (!reason) onClick()
                    }}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6} className="max-w-64">
                {reason ? `${label} · ${reason}` : label}
            </TooltipContent>
        </Tooltip>
    )
}
export function NodeMenu({
    node,
    labels: l,
    action
}: {
    node: MapNode
    labels: Labels
    action: GraphActions['action']
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="nodrag size-6" aria-label={l.actions}>
                    <MoreHorizontal className="size-4" aria-hidden />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => action('locate', node)}>{l.locate}</DropdownMenuItem>
                {node.kind === 'thread' && (
                    <DropdownMenuItem
                        title={node.status !== 'idle' ? l.busy : undefined}
                        disabled={node.status !== 'idle'}
                        onSelect={() => action('side-chat', node)}
                    >
                        {l.side}
                    </DropdownMenuItem>
                )}
                {(node.kind === 'conversation' || node.kind === 'thread') && (
                    <DropdownMenuItem onSelect={() => action('rename', node)}>{l.rename}</DropdownMenuItem>
                )}
                {node.kind === 'turn' && (
                    <DropdownMenuItem
                        title={
                            node.branchAvailable
                                ? undefined
                                : (l.reasons[node.branchReason as keyof typeof l.reasons] ?? l.unavailable)
                        }
                        disabled={!node.branchAvailable}
                        onSelect={() => action('branch', node)}
                    >
                        {l.branch}
                    </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => action('copy', node)}>{l.copy}</DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
const nodeTypes = { topic: Topic }
export function TopicGraph(props: GraphActions & { items: MapNode[]; expanded: Set<string>; prefs: Prefs }) {
    const [sizes, setSizes] = useState<ReadonlyMap<string, NodeSize>>(() => new Map())
    const onNodesChange = useCallback((changes: NodeChange<TopicNode>[]) => {
        setSizes((previous) => {
            const next = new Map(previous)
            let changed = false
            for (const change of changes) {
                if (change.type !== 'dimensions' || !change.dimensions) continue
                const { width, height } = change.dimensions
                const before = previous.get(change.id)
                if (width > 0 && height > 0 && (before?.width !== width || before?.height !== height)) {
                    next.set(change.id, { width, height })
                    changed = true
                }
            }
            return changed ? next : previous
        })
    }, [])
    const graph = useMemo(
        () => layout(props.items, props.expanded, props.prefs, sizes),
        [props.items, props.expanded, props.prefs, sizes]
    )
    // Dagre needs a height, but the rendered node must stay intrinsic so React Flow can measure it.
    const flowNodes = useMemo(() => graph.nodes.map(({ height: _height, ...node }) => node), [graph.nodes])
    const measured = graph.nodes.every((node) => node.measured?.height !== undefined)
    const path = new Set<string>()
    let ancestor = props.items.find((node) => node.id === props.selected)
    while (ancestor && !path.has(ancestor.id)) {
        path.add(ancestor.id)
        ancestor = props.items.find((node) => node.id === ancestor?.parentId)
    }
    return (
        <ReactFlowProvider>
            <Actions.Provider value={props}>
                <ReactFlow
                    nodes={flowNodes}
                    onNodesChange={onNodesChange}
                    edges={graph.edges.map((edge) =>
                        path.has(edge.target) && path.has(edge.source)
                            ? { ...edge, style: { ...edge.style, stroke: 'var(--info)', strokeWidth: 2 } }
                            : edge
                    )}
                    nodeTypes={nodeTypes}
                    minZoom={0.2}
                    maxZoom={1.5}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    onNodeClick={(_, node) => props.select(node.data.topic)}
                    proOptions={{ hideAttribution: false }}
                >
                    <AutoFit nodes={graph.nodes} ready={measured} direction={props.direction} />
                    <Background gap={22} size={1} />
                    <Controls showInteractive={false} />
                    <MiniMap
                        pannable
                        zoomable
                        className="hidden sm:block"
                        style={{ width: 144, height: 100 }}
                        nodeColor="var(--muted-foreground)"
                        maskColor="color-mix(in srgb, var(--background) 75%, transparent)"
                    />
                </ReactFlow>
            </Actions.Provider>
        </ReactFlowProvider>
    )
}

function AutoFit({ nodes, ready, direction }: { nodes: TopicNode[]; ready: boolean; direction: string }) {
    const flow = useReactFlow()
    const width = useStore((state) => state.width)
    const height = useStore((state) => state.height)
    const shape = nodes
        .map((node) => `${node.id}:${node.position.x},${node.position.y},${node.width},${node.height}`)
        .join('|')
    useEffect(() => {
        if (!ready || !flow.viewportInitialized || !width || !height || !nodes.length) return
        // Use the measured Dagre bounds, including retained nodes whose content changed.
        // Setting the viewport directly avoids queuing controlled-node updates for fitView.
        const bounds = getNodesBounds(nodes)
        const viewport = getViewportForBounds(bounds, width, height, 0.2, 1, 0.18)
        // Keep short vertical trees near the toolbar rather than in a large empty canvas.
        if (direction === 'TB') viewport.y = Math.min(viewport.y, 80 - bounds.y * viewport.zoom)
        void flow.setViewport(viewport, { duration: 0 })
    }, [width, height, shape, ready, direction, flow])
    return null
}
