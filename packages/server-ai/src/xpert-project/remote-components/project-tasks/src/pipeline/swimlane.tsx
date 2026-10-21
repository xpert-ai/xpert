import { pipelineExecutions } from './executions'
import { type PipelineFocus } from '../bridge'
import { pipelineStageIcons } from './stage-icons'
import { isCurrentNode } from './selection'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { GitBranch, Layers, UserCheck, ExternalLink, Flag, Split, Merge, Info } from 'lucide-react'
import { cn } from '@xpert-ai/shadcn-ui'
import { Assignee } from '../assignee'
import { ExecutionIndicators } from '../execution-indicators'
import { texts } from '../i18n'
import { PipelineViewport } from './viewport'
import type { PipelineGraph, PipelineNode } from './bridge'
import type { PipelineTexts } from './i18n'
import {
    pipelineLayout,
    pipelineEdgePath,
    edgeLabelLines,
    isControlNode,
    laneWidth,
    headerHeight,
    nodeHeight,
    controlSize
} from './layout'

const icons = {
    work: Layers,
    fork: Split,
    join: Merge,
    router: GitBranch,
    human_gate: UserCheck,
    external_wait: ExternalLink,
    terminal: Flag
}
export function Swimlane({
    status,
    graph,
    locale,
    t,
    lane,
    selected,
    select,
    onError,
    onLane,
    selectedLane,
    onLaneSelect,
    onlyBlocked = false,
    focusNode,
    initialScroll
}: {
    status?: ReactNode
    initialScroll?: PipelineFocus
    graph: PipelineGraph
    locale: string
    t: PipelineTexts
    lane: string
    selected: string | null
    onLane: (key: string) => void
    selectedLane: string
    onLaneSelect: (key: string) => void
    onlyBlocked?: boolean
    focusNode?: string | null
    select: (node: PipelineNode) => void
    onError: (message: string) => void
}) {
    const viewport = useRef<HTMLDivElement>(null)
    const nodeElements = useRef(new Map<string, HTMLElement>())
    useEffect(() => {
        if (focusNode) nodeElements.current.get(focusNode)?.scrollIntoView({ block: 'nearest', inline: 'center' })
    }, [focusNode, onlyBlocked])
    const visible = (node: PipelineNode) =>
        !onlyBlocked || (isCurrentNode(node) && node.projection.state.readiness === 'blocked')
    const marker = useId().replace(/:/g, '')
    const layout = pipelineLayout(graph, lane)
    const nodeKinds = new Map(graph.nodes.map((node) => [node.projection.key, node.projection.kind]))
    return (
        <PipelineViewport
            status={status}
            viewport={viewport}
            width={layout.width}
            height={layout.height}
            t={t}
            initialScroll={initialScroll}
            focusNode={focusNode}
        >
            <div className="relative isolate" style={{ width: layout.width, height: layout.height }}>
                <div className="sticky top-0 z-30 flex border-b bg-background" style={{ height: headerHeight }}>
                    <div
                        className="sticky left-0 z-40 shrink-0 border-r bg-background px-3 py-2 text-xs text-muted-foreground"
                        style={{ width: laneWidth }}
                    >
                        <p
                            className="truncate text-sm font-semibold leading-tight text-foreground"
                            title={graph.instance.title}
                        >
                            {graph.instance.title}
                        </p>
                        <p className="mt-1">
                            {graph.historical ? t.history : t.round} {graph.round.sequence}
                        </p>
                    </div>
                    {layout.headers.map((header) => {
                        const HeaderIcon = header.control
                            ? icons[header.control.kind]
                            : header.icon
                              ? pipelineStageIcons[header.icon]
                              : Layers
                        return (
                            <div
                                key={header.key}
                                role="group"
                                aria-label={header.label}
                                className={cn('relative shrink-0 border-r px-3 py-2', header.control && 'bg-muted/30')}
                                style={{ width: header.width }}
                            >
                                {!header.control && (
                                    <p className="absolute right-2 top-1 text-[10px] text-muted-foreground">
                                        {String(header.stageNumber).padStart(2, '0')}
                                    </p>
                                )}
                                <div
                                    className={cn(
                                        'flex h-full items-center gap-2',
                                        header.control && 'justify-center gap-1.5'
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'flex shrink-0 items-center justify-center',
                                            header.control
                                                ? 'text-muted-foreground'
                                                : 'size-7 rounded-lg bg-primary text-primary-foreground'
                                        )}
                                    >
                                        <HeaderIcon className="size-4" />
                                    </span>
                                    <p
                                        className={cn(
                                            'min-w-0 truncate font-semibold',
                                            header.control ? 'text-xs' : 'text-sm'
                                        )}
                                        title={
                                            header.control
                                                ? `${t[header.control.kind]} · ${header.label}`
                                                : header.label
                                        }
                                    >
                                        {header.label}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
                {layout.rows.map((row) => (
                    <div
                        key={row.key}
                        className={cn(
                            'absolute left-0 flex w-full border-b transition-colors',
                            selectedLane === row.key && 'bg-primary/5'
                        )}
                        onClick={(event) => {
                            if (!(event.target instanceof Element) || !event.target.closest('button'))
                                onLaneSelect(row.key)
                        }}
                        style={{ top: row.y, height: row.height }}
                    >
                        <div
                            className={cn(
                                'sticky left-0 z-20 flex min-h-0 shrink-0 flex-col justify-center overflow-hidden border-r bg-background px-3 pt-4 pb-9 before:absolute before:inset-y-0 before:left-0 before:w-1',
                                selectedLane === row.key ? 'bg-accent before:bg-primary' : 'before:bg-border'
                            )}
                            style={{ width: laneWidth }}
                        >
                            <div
                                data-scroll-pan-ignore
                                className="min-h-0 overflow-y-auto overscroll-contain"
                                tabIndex={0}
                                aria-label={row.label}
                            >
                                {!graph.nodes.some(
                                    (node) =>
                                        node.projection.laneKey === row.key &&
                                        graph.tasks.tasks.some(
                                            (task) => node.taskIds.includes(task.id) && task.assigneeXpertId
                                        )
                                ) && (
                                    <button
                                        className="rounded text-left text-sm font-semibold hover:underline focus-visible:outline-ring"
                                        aria-pressed={selectedLane === row.key}
                                        onClick={() => onLaneSelect(row.key)}
                                    >
                                        {row.label}
                                    </button>
                                )}
                                {[
                                    ...new Map(
                                        graph.nodes
                                            .filter((node) => node.projection.laneKey === row.key)
                                            .flatMap((node) => node.taskIds)
                                            .flatMap((id) =>
                                                graph.tasks.tasks.filter(
                                                    (task) => task.id === id && task.assigneeXpertId
                                                )
                                            )
                                            .map((task) => [task.assigneeXpertId, task])
                                    ).values()
                                ].map((task) => (
                                    <Assignee
                                        key={task.id}
                                        task={task}
                                        attempts={[]}
                                        t={texts(locale)}
                                        locale={locale}
                                        onError={onError}
                                        className="my-2"
                                        laneHeading={row.label}
                                        laneSelected={selectedLane === row.key}
                                        onLane={() => onLaneSelect(row.key)}
                                        taskTitles={new Map(graph.tasks.tasks.map((item) => [item.id, item.title]))}
                                    />
                                ))}
                            </div>
                            <ExecutionIndicators
                                title={row.label}
                                attempts={pipelineExecutions(
                                    graph,
                                    graph.nodes.filter((node) => node.projection.laneKey === row.key)
                                )}
                                t={texts(locale)}
                                locale={locale}
                                onError={onError}
                                className="absolute bottom-3 left-3 right-3 justify-end"
                                taskTitles={new Map(graph.tasks.tasks.map((task) => [task.id, task.title]))}
                            />
                            <button
                                className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-ring"
                                aria-label={`${t.laneDetails} · ${row.label}`}
                                title={t.laneDetails}
                                onClick={() => onLane(row.key)}
                            >
                                <Info className="size-4" />
                            </button>
                        </div>
                        {layout.headers.map((header) => (
                            <div
                                key={header.key}
                                className={cn('shrink-0 border-r border-dashed', header.control && 'bg-muted/10')}
                                style={{ width: header.width }}
                            />
                        ))}
                    </div>
                ))}
                <svg
                    className="pointer-events-none absolute inset-0 z-0 text-muted-foreground"
                    width={layout.width}
                    height={layout.height}
                    aria-hidden
                >
                    <defs>
                        <marker id={marker} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                            <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
                        </marker>
                    </defs>
                    {graph.edges
                        .filter(
                            (edge) =>
                                !onlyBlocked ||
                                [edge.from, edge.to].every((key) =>
                                    graph.nodes.some((node) => node.projection.key === key && visible(node))
                                )
                        )
                        .map((edge) => {
                            const fromKind = nodeKinds.get(edge.from),
                                toKind = nodeKinds.get(edge.to)
                            if (!fromKind || !toKind) return null
                            const route =
                                layout.edgeRoutes.get(edge) ??
                                pipelineEdgePath(layout, edge.from, edge.to, fromKind, toKind)
                            if (!route) return null
                            const labelLines = edge.label ? edgeLabelLines(edge.label, route.labelWidth) : []
                            return (
                                <g key={edge.key} opacity={edge.selection === 'excluded' ? 0.3 : 1}>
                                    <path
                                        d={route.path}
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeDasharray={edge.selection === 'selected' ? undefined : '5 4'}
                                        markerEnd={`url(#${marker})`}
                                    />
                                    {edge.label && (
                                        <text
                                            className="pointer-events-auto"
                                            x={route.labelX}
                                            y={route.labelY}
                                            textAnchor="middle"
                                            fill="currentColor"
                                            fontSize="10"
                                        >
                                            <title>{edge.label}</title>
                                            {labelLines.map((line, index) => (
                                                <tspan
                                                    key={index}
                                                    x={route.labelX}
                                                    y={route.labelY - (labelLines.length - 1 - index) * 12}
                                                >
                                                    {line}
                                                </tspan>
                                            ))}
                                        </text>
                                    )}
                                </g>
                            )
                        })}
                </svg>
                {graph.nodes.filter(visible).map((node) => {
                    const position = layout.positions.get(node.projection.key)
                    if (!position) return null
                    const projection = node.projection,
                        state = projection.state
                    const stageIcon = graph.definition.stages.find((stage) => stage.key === projection.stageKey)?.icon
                    const Icon =
                        !isControlNode(projection.kind) && stageIcon
                            ? pipelineStageIcons[stageIcon]
                            : icons[projection.kind]
                    const logic = isControlNode(projection.kind)
                    const label =
                        state.freshness === 'superseded'
                            ? 'superseded'
                            : state.applicability === 'excluded'
                              ? 'excluded'
                              : state.applicability === 'undetermined'
                                ? 'undetermined'
                                : state.lifecycle === 'pending' || state.lifecycle === 'active'
                                  ? state.readiness
                                  : state.lifecycle
                    if (logic)
                        return (
                            <button
                                key={node.id}
                                ref={(element) => {
                                    if (element) nodeElements.current.set(node.id, element)
                                    else nodeElements.current.delete(node.id)
                                }}
                                className="absolute z-10 flex flex-col items-center gap-0.5 rounded-lg text-xs focus-visible:outline-ring"
                                style={{
                                    left: position.x,
                                    top: position.y,
                                    width: position.width,
                                    height: nodeHeight
                                }}
                                onClick={() => select(node)}
                                aria-pressed={selected === node.id}
                            >
                                <span
                                    style={{
                                        marginTop: (nodeHeight - controlSize) / 2,
                                        width: controlSize,
                                        height: controlSize
                                    }}
                                    className={cn(
                                        'flex shrink-0 items-center justify-center border bg-background shadow-sm',
                                        projection.kind === 'terminal' ? 'rounded-full' : 'rotate-45 rounded-md',
                                        selected === node.id ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                                    )}
                                >
                                    <Icon className={cn('size-4', projection.kind !== 'terminal' && '-rotate-45')} />
                                </span>
                                <span className="max-w-full truncate font-medium" title={projection.title}>
                                    {projection.title}
                                </span>
                                <span className="text-muted-foreground">{t[label]}</span>
                            </button>
                        )
                    return (
                        <div
                            key={node.id}
                            ref={(element) => {
                                if (element) nodeElements.current.set(node.id, element)
                                else nodeElements.current.delete(node.id)
                            }}
                            className={cn(
                                'absolute z-10 rounded-xl border bg-background shadow-sm transition-shadow hover:shadow-md',
                                selected === node.id ? 'ring-2 ring-primary/20' : '',
                                label === 'blocked'
                                    ? 'border-warning/60 bg-warning/5'
                                    : label === 'completed'
                                      ? 'border-success/60'
                                      : label === 'ready'
                                        ? 'border-info/60'
                                        : 'border-border',
                                (state.applicability === 'excluded' || state.freshness === 'superseded') && 'opacity-50'
                            )}
                            style={{ left: position.x, top: position.y, width: position.width, height: nodeHeight }}
                        >
                            <button
                                className="flex w-full flex-col gap-0.5 rounded-xl px-2.5 pt-2 text-left focus-visible:outline-ring"
                                onClick={() => select(node)}
                                aria-pressed={selected === node.id}
                            >
                                <span className="flex w-full items-center justify-between gap-2">
                                    <span className="flex size-5 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                        <Icon className="size-4" />
                                    </span>
                                    <span
                                        title={t[label]}
                                        className={cn(
                                            'max-w-[70%] truncate rounded-full border px-1.5 text-xs font-medium',
                                            label === 'blocked'
                                                ? 'border-warning/50 bg-warning/10 text-warning'
                                                : label === 'completed'
                                                  ? 'border-success/40 bg-success/10 text-success'
                                                  : label === 'ready'
                                                    ? 'border-info/40 bg-info/10 text-info'
                                                    : 'border-border text-muted-foreground'
                                        )}
                                    >
                                        {t[label]}
                                    </span>
                                </span>
                                <span className="w-full truncate text-sm font-semibold" title={projection.title}>
                                    {projection.title}
                                </span>
                                <span className="w-full truncate text-xs" title={graph.instance.title}>
                                    {graph.instance.title}
                                </span>
                                <span className="w-full truncate text-xs text-muted-foreground">
                                    {t[projection.kind]} · {t[state.runtime]}
                                </span>
                            </button>
                            <ExecutionIndicators
                                title={projection.title}
                                attempts={pipelineExecutions(graph, [node])}
                                t={texts(locale)}
                                locale={locale}
                                onError={onError}
                                taskTitles={new Map(graph.tasks.tasks.map((task) => [task.id, task.title]))}
                                className="absolute bottom-1 left-2.5 right-2.5 h-3 justify-end"
                            />
                        </div>
                    )
                })}
            </div>
        </PipelineViewport>
    )
}
