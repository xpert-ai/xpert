import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import { Table2, GitBranch, ChartNoAxesGantt, Columns3, RefreshCw, LoaderCircle, Workflow } from 'lucide-react'
import {
    Button,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    TooltipProvider,
    Dialog,
    DialogContent,
    DialogHeader,
    Accordion,
    AccordionItem,
    AccordionTrigger,
    AccordionContent,
    DialogTitle,
    DialogDescription,
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction
} from '@xpert-ai/shadcn-ui'
import { forecastProjectTasks } from '@xpert-ai/contracts'
import {
    connect,
    request,
    saveTaskViewState,
    getTaskViewState,
    graphSchema,
    type Graph,
    type Node,
    type PipelineFocus
} from './bridge'
import { texts, dateTime } from './i18n'
import { buildRows, filteredTasks, initialFilters, type View, type Grouping, type Sort } from './model'
import { Toolbar, type Fields } from './toolbar'
import type { TimelineControlsProps } from './timeline-controls'
import { TaskTable, TaskBoard } from './task-views'
import { Gantt } from './gantt'
import { TaskFooter } from './task-footer'
import { useTaskColumns } from './columns'
import { TaskDetail, type DetailDraft } from './task-detail'
import { Empty, IconButton } from './ui'
import { PipelineView } from './pipeline/view'
import { pipelineTexts } from './pipeline/i18n'
import { useViewVisible } from './view-visibility'
import { GraphAvatarCache } from './graph-avatars'

function App() {
    const visible = useViewVisible()
    const avatarCache = useRef(new GraphAvatarCache())
    const [locale, setLocale] = useState('en-US'),
        [ready, setReady] = useState(false)
    const [graph, setGraph] = useState<Graph | null>(null),
        [error, setError] = useState<string | null>(null)
    const [pipelineSelected, setPipelineSelected] = useState(false)
    const [configurePipeline, setConfigurePipeline] = useState(false)
    const [pipelineFocus, setPipelineFocus] = useState<PipelineFocus>({})
    const [detailGraph, setDetailGraph] = useState<Graph | null>(null)
    const [refreshing, setRefreshing] = useState(false),
        [updatedAt, setUpdatedAt] = useState<string | null>(null)
    const [view, setView] = useState<View>('gantt'),
        [timelineGrouping, setTimelineGrouping] = useState<Grouping>('hierarchy'),
        [tableGrouping, setTableGrouping] = useState<Grouping>('none')
    const grouping = view === 'all' ? tableGrouping : timelineGrouping
    const setGrouping = view === 'all' ? setTableGrouping : setTimelineGrouping
    const [filters, setFilters] = useState(initialFilters),
        [sort, setSort] = useState<Sort>('source')
    const [fields, setFields] = useState<Fields>({ status: true, assignee: true, attempts: true, dates: true })
    const [collapsed, setCollapsed] = useState(new Set<string>()),
        [selected, setSelected] = useState<string | null>(null)
    const [dirty, setDirty] = useState(false),
        [nextSelection, setNextSelection] = useState<{ id: string | null } | null>(null)
    const [now, setNow] = useState(Date.now())
    const detailTrigger = useRef<HTMLElement | null>(null)
    const loading = useRef(false),
        generation = useRef(0)
    const detailDraft = useRef<DetailDraft | null>(null)
    const columns = useTaskColumns()
    const t = texts(locale)
    useEffect(
        () =>
            connect((locale, entry) => {
                setLocale(locale)
                setPipelineSelected(entry.pipeline)
                if (entry.tab && entry.tab !== 'pipeline') setView(entry.tab)
                setConfigurePipeline(entry.configure)
                setPipelineFocus(entry.focus)
                setReady(true)
            }, resetContext),
        []
    )
    const load = useCallback(async () => {
        if (loading.current) return
        loading.current = true
        setRefreshing(true)
        const current = ++generation.current
        try {
            const response = await request('requestData', { query: avatarCache.current.query() })
            if (current !== generation.current) return
            const result = { item: avatarCache.current.read(response) }
            setGraph((previous) =>
                previous?.cursor === result.item.cursor && previous.canEditPlan === result.item.canEditPlan
                    ? previous
                    : result.item
            )
            setError(null)
            setUpdatedAt(new Date().toISOString())
        } catch (error) {
            if (current === generation.current) setError(error instanceof Error ? error.message : String(error))
        } finally {
            loading.current = false
            setRefreshing(false)
        }
    }, [])
    useEffect(() => {
        if (!ready || !visible) return
        void load()
        const timer = window.setInterval(() => {
            setNow(Date.now())
            if (!document.hidden) void load()
        }, 5000)
        const visibility = () => {
            if (!document.hidden) void load()
        }
        document.addEventListener('visibilitychange', visibility)
        return () => {
            window.clearInterval(timer)
            document.removeEventListener('visibilitychange', visibility)
            generation.current++
        }
    }, [ready, visible, load])
    const onGraph = (graph: Graph) => {
        generation.current++
        setGraph(graph)
        setUpdatedAt(new Date().toISOString())
    }
    const effectiveGrouping = view === 'tree' ? 'hierarchy' : grouping
    const rows = useMemo(
        () => buildRows(graph?.tasks ?? [], filters, effectiveGrouping, collapsed, sort),
        [graph, filters, effectiveGrouping, collapsed, sort]
    )
    const matches = useMemo(() => filteredTasks(graph?.tasks ?? [], filters, sort), [graph, filters, sort])
    const forecast = useMemo(() => {
        try {
            return { items: forecastProjectTasks(graph?.tasks ?? []), error: null }
        } catch (error) {
            return { items: [], error: error instanceof Error ? error.message : String(error) }
        }
    }, [graph])
    const choose = (id: string | null) => {
        if (id === selected) return
        if (!selected && id)
            detailTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        if (dirty) setNextSelection({ id })
        else {
            detailDraft.current = null
            setSelected(id)
        }
    }
    const select = (task: Node) => {
        setDetailGraph(null)
        choose(task.id)
    }
    const selectedGraph = detailGraph ?? graph
    const task = selectedGraph?.tasks.find((task) => task.id === selected)
    const toggle = (id: string) =>
        setCollapsed((previous) => {
            const next = new Set(previous)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    const detail = selectedGraph && task && (
        <TaskDetail
            key={task.id}
            graph={selectedGraph}
            task={task}
            t={t}
            locale={locale}
            select={(task) => choose(task.id)}
            onGraph={onGraph}
            onDirty={setDirty}
            draftRef={detailDraft}
        />
    )
    const icons = { all: Table2, tree: GitBranch, gantt: ChartNoAxesGantt, board: Columns3 }
    const toolbar = (timeline?: TimelineControlsProps) => (
        <Toolbar
            t={t}
            tasks={graph?.tasks ?? []}
            view={view}
            filters={filters}
            setFilters={setFilters}
            grouping={grouping}
            setGrouping={setGrouping}
            sort={sort}
            setSort={setSort}
            fields={fields}
            setFields={setFields}
            collapseAll={() => setCollapsed(new Set(graph?.tasks.map((task) => task.id)))}
            expandAll={() => setCollapsed(new Set())}
            timeline={timeline}
        />
    )
    return (
        <TooltipProvider>
            <main
                aria-label={`${graph?.projectTitle || t.project} · ${t.title}`}
                className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background font-sans text-foreground"
            >
                <Tabs
                    value={pipelineSelected ? 'pipeline' : view}
                    onValueChange={(value) => {
                        setPipelineSelected(value === 'pipeline')
                        if (value === 'pipeline') setPipelineFocus(getTaskViewState())
                        if (
                            value === 'pipeline' ||
                            value === 'all' ||
                            value === 'tree' ||
                            value === 'gantt' ||
                            value === 'board'
                        )
                            saveTaskViewState({ initialTab: value })
                        if (value === 'all' || value === 'tree' || value === 'gantt' || value === 'board')
                            setView(value)
                    }}
                    className="min-h-0 min-w-0 flex-1 gap-0"
                >
                    <div className="@container flex shrink-0 items-center gap-2 border-b px-3 py-2">
                        <div className="min-w-0 flex-1 overflow-hidden">
                            <TabsList variant="line" aria-label={t.viewLabel} className="grid w-full grid-cols-5">
                                {(['all', 'tree', 'gantt', 'board'] as const).map((value) => {
                                    const Icon = icons[value]
                                    return (
                                        <TabsTrigger
                                            key={value}
                                            value={value}
                                            aria-label={t[value]}
                                            title={t[value]}
                                            className="min-w-0"
                                        >
                                            <Icon />
                                            <span className="hidden truncate @[34rem]:inline">{t[value]}</span>
                                        </TabsTrigger>
                                    )
                                })}
                                <TabsTrigger
                                    value="pipeline"
                                    aria-label={pipelineTexts(locale).title}
                                    title={pipelineTexts(locale).title}
                                    className="min-w-0"
                                >
                                    <Workflow />
                                    <span className="hidden truncate @[34rem]:inline">
                                        {pipelineTexts(locale).title}
                                    </span>
                                </TabsTrigger>
                            </TabsList>
                        </div>
                        <IconButton
                            label={t.refresh}
                            tooltip={`${t.refresh} · ${t.updated} ${dateTime(updatedAt, locale, true)}`}
                            className="shrink-0"
                            disabled={refreshing || !ready}
                            onClick={() => void load()}
                        >
                            <RefreshCw className={refreshing ? 'motion-safe:animate-spin' : undefined} />
                        </IconButton>
                    </div>
                    {error && (
                        <div
                            role="alert"
                            className="flex items-center gap-3 border-b bg-destructive/5 px-4 py-2 text-sm text-destructive"
                        >
                            <span className="min-w-0 flex-1 break-words">{error}</span>
                            <Button variant="outline" size="sm" onClick={() => void load()}>
                                {t.refresh}
                            </Button>
                        </div>
                    )}
                    {!!graph?.diagnostics.length && (
                        <Accordion type="single" collapsible className="px-4">
                            <AccordionItem value="diagnostics">
                                <AccordionTrigger>
                                    {t.diagnostics} · {graph.diagnostics.length}
                                </AccordionTrigger>
                                <AccordionContent>
                                    {graph.diagnostics.map((item) => (
                                        <p key={item.providerKey} className="py-1 text-destructive">
                                            {item.message}
                                        </p>
                                    ))}
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    )}
                    {forecast.error && (
                        <p role="alert" className="border-b px-4 py-2 text-xs text-destructive">
                            {t.scheduleError}: {forecast.error}
                        </p>
                    )}
                    {!pipelineSelected && (view !== 'gantt' || !graph) && toolbar()}
                    <div className="flex min-h-0 min-w-0 flex-1">
                        <TabsContent
                            value={pipelineSelected ? 'pipeline' : view}
                            className="m-0 flex min-h-0 min-w-0 flex-1 flex-col"
                        >
                            {pipelineSelected ? (
                                <PipelineView
                                    key={`${graph?.projectId}:${pipelineFocus.pipelineInstanceId}:${pipelineFocus.pipelineRoundId}:${pipelineFocus.pipelineNodeId}`}
                                    initialFocus={pipelineFocus}
                                    locale={locale}
                                    projectId={graph?.projectId}
                                    initialConfigure={configurePipeline}
                                    onTask={(task, data) => {
                                        setDetailGraph(data)
                                        choose(task.id)
                                    }}
                                />
                            ) : !graph ? (
                                <Empty title={error ? t.error : t.loading} />
                            ) : view === 'gantt' ? (
                                <Gantt
                                    empty={
                                        !graph.tasks.length ? (
                                            <Empty title={t.empty} hint={t.emptyHint} />
                                        ) : !matches.length ? (
                                            <Empty title={t.noResults}>
                                                <Button variant="outline" onClick={() => setFilters(initialFilters)}>
                                                    {t.clear}
                                                </Button>
                                            </Empty>
                                        ) : undefined
                                    }
                                    graph={graph}
                                    rows={rows}
                                    selected={selected}
                                    select={select}
                                    collapsed={collapsed}
                                    toggle={toggle}
                                    t={t}
                                    locale={locale}
                                    fields={fields}
                                    grouping={effectiveGrouping}
                                    columns={columns}
                                    onError={setError}
                                    renderToolbar={toolbar}
                                    forecasts={forecast.items}
                                    now={now}
                                />
                            ) : !graph.tasks.length ? (
                                <Empty title={t.empty} hint={t.emptyHint} />
                            ) : !matches.length ? (
                                <Empty title={t.noResults}>
                                    <Button variant="outline" onClick={() => setFilters(initialFilters)}>
                                        {t.clear}
                                    </Button>
                                </Empty>
                            ) : view === 'board' ? (
                                <TaskBoard
                                    graph={graph}
                                    tasks={matches}
                                    selected={selected}
                                    select={select}
                                    t={t}
                                    locale={locale}
                                    onError={setError}
                                />
                            ) : (
                                <TaskTable
                                    graph={graph}
                                    rows={rows}
                                    selected={selected}
                                    select={select}
                                    collapsed={collapsed}
                                    toggle={toggle}
                                    t={t}
                                    locale={locale}
                                    fields={fields}
                                    grouping={effectiveGrouping}
                                    columns={columns}
                                    onError={setError}
                                />
                            )}
                            {!pipelineSelected && (
                                <TaskFooter
                                    visible={matches.length}
                                    total={graph?.tasks.length ?? 0}
                                    completed={matches.filter((task) => task.status === 'done').length}
                                    legend={view === 'gantt' && !!graph?.tasks.length}
                                    t={t}
                                />
                            )}
                        </TabsContent>
                    </div>
                </Tabs>
                <Dialog
                    open={!!task}
                    onOpenChange={(open) => {
                        if (!open) choose(null)
                    }}
                >
                    <DialogContent
                        className="flex max-h-[90dvh] min-h-0 flex-col overflow-hidden sm:max-w-4xl"
                        aria-describedby="task-dialog-description"
                        onCloseAutoFocus={(event) => {
                            event.preventDefault()
                            if (detailTrigger.current?.isConnected) detailTrigger.current.focus()
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{t.details}</DialogTitle>
                            <DialogDescription id="task-dialog-description">{t.subtitle}</DialogDescription>
                        </DialogHeader>
                        {detail}
                    </DialogContent>
                </Dialog>
                <AlertDialog
                    open={!!nextSelection}
                    onOpenChange={(open) => {
                        if (!open) setNextSelection(null)
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t.discardTitle}</AlertDialogTitle>
                            <AlertDialogDescription>{t.discardHint}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t.keepEditing}</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    setDirty(false)
                                    detailDraft.current = null
                                    setSelected(nextSelection?.id ?? null)
                                    setNextSelection(null)
                                }}
                            >
                                {t.discard}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </main>
        </TooltipProvider>
    )
}
const root = createRoot(document.getElementById('root')!)
let contextRevision = 0
function resetContext() {
    root.render(<App key={++contextRevision} />)
}
root.render(<App />)
