import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@xpert-ai/shadcn-ui'
import type { ProjectTaskForecast } from '@xpert-ai/contracts'
import { type ViewProps, groupLabel, useVirtualRows, TASK_ROW_HEIGHT, TASK_HEADER_HEIGHT } from './task-views'
import { type Scale, timelineDomain, plannedEnd, attemptTimes, isRunning } from './model'
import { dateTime } from './i18n'
import { Status, TaskName } from './ui'
import { useDragScroll } from './drag-scroll'
import type { TimelineControlsProps } from './timeline-controls'
import {
    MIN_TIMELINE_WIDTH,
    MAX_TIMELINE_WIDTH,
    zoomTimelineWidth,
    timelineAnchor,
    timelineScrollLeft
} from './timeline-viewport'
import { ColumnHeader } from './columns'
import { Assignee } from './assignee'

export function Gantt(
    props: ViewProps & {
        forecasts: ProjectTaskForecast[]
        now: number
        empty?: ReactNode
        renderToolbar: (controls: TimelineControlsProps) => ReactNode
    }
) {
    const {
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
        forecasts,
        now,
        columns,
        onError,
        renderToolbar,
        empty
    } = props
    const [scale, setScale] = useState<Scale>('hour'),
        [pixelsPerTick, setPixelsPerTick] = useState<number | null>(null),
        [includeNow, setIncludeNow] = useState(false),
        [locatePending, setLocatePending] = useState(false)
    const virtual = useVirtualRows(rows.length),
        markerId = useId().replace(/:/g, '')
    const pendingAnchor = useRef<{ time: number; screenX: number } | null>(null)
    useDragScroll(virtual.ref)
    const domain = useMemo(
        () =>
            timelineDomain(
                [
                    ...graph.tasks.flatMap((task) => [
                        task.plannedStartAt,
                        plannedEnd(task),
                        task.actualStartAt,
                        task.actualEndAt
                    ]),
                    ...graph.executions.flatMap((item) => {
                        const times = attemptTimes(item)
                        return [times.start, times.end, isRunning(item) ? new Date(now).toISOString() : null]
                    }),
                    ...forecasts.flatMap((item) => [item.startAt, item.endAt]),
                    includeNow ? new Date(now).toISOString() : null
                ],
                scale,
                now
            ),
        [graph, forecasts, scale, now, includeNow]
    )
    const visibleColumns: Array<'name' | 'status' | 'assignee'> = [
        'name',
        ...(fields.status ? ['status' as const] : []),
        ...(fields.assignee ? ['assignee' as const] : [])
    ]
    const left = visibleColumns.reduce((sum, column) => sum + columns.widths[column], 0)
    // Wide columns must remain horizontally scrollable on narrow hosts.
    const pinColumns = left <= virtual.viewport.width - 180
    const width =
        pixelsPerTick == null
            ? Math.max(360, virtual.viewport.width - left)
            : Math.max(MIN_TIMELINE_WIDTH, Math.min(MAX_TIMELINE_WIDTH, domain.ticks * pixelsPerTick))
    const geometry = {
        start: domain.start,
        end: domain.end,
        width,
        columns: left,
        viewport: virtual.viewport.width,
        pinned: pinColumns
    }
    const rememberAnchor = () => {
        pendingAnchor.current = timelineAnchor(geometry, virtual.ref.current?.scrollLeft ?? 0)
    }
    const zoom = (direction: 'in' | 'out') => {
        rememberAnchor()
        setPixelsPerTick(zoomTimelineWidth(width, direction) / domain.ticks)
    }
    useLayoutEffect(() => {
        if (!pendingAnchor.current || !virtual.ref.current) return
        virtual.ref.current.scrollLeft = timelineScrollLeft(geometry, pendingAnchor.current)
        pendingAnchor.current = null
    }, [width, domain.start, domain.end, left, virtual.viewport.width, pinColumns])
    const x = (date: string | number) =>
        (((typeof date === 'number' ? date : Date.parse(date)) - domain.start) / (domain.end - domain.start)) * width
    const rowGrid = visibleColumns.map((column) => `${columns.widths[column]}px`).join(' ')
    const forecastsById = new Map(forecasts.map((item) => [item.taskId, item]))
    const rowIndex = new Map(rows.flatMap((row, index) => (row.type === 'task' ? [[row.task.id, index] as const] : [])))
    const tickStride = Math.max(1, Math.ceil(domain.ticks / Math.max(1, width / 88)))
    const locate = () => {
        setIncludeNow(true)
        setLocatePending(true)
    }
    useLayoutEffect(() => {
        if (!locatePending || !virtual.ref.current) return
        virtual.ref.current.scrollLeft = timelineScrollLeft(geometry, {
            time: now,
            screenX: pinColumns ? left + (virtual.viewport.width - left) / 2 : virtual.viewport.width / 2
        })
        setLocatePending(false)
    }, [locatePending, domain.start, domain.end, width, left, now, virtual.viewport.width])
    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {renderToolbar({
                scale,
                setScale: (value) => {
                    rememberAnchor()
                    setScale(value)
                    setPixelsPerTick(100)
                },
                date: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(
                    new Date(domain.start)
                ),
                zoom: Math.round(width / domain.ticks),
                canZoomIn: width < MAX_TIMELINE_WIDTH,
                canZoomOut: width > MIN_TIMELINE_WIDTH,
                zoomIn: () => zoom('in'),
                zoomOut: () => zoom('out'),
                fit: () => {
                    pendingAnchor.current = null
                    setPixelsPerTick(null)
                    setIncludeNow(false)
                    virtual.ref.current?.scrollTo({ left: 0 })
                },
                locate
            })}
            {empty}
            <div
                ref={virtual.ref}
                onScroll={virtual.onScroll}
                className={cn(
                    'min-h-0 min-w-0 flex-1 overflow-auto cursor-grab data-[panning=true]:cursor-grabbing data-[panning=true]:select-none',
                    empty && 'hidden'
                )}
                data-task-scroll="gantt"
                title={t.panHint}
                aria-label={t.gantt}
            >
                <div style={{ width: left + width, minWidth: '100%' }}>
                    <div
                        data-scroll-pan-ignore=""
                        className="sticky top-0 z-30 flex border-b bg-background text-xs text-muted-foreground"
                        style={{ height: TASK_HEADER_HEIGHT }}
                    >
                        <div
                            className={cn(
                                'z-30 grid shrink-0 items-center border-r bg-background',
                                pinColumns && 'sticky left-0'
                            )}
                            style={{ width: left, gridTemplateColumns: rowGrid }}
                        >
                            {visibleColumns.map((column) => (
                                <ColumnHeader key={column} column={column} label={t[column]} columns={columns} t={t} />
                            ))}
                        </div>
                        <div className="relative" style={{ width }}>
                            {Array.from({ length: domain.ticks }, (_, i) => i)
                                .filter((i) => i % tickStride === 0)
                                .map((i) => (
                                    <span
                                        key={i}
                                        className="absolute inset-y-0 flex items-center border-l pl-2 tabular-nums"
                                        style={{ left: (i / domain.ticks) * width }}
                                    >
                                        {new Intl.DateTimeFormat(
                                            locale,
                                            scale === 'hour' && domain.step * tickStride < 86400000
                                                ? { hour: '2-digit', minute: '2-digit', hour12: false }
                                                : { month: '2-digit', day: '2-digit' }
                                        ).format(new Date(domain.start + i * domain.step))}
                                    </span>
                                ))}
                        </div>
                    </div>
                    <div className="relative" style={{ height: rows.length * TASK_ROW_HEIGHT }}>
                        <div
                            className="pointer-events-none absolute inset-y-0"
                            style={{
                                left,
                                width,
                                backgroundImage: 'linear-gradient(to right, var(--border) 1px, transparent 1px)',
                                backgroundSize: `${(width / domain.ticks) * tickStride}px 100%`
                            }}
                        />
                        <div style={{ height: virtual.start * TASK_ROW_HEIGHT }} />
                        {rows.slice(virtual.start, virtual.end).map((row) => {
                            if (row.type === 'group')
                                return (
                                    <div
                                        key={row.id}
                                        className="relative flex items-center border-b bg-muted/30"
                                        style={{ height: TASK_ROW_HEIGHT }}
                                    >
                                        <span className="sticky left-0 z-10 bg-background px-4 font-semibold">
                                            {groupLabel(row, grouping, graph, t)}{' '}
                                            <span className="ml-2 text-xs text-muted-foreground">{row.count}</span>
                                        </span>
                                    </div>
                                )
                            const { task } = row,
                                forecast = forecastsById.get(task.id)
                            const color =
                                task.status === 'done'
                                    ? 'bg-[var(--success)] text-white'
                                    : task.status === 'blocked'
                                      ? 'bg-destructive text-white'
                                      : 'bg-primary text-primary-foreground'
                            const attempts = graph.executions.filter((item) => item.taskId === task.id)
                            const actuals = attempts.flatMap((item) => {
                                const { start, end } = attemptTimes(item)
                                return start
                                    ? [
                                          {
                                              key: item.id,
                                              start,
                                              end: end ?? (isRunning(item) ? new Date(now).toISOString() : start)
                                          }
                                      ]
                                    : []
                            })
                            if (!actuals.length && task.actualStartAt)
                                actuals.push({
                                    key: task.id,
                                    start: task.actualStartAt,
                                    end: task.actualEndAt ?? task.actualStartAt
                                })
                            const rangeButton = (
                                start: string,
                                end: string | null | undefined,
                                variant: 'planned' | 'actual' | 'forecast',
                                key: string
                            ) => {
                                const barWidth = Math.max(
                                    task.kind === 'milestone' ? 10 : 5,
                                    end ? x(end) - x(start) : 5
                                )
                                return (
                                    <button
                                        key={key}
                                        onClick={() => select(task)}
                                        title={`${task.title}\n${t[variant]}: ${dateTime(start, locale)} → ${dateTime(end, locale)}`}
                                        aria-label={`${task.title} · ${t[variant]}`}
                                        className={cn(
                                            'absolute z-10 overflow-hidden rounded text-left text-xs whitespace-nowrap focus-visible:outline-ring',
                                            variant === 'planned'
                                                ? 'top-[6px] h-[28px] border border-dashed border-muted-foreground/50 bg-muted/60'
                                                : variant === 'actual'
                                                  ? `top-[10px] h-[20px] ${color}`
                                                  : 'bottom-1 h-1 border-t-2 border-dashed border-primary/50',
                                            task.kind === 'milestone' && 'rounded-none',
                                            variant === 'forecast' && forecast?.critical && 'border-destructive'
                                        )}
                                        style={{ left: x(start), width: barWidth }}
                                    >
                                        {variant === 'actual' && barWidth > 90 && (
                                            <span className="px-2 tabular-nums">
                                                {dateTime(start, locale, true)}–{dateTime(end, locale, true)}
                                            </span>
                                        )}
                                    </button>
                                )
                            }
                            return (
                                <div
                                    key={task.id}
                                    data-selected={task.id === selected}
                                    className="relative flex border-b hover:bg-muted/30 data-[selected=true]:bg-primary/10"
                                    style={{ height: TASK_ROW_HEIGHT }}
                                >
                                    <div
                                        className={cn(
                                            'z-20 grid shrink-0 items-center border-r bg-background',
                                            pinColumns && 'sticky left-0',
                                            task.id === selected && 'bg-secondary'
                                        )}
                                        style={{ width: left, gridTemplateColumns: rowGrid }}
                                    >
                                        <div className="min-w-0 pl-2 pr-2">
                                            <TaskName
                                                row={row}
                                                collapsed={collapsed}
                                                toggle={toggle}
                                                select={select}
                                                t={t}
                                                locale={locale}
                                            />
                                        </div>
                                        {fields.status && (
                                            <div className="overflow-hidden px-3">
                                                <Status value={task.status} progress={task.progress} t={t} />
                                            </div>
                                        )}
                                        {fields.assignee && (
                                            <Assignee
                                                task={task}
                                                attempts={attempts}
                                                t={t}
                                                locale={locale}
                                                onError={onError}
                                            />
                                        )}
                                    </div>
                                    <div className="relative" style={{ width }}>
                                        {task.plannedStartAt &&
                                            rangeButton(task.plannedStartAt, plannedEnd(task), 'planned', 'plan')}
                                        {actuals.map((item) => rangeButton(item.start, item.end, 'actual', item.key))}
                                        {forecast?.startAt &&
                                            rangeButton(forecast.startAt, forecast.endAt, 'forecast', 'forecast')}
                                        {!task.plannedStartAt && !actuals.length && !forecast?.startAt && (
                                            <span className="flex h-full items-center px-3 text-xs text-muted-foreground">
                                                {t.unknown}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                        <svg
                            className="pointer-events-none absolute top-0"
                            style={{ left }}
                            width={width}
                            height={rows.length * TASK_ROW_HEIGHT}
                            aria-hidden
                        >
                            <defs>
                                <marker
                                    id={markerId}
                                    viewBox="0 0 10 10"
                                    refX="8"
                                    refY="5"
                                    markerWidth="5"
                                    markerHeight="5"
                                    orient="auto"
                                >
                                    <path d="M0 0L10 5L0 10Z" fill="var(--muted-foreground)" />
                                </marker>
                            </defs>
                            {rows.flatMap((row, targetIndex) =>
                                row.type === 'group'
                                    ? []
                                    : row.task.predecessorIds.map((id) => {
                                          const sourceIndex = rowIndex.get(id),
                                              source = graph.tasks.find((task) => task.id === id)
                                          if (
                                              sourceIndex == null ||
                                              !source ||
                                              (targetIndex < virtual.start && sourceIndex < virtual.start) ||
                                              (targetIndex >= virtual.end && sourceIndex >= virtual.end)
                                          )
                                              return null
                                          const from =
                                              plannedEnd(source) ?? forecastsById.get(id)?.endAt ?? source.actualEndAt
                                          const to = row.task.plannedStartAt ?? forecastsById.get(row.task.id)?.startAt
                                          if (!from || !to) return null
                                          return (
                                              <path
                                                  key={`${id}:${row.task.id}`}
                                                  d={`M${x(from)} ${(sourceIndex + 0.5) * TASK_ROW_HEIGHT} C${x(from) + 20} ${(sourceIndex + 0.5) * TASK_ROW_HEIGHT},${x(to) - 20} ${(targetIndex + 0.5) * TASK_ROW_HEIGHT},${x(to)} ${(targetIndex + 0.5) * TASK_ROW_HEIGHT}`}
                                                  fill="none"
                                                  stroke="var(--muted-foreground)"
                                                  strokeOpacity="0.65"
                                                  markerEnd={`url(#${markerId})`}
                                              />
                                          )
                                      })
                            )}
                        </svg>
                        {now >= domain.start && now <= domain.end && (
                            <div
                                className="pointer-events-none absolute inset-y-0 z-10 border-l border-dashed border-primary"
                                style={{ left: left + x(now) }}
                            >
                                <span className="absolute -top-0.5 left-1 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                                    {t.now}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
