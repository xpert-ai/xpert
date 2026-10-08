import { useLayoutEffect, useRef, useState } from 'react'
import { GitBranch, MessageSquare, CalendarClock } from 'lucide-react'
import { cn } from '@xpert-ai/shadcn-ui'
import type { Graph, Node } from './bridge'
import type { Fields } from './toolbar'
import { type Row, type Grouping, owner, statuses, plannedEnd } from './model'
import { type Texts, dateTime } from './i18n'
import { Status, TaskName } from './ui'
import { ColumnHeader, type Column, type TaskColumns } from './columns'
import { Assignee } from './assignee'
import { TaskTypeIcon } from './task-type-icon'
import { useDragScroll } from './drag-scroll'

// Keep virtual offsets, dependency paths and rendered row heights in sync.
export const TASK_ROW_HEIGHT = 40
export const TASK_HEADER_HEIGHT = 36

export function useVirtualRows(length: number, rowHeight = TASK_ROW_HEIGHT) {
    const ref = useRef<HTMLDivElement>(null)
    const [viewport, setViewport] = useState({ top: 0, height: 600, width: 1000 })
    useLayoutEffect(() => {
        const element = ref.current
        if (!element) return
        const observer = new ResizeObserver(() =>
            setViewport({ top: element.scrollTop, height: element.clientHeight, width: element.clientWidth })
        )
        observer.observe(element)
        return () => observer.disconnect()
    }, [])
    const start = Math.min(
        Math.max(0, length - 1),
        Math.max(0, Math.floor(Math.max(0, viewport.top - TASK_HEADER_HEIGHT) / rowHeight) - 5)
    )
    const end = Math.min(length, start + Math.ceil(viewport.height / rowHeight) + 12)
    return {
        ref,
        viewport,
        start,
        end,
        onScroll: () => {
            const element = ref.current
            if (element) setViewport((previous) => ({ ...previous, top: element.scrollTop }))
        }
    }
}
export function groupLabel(row: Extract<Row, { type: 'group' }>, grouping: Grouping, graph: Graph, t: Texts) {
    if (grouping === 'status')
        return statuses.includes(row.value as Node['status']) ? t[row.value as Node['status']] : row.value
    if (grouping === 'kind') return row.value === 'task' ? t.task : row.value === 'summary' ? t.summary : t.milestone
    const task = graph.tasks.find((task) => (task.assigneeXpertId ?? 'unassigned') === row.value)
    return task ? owner(task, t.unassigned, t.unnamedAssistant) : t.unassigned
}
export interface ViewProps {
    graph: Graph
    rows: Row[]
    selected: string | null
    select: (task: Node) => void
    collapsed: Set<string>
    toggle: (id: string) => void
    t: Texts
    locale: string
    fields: Fields
    grouping: Grouping
    columns: TaskColumns
    onError: (message: string) => void
}
export function TaskTable({
    graph,
    rows,
    selected,
    select,
    collapsed,
    toggle,
    t,
    locale,
    fields,
    grouping,
    columns,
    onError
}: ViewProps) {
    const virtual = useVirtualRows(rows.length)
    useDragScroll(virtual.ref)
    const visibleColumns: Column[] = [
        'name',
        ...(['status', 'assignee', 'attempts', 'dates'] as const).filter((key) => fields[key])
    ]
    const grid = visibleColumns.map((column) => `${columns.widths[column]}px`).join(' ')
    const minWidth = visibleColumns.reduce((sum, column) => sum + columns.widths[column], 0)
    return (
        <div
            ref={virtual.ref}
            onScroll={virtual.onScroll}
            className="min-h-0 min-w-0 flex-1 overflow-auto cursor-grab data-[panning=true]:cursor-grabbing data-[panning=true]:select-none"
            data-task-scroll="table"
            title={t.panHint}
            role="region"
            aria-label={t.title}
        >
            <div role="table" aria-rowcount={rows.length + 1} style={{ minWidth }}>
                <div
                    role="row"
                    data-scroll-pan-ignore=""
                    className="sticky top-0 z-20 grid items-center border-b bg-muted/50 text-xs font-medium text-muted-foreground backdrop-blur"
                    style={{ gridTemplateColumns: grid, height: TASK_HEADER_HEIGHT }}
                >
                    {visibleColumns.map((column) => (
                        <ColumnHeader
                            key={column}
                            column={column}
                            label={t[column === 'dates' ? 'planned' : column === 'attempts' ? 'history' : column]}
                            columns={columns}
                            t={t}
                        />
                    ))}
                </div>
                <div style={{ height: virtual.start * TASK_ROW_HEIGHT }} />
                {rows.slice(virtual.start, virtual.end).map((row, index) =>
                    row.type === 'group' ? (
                        <div
                            role="row"
                            key={row.id}
                            className="flex items-center gap-2 border-b bg-muted/30 px-3 text-sm font-semibold"
                            style={{ height: TASK_ROW_HEIGHT }}
                        >
                            <span>{groupLabel(row, grouping, graph, t)}</span>
                            <span className="text-xs font-normal text-muted-foreground">{row.count}</span>
                        </div>
                    ) : (
                        <div
                            role="row"
                            aria-rowindex={virtual.start + index + 2}
                            key={row.task.id}
                            data-selected={selected === row.task.id}
                            className="grid items-center border-b hover:bg-muted/30 data-[selected=true]:bg-primary/10"
                            style={{ gridTemplateColumns: grid, height: TASK_ROW_HEIGHT }}
                        >
                            <div role="cell" className="min-w-0 px-3">
                                <TaskName
                                    row={row}
                                    select={select}
                                    collapsed={collapsed}
                                    toggle={toggle}
                                    t={t}
                                    locale={locale}
                                />
                            </div>
                            {fields.status && (
                                <div role="cell" className="overflow-hidden px-3">
                                    <Status value={row.task.status} progress={row.task.progress} t={t} />
                                </div>
                            )}
                            {fields.assignee && (
                                <div role="cell" className="min-w-0">
                                    <Assignee
                                        task={row.task}
                                        attempts={graph.executions.filter((item) => item.taskId === row.task.id)}
                                        t={t}
                                        locale={locale}
                                        onError={onError}
                                    />
                                </div>
                            )}
                            {fields.attempts && (
                                <span role="cell" className="truncate px-3 text-xs tabular-nums text-muted-foreground">
                                    {graph.executions.filter((item) => item.taskId === row.task.id).length}
                                </span>
                            )}
                            {fields.dates && (
                                <span role="cell" className="truncate px-3 text-xs tabular-nums text-muted-foreground">
                                    {row.task.plannedStartAt
                                        ? `${dateTime(row.task.plannedStartAt, locale)} → ${dateTime(plannedEnd(row.task), locale)}`
                                        : t.unknown}
                                </span>
                            )}
                        </div>
                    )
                )}
                <div style={{ height: Math.max(0, rows.length - virtual.end) * TASK_ROW_HEIGHT }} />
            </div>
        </div>
    )
}
/** A board is a projection of authoritative statuses; dragging never invents a domain transition. */
export function TaskBoard({
    graph,
    tasks,
    selected,
    select,
    t,
    locale,
    onError
}: {
    graph: Graph
    tasks: Node[]
    selected: string | null
    select: (task: Node) => void
    t: Texts
    locale: string
    onError: (message: string) => void
}) {
    const visibleStatuses = statuses.filter(
        (status) =>
            ['todo', 'in_progress', 'review', 'done'].includes(status) || tasks.some((task) => task.status === status)
    )
    return (
        <div className="flex min-h-0 flex-1 gap-3 overflow-auto bg-muted/20 p-3" aria-label={t.board}>
            {visibleStatuses.map((status) => {
                const items = tasks.filter((task) => task.status === status)
                return (
                    <section key={status} className="flex w-72 shrink-0 flex-col gap-2" aria-label={t[status]}>
                        <header className="flex items-center justify-between py-1">
                            <Status value={status} t={t} />
                            <span className="truncate px-3 text-xs tabular-nums text-muted-foreground">
                                {items.length}
                            </span>
                        </header>
                        {items.map((task) => (
                            <article
                                key={task.id}
                                aria-label={task.title}
                                className={cn(
                                    'space-y-2 rounded-lg border bg-background p-3 text-left shadow-xs transition-colors hover:border-primary/50',
                                    selected === task.id && 'border-primary ring-1 ring-primary/20'
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => select(task)}
                                    aria-label={task.title}
                                    className="block w-full space-y-2 rounded text-left hover:underline focus-visible:outline-ring"
                                >
                                    <span className="block text-xs text-muted-foreground">
                                        {t[task.kind]}
                                        {task.parentTaskId && (
                                            <span className="ml-2">
                                                / {graph.tasks.find((item) => item.id === task.parentTaskId)?.title}
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex items-start gap-2 text-sm font-medium leading-5">
                                        <TaskTypeIcon task={task} locale={locale} fallbackLabel={t[task.kind]} />
                                        <span className="min-w-0 break-words">{task.title}</span>
                                    </span>
                                </button>
                                <Assignee
                                    task={task}
                                    attempts={graph.executions.filter((item) => item.taskId === task.id)}
                                    t={t}
                                    locale={locale}
                                    onError={onError}
                                    className="px-0"
                                />
                                {task.progress != null && <Status value={task.status} progress={task.progress} t={t} />}
                                <div className="flex items-center gap-3 border-t pt-2 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <GitBranch className="size-3.5" />
                                        {task.predecessorIds.length}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <MessageSquare className="size-3.5" />
                                        {graph.executions.filter((item) => item.taskId === task.id).length}
                                    </span>
                                    <span className="ml-auto flex items-center gap-1">
                                        <CalendarClock className="size-3.5" />
                                        {task.plannedStartAt ? dateTime(task.plannedStartAt, locale, true) : t.unknown}
                                    </span>
                                </div>
                            </article>
                        ))}
                        {!items.length && (
                            <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                                {t.noResults}
                            </p>
                        )}
                    </section>
                )
            })}
        </div>
    )
}
