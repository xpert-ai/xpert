import { PipelineNodeDialog } from './node-dialog'
import { PipelineHeading } from './pipeline-heading'
import { usePipelineContext } from './context'
import { LaneDetails } from './lane-details'
import { nextActionableNode, blockedNodes } from './selection'
import { PipelineStatistics } from './statistics'
import { PipelineAnalytics } from './analytics'
import { PipelineAttentionList } from './attention-list'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Workflow, Clock3 } from 'lucide-react'
import { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@xpert-ai/shadcn-ui'
import { saveTaskViewState, type Graph, type Node, type PipelineFocus } from '../bridge'
import { dateTime } from '../i18n'
import { pipelineTexts } from './i18n'
import {
    listPipelines,
    readPipeline,
    readPipelineRounds,
    type PipelineRoundSummary,
    refreshPipeline,
    nextPipelineRound,
    type PipelineGraph,
    type PipelineSummary
} from './bridge'
import { Swimlane } from './swimlane'
import { ExecutionTimeline } from './timeline'
import { PipelineLifecycle } from './lifecycle'
import { PipelineConfiguration } from './configuration'
import { openProjectWorkspace } from './navigation'

export function PipelineView({
    locale,
    onTask,
    projectId,
    initialConfigure = false,
    initialFocus = {}
}: {
    locale: string
    projectId?: string
    initialConfigure?: boolean
    initialFocus?: PipelineFocus
    onTask: (task: Node, graph: Graph) => void
}) {
    const t = pipelineTexts(locale)
    const [items, setItems] = useState<PipelineSummary[]>([]),
        [next, setNext] = useState<string | null>(null)
    const [instanceId, setInstanceId] = useState<string | null>(initialFocus.pipelineInstanceId ?? null),
        [graph, setGraph] = useState<PipelineGraph | null>(null)
    const [roundId, setRoundId] = useState(initialFocus.pipelineRoundId ?? ''),
        [rounds, setRounds] = useState<PipelineRoundSummary[]>([]),
        [roundNext, setRoundNext] = useState<string | null>(null)
    const [mode, setMode] = useState<'stage' | 'time'>(initialFocus.pipelineMode ?? 'stage'),
        [lane, setLane] = useState(initialFocus.pipelineLane ?? '')
    const [selected, setSelected] = useState<string | null>(initialFocus.pipelineNodeId ?? null),
        [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false),
        [loaded, setLoaded] = useState(false),
        [now, setNow] = useState(Date.now())
    const [actionBusy, setActionBusy] = useState(false)
    const [selectedLane, setSelectedLane] = useState(initialFocus.selectedLane ?? '')
    const [onlyBlocked, setOnlyBlocked] = useState(initialFocus.onlyBlocked ?? false),
        [detailLane, setDetailLane] = useState('')
    const [focusNode, setFocusNode] = useState<string | null>(null)
    useEffect(() => {
        saveTaskViewState({
            pipelineInstanceId: instanceId ?? undefined,
            pipelineRoundId: roundId || undefined,
            pipelineMode: mode,
            pipelineLane: lane,
            selectedLane,
            onlyBlocked
        })
    }, [instanceId, roundId, mode, lane, selectedLane, onlyBlocked])
    const catalogLoaded = useRef(false)
    const historyFirst = useRef<string | null>(null)
    const nextRequest = useRef<{ key: string; id: string } | null>(null)
    const generation = useRef(0),
        loading = useRef<number | null>(null)
    const load = useCallback(
        async (includeCatalog = false) => {
            if (loading.current === generation.current) return
            const revision = generation.current
            loading.current = revision
            setBusy(true)
            try {
                if (!instanceId || includeCatalog || !catalogLoaded.current) {
                    const page = await listPipelines()
                    if (revision !== generation.current) return
                    setItems((previous) => {
                        const current = previous.find((item) => item.id === instanceId)
                        return current && !page.items.some((item) => item.id === current.id)
                            ? [...page.items, current]
                            : page.items
                    })
                    setNext(page.next)
                    // Poll callbacks retain their original closure; catalog readiness must survive it.
                    catalogLoaded.current = true
                    setLoaded(true)
                    if (!instanceId && page.items[0]) setInstanceId(page.items[0].id)
                }
                if (instanceId) {
                    const [data, history] = await Promise.all([
                        readPipeline(instanceId, roundId || undefined),
                        readPipelineRounds(instanceId)
                    ])
                    if (revision !== generation.current) return
                    if (historyFirst.current !== history.items[0]?.id) {
                        historyFirst.current = history.items[0]?.id ?? null
                        setRounds((previous) => {
                            const selected = previous.find((item) => item.id === roundId)
                            return selected && !history.items.some((item) => item.id === selected.id)
                                ? [...history.items, selected]
                                : history.items
                        })
                        setRoundNext(history.next)
                    }
                    if (roundId && history.items.some((item) => item.id === roundId && item.current)) {
                        setRoundId('')
                        return
                    }
                    setLoaded(true)
                    setItems((items) =>
                        items.some((item) => item.id === data.instance.id) ? items : [data.instance, ...items]
                    )
                    setGraph((previous) => (previous?.cursor === data.cursor ? previous : data))
                }
                setError(null)
            } catch (error) {
                if (revision === generation.current) setError(error instanceof Error ? error.message : String(error))
            } finally {
                if (loading.current === revision) loading.current = null
                if (revision === generation.current) setBusy(false)
            }
        },
        [instanceId, roundId]
    )
    useEffect(() => {
        generation.current++
        void load()
        const tick = window.setInterval(() => {
            setNow(Date.now())
            if (!document.hidden) void load()
        }, 5000)
        return () => {
            generation.current++
            window.clearInterval(tick)
        }
    }, [load])
    const more = async () => {
        if (!next) return
        const revision = generation.current
        setBusy(true)
        try {
            const page = await listPipelines(next)
            if (revision !== generation.current) return
            setItems((items) => [
                ...items,
                ...page.items.filter((item) => !items.some((previous) => previous.id === item.id))
            ])
            setNext(page.next)
        } catch (error) {
            if (revision === generation.current) setError(error instanceof Error ? error.message : String(error))
        } finally {
            if (revision === generation.current) setBusy(false)
        }
    }
    const node = graph?.nodes.find((node) => node.id === selected)
    usePipelineContext(graph, node)
    const refresh = async () => {
        if (!instanceId) return load()
        setBusy(true)
        try {
            await refreshPipeline(instanceId)
            await load(true)
        } catch (error) {
            setError(error instanceof Error ? error.message : String(error))
        } finally {
            setBusy(false)
        }
    }
    const nextNode = graph && nextActionableNode(graph)
    const counts = graph?.statistics
    const businessCounts = counts?.business ?? counts?.work
    const nextRound = async () => {
        if (!graph || actionBusy) return
        const key = `${graph.instance.id}:${graph.instance.revision}`
        if (nextRequest.current?.key !== key) nextRequest.current = { key, id: crypto.randomUUID() }
        setActionBusy(true)
        try {
            await nextPipelineRound(graph, nextRequest.current.id)
            await load()
            setError(null)
        } catch {
            setError(t.actionFailed)
        } finally {
            setActionBusy(false)
        }
    }
    const status = counts && businessCounts && (
        <div className="flex min-w-0 flex-1 items-center gap-4 whitespace-nowrap text-xs text-muted-foreground">
            <span>
                {businessCounts.completed} {t.completed}
            </span>
            <span className="text-primary">
                {businessCounts.running} {t.running}
            </span>
            <span>
                {counts.needsYou} {t.needsYou}
            </span>
            <span className={businessCounts.blocked ? 'text-destructive' : ''}>
                {businessCounts.blocked} {t.blocked}
            </span>
            <span className="ml-auto truncate">
                {t.updated}{' '}
                {dateTime(
                    graph!.historical && graph!.snapshotAt ? graph!.snapshotAt : graph!.instance.updatedAt,
                    locale
                )}
            </span>
        </div>
    )
    return (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label={t.title}>
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                <PipelineHeading
                    title={graph?.definition.title}
                    items={items}
                    instanceId={instanceId}
                    hasMore={!!next}
                    busy={busy}
                    locale={locale}
                    onSelect={(id) => {
                        setGraph(null)
                        setSelected(null)
                        setSelectedLane('')
                        setLane('')
                        setRoundId('')
                        setRounds([])
                        historyFirst.current = null
                        setInstanceId(id)
                    }}
                    onMore={() => void more()}
                />
                {graph && <PipelineStatistics graph={graph} locale={locale} t={t} />}
                <PipelineAnalytics locale={locale} t={t} />
                {graph && (
                    <PipelineAttentionList
                        graph={graph}
                        t={t}
                        onSelect={(id) => {
                            setLane('')
                            setOnlyBlocked(false)
                            setMode('stage')
                            setSelected(id)
                        }}
                    />
                )}
                <Button variant={mode === 'stage' ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode('stage')}>
                    <Workflow />
                    {t.stages}
                </Button>
                <Button variant={mode === 'time' ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode('time')}>
                    <Clock3 />
                    {t.timeline}
                </Button>
                {graph && (
                    <Select
                        value={roundId || '__current'}
                        onValueChange={(id) => {
                            if (id === '__more' && roundNext && instanceId) {
                                const revision = generation.current
                                void readPipelineRounds(instanceId, roundNext)
                                    .then((page) => {
                                        if (revision !== generation.current) return
                                        setRounds((previous) => [
                                            ...previous,
                                            ...page.items.filter(
                                                (item) => !previous.some((saved) => saved.id === item.id)
                                            )
                                        ])
                                        setRoundNext(page.next)
                                    })
                                    .catch(() => setError(t.actionFailed))
                                return
                            }
                            setGraph(null)
                            setSelected(null)
                            setRoundId(id === '__current' ? '' : id)
                        }}
                    >
                        <SelectTrigger className="w-52" aria-label={t.history}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__current">{t.scope}</SelectItem>
                            {rounds
                                .filter((item) => !item.current)
                                .map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                        {t.round} {item.sequence} · {dateTime(item.createdAt, locale)}
                                    </SelectItem>
                                ))}
                            {roundNext && <SelectItem value="__more">{t.more}</SelectItem>}
                        </SelectContent>
                    </Select>
                )}
                {graph && (
                    <Button
                        variant={onlyBlocked ? 'secondary' : 'ghost'}
                        size="sm"
                        aria-pressed={onlyBlocked}
                        onClick={() => {
                            setOnlyBlocked((value) => !value)
                            setMode('stage')
                            setLane('')
                            setSelected(null)
                            setFocusNode(!onlyBlocked ? (blockedNodes(graph)[0]?.id ?? null) : null)
                        }}
                    >
                        {t.onlyBlocked}
                    </Button>
                )}
                {graph && (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!nextNode}
                        title={!nextNode ? t.noActionable : nextNode.projection.title}
                        onClick={() => {
                            if (nextNode) {
                                setOnlyBlocked(false)
                                setLane('')
                                setMode('stage')
                                setSelected(nextNode.id)
                            }
                        }}
                    >
                        {t.nextActionable}
                    </Button>
                )}
                <div className="flex-1" />
                {projectId && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            void openProjectWorkspace(
                                projectId,
                                'application',
                                t.actionFailed,
                                undefined,
                                instanceId || undefined
                            ).catch(() => setError(t.actionFailed))
                        }}
                    >
                        {t.applicationWorkspace}
                    </Button>
                )}
                <PipelineConfiguration locale={locale} projectId={projectId} initialOpen={initialConfigure} />
                {graph && <PipelineLifecycle graph={graph} t={t} reload={load} />}
                {graph?.instance.authority === 'platform' && graph.round.state === 'awaiting_new_subject' && (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={actionBusy || graph.dispatchEnabled === false || !graph.permissions.canEdit}
                        onClick={() => void nextRound()}
                    >
                        {t.nextRound}
                    </Button>
                )}
                {graph && (
                    <Select value={lane || '__all'} onValueChange={(value) => setLane(value === '__all' ? '' : value)}>
                        <SelectTrigger className="w-40" aria-label={t.allLanes}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all">{t.allLanes}</SelectItem>
                            {graph.definition.lanes.map((lane) => (
                                <SelectItem key={lane.key} value={lane.key}>
                                    {lane.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.refresh}
                    disabled={busy}
                    onClick={() => void refresh()}
                >
                    <RefreshCw className={busy ? 'motion-safe:animate-spin' : ''} />
                </Button>
            </div>
            {graph?.dispatchEnabled === false && (
                <p role="status" className="border-b bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
                    {t.dispatchPaused}
                </p>
            )}
            {error && (
                <p role="alert" className="border-b px-4 py-2 text-sm text-destructive">
                    {error}
                </p>
            )}
            {graph?.historical && (
                <p role="status" className="border-b px-4 py-2 text-sm text-muted-foreground">
                    {t.historyHint} {graph.snapshotAt && dateTime(graph.snapshotAt, locale)}
                </p>
            )}
            {graph && (!graph.executionAttribution || graph.executionAttribution.unattributedCount > 0) && (
                <p role="status" className="border-b px-4 py-2 text-xs text-muted-foreground">
                    {graph.executionAttribution
                        ? `${t.unattributedExecutions} (${graph.executionAttribution.unattributedCount})`
                        : t.attributionUnavailable}
                </p>
            )}
            {graph && !graph.historyComplete && (
                <p role="status" className="border-b px-4 py-2 text-sm text-muted-foreground">
                    {t.historyIncomplete}
                </p>
            )}
            {graph?.refresh && graph.refresh.state !== 'ready' && (
                <p role="status" className="border-b px-4 py-2 text-sm text-muted-foreground">
                    {graph.refresh.state === 'failed'
                        ? t.refreshFailed
                        : graph.refresh.state === 'not_found'
                          ? t.sourceMissing
                          : t.refreshing}
                </p>
            )}
            {graph && ['cancelling', 'cancelled'].includes(graph.runState) && (
                <p role="status" className="border-b px-4 py-2 text-sm text-muted-foreground">
                    {t[graph.runState]}
                </p>
            )}
            {mode !== 'stage' && status && <div className="flex shrink-0 border-b px-3 py-2">{status}</div>}
            {!graph ? (
                <div className="grid flex-1 place-content-center gap-2 p-8 text-center text-sm text-muted-foreground">
                    <p>{!loaded || instanceId ? t.loading : t.empty}</p>
                    {loaded && !instanceId && <p>{t.emptyHint}</p>}
                </div>
            ) : mode === 'stage' ? (
                <Swimlane
                    status={status}
                    key={`${instanceId}:${roundId}:${lane}`}
                    initialScroll={
                        initialFocus.pipelineInstanceId === instanceId &&
                        (initialFocus.pipelineRoundId ?? '') === roundId
                            ? initialFocus
                            : undefined
                    }
                    graph={graph}
                    locale={locale}
                    t={t}
                    lane={lane}
                    selected={selected}
                    select={(node) => setSelected(node.id)}
                    onLane={setDetailLane}
                    selectedLane={selectedLane}
                    onLaneSelect={(key) => setSelectedLane((current) => (current === key ? '' : key))}
                    onlyBlocked={onlyBlocked}
                    focusNode={selected ?? focusNode}
                    onError={setError}
                />
            ) : (
                <ExecutionTimeline graph={graph} locale={locale} t={t} lane={lane} now={now} onError={setError} />
            )}
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">{t.pan}</p>
            {graph && (
                <LaneDetails
                    graph={graph}
                    laneKey={detailLane}
                    locale={locale}
                    t={t}
                    close={() => setDetailLane('')}
                    select={(node) => {
                        setOnlyBlocked(false)
                        setSelected(node.id)
                    }}
                    onError={setError}
                />
            )}
            {node && graph && (
                <PipelineNodeDialog
                    key={`${graph.instance.id}:${graph.roundId}:${node.id}`}
                    graph={graph}
                    node={node}
                    locale={locale}
                    projectId={projectId}
                    t={t}
                    now={now}
                    reload={load}
                    close={() => setSelected(null)}
                    onTask={onTask}
                />
            )}
        </section>
    )
}
