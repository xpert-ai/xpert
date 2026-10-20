import { pipelineExecutions } from './executions'
import { useEffect, useRef, useState } from 'react'
import { Button, cn } from '@xpert-ai/shadcn-ui'
import { Assignee } from '../assignee'
import { attemptTimes } from '../model'
import { dateTime, runtimeLabel, texts } from '../i18n'
import { useDragScroll } from '../drag-scroll'
import { openTaskExecution } from '../execution-navigation'
import type { PipelineGraph } from './bridge'
import type { PipelineTexts } from './i18n'

/** Timeline lengths use observed execution timestamps only; unknown terminal times are not extended to now. */
export function ExecutionTimeline({
    graph,
    locale,
    t,
    lane,
    now,
    onError
}: {
    graph: PipelineGraph
    locale: string
    t: PipelineTexts
    lane: string
    now: number
    onError: (error: string) => void
}) {
    const [windowMs, setWindowMs] = useState(graph.historical ? 0 : 3600000)
    const [busy, setBusy] = useState<string | null>(null)
    const viewport = useRef<HTMLDivElement>(null)
    const [viewportWidth, setViewportWidth] = useState(900)
    useDragScroll(viewport)
    useEffect(() => {
        const element = viewport.current
        if (!element) return
        const observer = new ResizeObserver(() => setViewportWidth(element.clientWidth))
        observer.observe(element)
        return () => observer.disconnect()
    }, [])
    useEffect(() => {
        if (viewport.current) viewport.current.scrollLeft = 0
    }, [windowMs, graph.instance.id])
    useEffect(() => {
        setWindowMs(graph.historical ? 0 : 3600000)
    }, [graph.roundId])
    const rows = pipelineExecutions(
        graph,
        graph.nodes.filter((node) => !lane || node.projection.laneKey === lane)
    ).map((attempt) => {
        const times = attemptTimes(attempt)
        const start = times.start ? Date.parse(times.start) : null
        const observedEnd = times.end ? Date.parse(times.end) : null
        const state = attempt.invocationStatus ?? attempt.runtimeStatus ?? attempt.status
        const live = ['running', 'waiting', 'cancelling'].includes(state)
        return {
            attempt,
            start,
            end: observedEnd ?? (live ? now : start),
            state,
            task: graph.tasks.tasks.find((task) => task.id === attempt.taskId)!
        }
    })
    const start = windowMs
        ? now - windowMs
        : Math.min(now - 60000, ...rows.flatMap((row) => (row.start === null ? [] : [row.start])))
    const lastObserved = Math.max(start + 60_000, ...rows.flatMap((row) => (row.end === null ? [] : [row.end])))
    const end = windowMs ? now : lastObserved + Math.max(5000, (lastObserved - start) * 0.05)
    const duration = Math.max(1, end - start),
        width = Math.max(360, viewportWidth - 240)
    const visible = rows.filter((row) => row.start === null || ((row.end ?? row.start) >= start && row.start <= end))
    const open = async (id: string) => {
        setBusy(id)
        try {
            await openTaskExecution(id, t.navigationError)
        } catch (error) {
            onError(error instanceof Error ? error.message : t.navigationError)
        } finally {
            setBusy(null)
        }
    }
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b px-3 py-2">
                {[
                    { value: 3600000, label: t.latestHour },
                    { value: 86400000, label: t.latestDay },
                    { value: 0, label: t.allTime }
                ].map((item) => (
                    <Button
                        key={item.value}
                        variant={windowMs === item.value ? 'secondary' : 'ghost'}
                        size="sm"
                        onClick={() => setWindowMs(item.value)}
                    >
                        {item.label}
                    </Button>
                ))}
            </div>
            <div ref={viewport} className="min-h-0 flex-1 overflow-auto">
                {!visible.length ? (
                    <p className="p-8 text-center text-sm text-muted-foreground">
                        {rows.length ? t.noMatch : t.noAttempts}
                    </p>
                ) : (
                    <div style={{ width: width + 240 }} className="relative">
                        <div className="sticky top-0 z-20 flex h-10 border-b bg-background text-xs text-muted-foreground">
                            <span style={{ width: 240 }} className="sticky left-0 shrink-0 bg-background px-4 py-3">
                                {t.attempts}
                            </span>
                            <div className="flex flex-1 justify-between px-2 py-3">
                                {[0, 1, 2, 3, 4].map((tick) => (
                                    <span key={tick}>
                                        {tick === 4 && end === now
                                            ? t.now
                                            : dateTime(
                                                  new Date(start + (duration * tick) / 4).toISOString(),
                                                  locale,
                                                  true
                                              )}
                                    </span>
                                ))}
                            </div>
                        </div>
                        {visible
                            .sort((a, b) => a.task.id.localeCompare(b.task.id) || a.attempt.attempt - b.attempt.attempt)
                            .map((row) => {
                                const canOpen = !!(row.attempt.invocationId || row.attempt.agentExecutionId)
                                const left =
                                    row.start === null ? 0 : Math.max(0, (row.start - start) / duration) * width
                                const barWidth =
                                    row.start === null
                                        ? 0
                                        : Math.max(
                                              8,
                                              ((Math.min(end, row.end ?? row.start) - Math.max(start, row.start)) /
                                                  duration) *
                                                  width
                                          )
                                return (
                                    <div key={row.attempt.id} className="relative flex h-24 border-b">
                                        <div
                                            style={{ width: 240 }}
                                            className="sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-2 border-r bg-background"
                                        >
                                            <p className="truncate px-3 text-sm" title={row.task.title}>
                                                {row.task.title} · #{row.attempt.attempt}
                                            </p>
                                            <Assignee
                                                task={row.task}
                                                attempts={[row.attempt]}
                                                t={texts(locale)}
                                                locale={locale}
                                                onError={onError}
                                            />
                                        </div>
                                        <div className="relative flex-1">
                                            {row.start === null ? (
                                                <span className="absolute left-4 top-8 text-xs text-muted-foreground">
                                                    {t.unknownTime} · {runtimeLabel(row.state, texts(locale))}
                                                </span>
                                            ) : (
                                                <button
                                                    disabled={!canOpen || !!busy}
                                                    onClick={() => void open(row.attempt.id)}
                                                    title={`${row.task.title} · ${runtimeLabel(row.state, texts(locale))} · ${dateTime(new Date(row.start).toISOString(), locale)} → ${row.end === null ? '—' : dateTime(new Date(row.end).toISOString(), locale)}`}
                                                    aria-label={`${t.openExecution}: ${row.task.title} #${row.attempt.attempt}`}
                                                    className={cn(
                                                        'absolute top-7 h-10 overflow-hidden rounded-lg border px-2 text-left text-xs focus-visible:outline-ring disabled:cursor-default',
                                                        ['failed', 'error'].includes(row.state)
                                                            ? 'border-destructive/40 bg-destructive/10 text-destructive'
                                                            : ['running', 'waiting'].includes(row.state)
                                                              ? 'border-primary/40 bg-primary/10 text-primary'
                                                              : 'border-border bg-muted text-muted-foreground'
                                                    )}
                                                    style={{ left, width: barWidth }}
                                                >
                                                    {runtimeLabel(row.state, texts(locale))}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                    </div>
                )}
            </div>
        </div>
    )
}
