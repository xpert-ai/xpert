import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import { Table2, GitBranch, ChartNoAxesGantt, Columns3, RefreshCw, X, LoaderCircle } from 'lucide-react'
import {
    Button,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
    TooltipProvider,
    Sheet,
    SheetContent,
    SheetTitle,
    SheetDescription,
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
import { connect, request, graphSchema, type Graph, type Node } from './bridge'
import { texts, dateTime } from './i18n'
import { buildRows, filteredTasks, initialFilters, type View, type Grouping, type Sort } from './model'
import { Toolbar, type Fields } from './toolbar'
import { TaskTable, TaskBoard } from './task-views'
import { Gantt } from './gantt'
import { TaskFooter } from './task-footer'
import { useTaskColumns } from './columns'
import { TaskDetail, type DetailDraft } from './task-detail'
import { Empty, IconButton } from './ui'

function App() {
    const [locale, setLocale] = useState('en-US'),
        [ready, setReady] = useState(false)
    const [graph, setGraph] = useState<Graph | null>(null),
        [error, setError] = useState<string | null>(null)
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
    const [now, setNow] = useState(Date.now()),
        [width, setWidth] = useState(1400)
    const root = useRef<HTMLDivElement>(null),
        loading = useRef(false),
        generation = useRef(0)
    const detailDraft = useRef<DetailDraft | null>(null)
    const columns = useTaskColumns()
    const t = texts(locale)
    useEffect(
        () =>
            connect((locale) => {
                setLocale(locale)
                setReady(true)
            }, resetContext),
        []
    )
    useEffect(() => {
        const observer = new ResizeObserver(() => {
            if (root.current) setWidth(root.current.clientWidth)
        })
        if (root.current) observer.observe(root.current)
        return () => observer.disconnect()
    }, [])
    const load = useCallback(async () => {
        if (loading.current) return
        loading.current = true
        setRefreshing(true)
        const current = ++generation.current
        try {
            const result = z.object({ item: graphSchema }).parse(await request('requestData', { query: {} }))
            if (current !== generation.current) return
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
        if (!ready) return
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
    }, [ready, load])
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
        if (dirty) setNextSelection({ id })
        else {
            detailDraft.current = null
            setSelected(id)
        }
    }
    const select = (task: Node) => choose(task.id)
    const task = graph?.tasks.find((task) => task.id === selected)
    const toggle = (id: string) =>
        setCollapsed((previous) => {
            const next = new Set(previous)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    const detail = graph && task && (
        <TaskDetail
            key={task.id}
            graph={graph}
            task={task}
            t={t}
            locale={locale}
            select={select}
            onGraph={onGraph}
            onDirty={setDirty}
            draftRef={detailDraft}
        />
    )
    const icons = { all: Table2, tree: GitBranch, gantt: ChartNoAxesGantt, board: Columns3 }
    const toolbar = (controls?: ReactNode) => (
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
        >
            {controls}
        </Toolbar>
    )
    return (
        <TooltipProvider>
            <main
                ref={root}
                aria-label={`${graph?.projectTitle || t.project} · ${t.title}`}
                className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background font-sans text-foreground"
            >
                <Tabs
                    value={view}
                    onValueChange={(value) => {
                        if (value === 'all' || value === 'tree' || value === 'gantt' || value === 'board')
                            setView(value)
                    }}
                    className="min-h-0 flex-1 gap-0"
                >
                    <div className="flex shrink-0 items-center gap-2 border-b px-3">
                        <div className="min-w-0 flex-1 overflow-x-auto">
                            <TabsList variant="line" aria-label={t.viewLabel} className="h-10 gap-3">
                                {(['all', 'tree', 'gantt', 'board'] as const).map((value) => {
                                    const Icon = icons[value]
                                    return (
                                        <TabsTrigger
                                            key={value}
                                            value={value}
                                            className="px-2 data-[state=active]:text-primary data-[state=active]:after:bg-primary"
                                        >
                                            <Icon />
                                            {t[value]}
                                        </TabsTrigger>
                                    )
                                })}
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
                        <details className="border-b bg-muted px-4 py-2 text-sm">
                            <summary>
                                {t.diagnostics} · {graph.diagnostics.length}
                            </summary>
                            {graph.diagnostics.map((item) => (
                                <p key={item.providerKey} className="py-1 text-destructive">
                                    {item.message}
                                </p>
                            ))}
                        </details>
                    )}
                    {forecast.error && (
                        <p role="alert" className="border-b px-4 py-2 text-xs text-destructive">
                            {t.scheduleError}: {forecast.error}
                        </p>
                    )}
                    {(view !== 'gantt' || !graph) && toolbar()}
                    <div className="flex min-h-0 min-w-0 flex-1">
                        <TabsContent value={view} className="m-0 flex min-h-0 min-w-0 flex-1 flex-col">
                            {!graph ? (
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
                            <TaskFooter
                                visible={matches.length}
                                total={graph?.tasks.length ?? 0}
                                completed={graph?.tasks.filter((task) => task.status === 'done').length ?? 0}
                                legend={view === 'gantt' && !!graph?.tasks.length}
                                t={t}
                            />
                        </TabsContent>
                        {detail && width >= 1200 && (
                            <aside aria-label={t.details} className="flex w-[360px] shrink-0 flex-col border-l">
                                <div className="flex items-center justify-between px-4 py-1.5">
                                    <p className="text-xs font-medium text-muted-foreground">{t.details}</p>
                                    <IconButton label={t.close} onClick={() => choose(null)}>
                                        <X />
                                    </IconButton>
                                </div>
                                {detail}
                            </aside>
                        )}
                    </div>
                </Tabs>
                {width < 1200 && (
                    <Sheet
                        open={!!task}
                        onOpenChange={(open) => {
                            if (!open) choose(null)
                        }}
                    >
                        <SheetContent
                            className="w-[min(420px,100%)] gap-0 sm:max-w-[420px]"
                            aria-describedby="task-sheet-description"
                        >
                            <SheetTitle className="px-4 py-3 text-xs text-muted-foreground">{t.details}</SheetTitle>
                            <SheetDescription id="task-sheet-description" className="sr-only">
                                {t.subtitle}
                            </SheetDescription>
                            {detail}
                        </SheetContent>
                    </Sheet>
                )}
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
