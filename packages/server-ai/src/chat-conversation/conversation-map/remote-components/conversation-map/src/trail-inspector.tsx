import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown, ChevronRight, Crosshair, GitBranch, X } from 'lucide-react'
import { Button } from '@xpert-ai/shadcn-ui'
import type { TrailGraph, TrailStep } from '../../../../../../../contracts/src/ai/conversation-trail.model'
import type { TrailLabels } from './trail-i18n'

/** Non-modal: the canvas stays interactive and keeps its full width behind this card. */
export function TrailInspector({
    graph,
    open,
    selected,
    collapsed,
    panelRef,
    labels: l,
    locale,
    locateLabel,
    close,
    clear,
    select,
    fold,
    focusTree,
    inspect,
    locate
}: {
    graph: TrailGraph
    open: boolean
    selected?: string
    collapsed: ReadonlySet<string>
    panelRef: React.RefObject<HTMLElement>
    labels: TrailLabels
    locale: string
    locateLabel: string
    close: () => void
    clear: () => void
    select: (step: TrailStep) => void
    fold: (laneId: string) => void
    focusTree: (step: TrailStep) => void
    inspect: (step: TrailStep) => void
    locate: (step: TrailStep) => void
}) {
    const listRef = useRef<HTMLDivElement>(null)
    const detailRef = useRef<HTMLElement>(null)
    const [closedLanes, setClosedLanes] = useState(new Set<string>())
    const [openEpisodes, setOpenEpisodes] = useState(
        () => new Set(graph.layer === 'conversation' ? graph.episodes.map((episode) => episode.id) : [])
    )
    const step = graph.steps.find((item) => item.id === selected)
    const laneId = step?.laneId
    const episodeId = graph.episodes.find((episode) => episode.stepIds.includes(selected ?? ''))?.id
    const byId = new Map(graph.steps.map((item) => [item.id, item]))
    useEffect(() => {
        if (panelRef.current) panelRef.current.inert = !open
        if (open) panelRef.current?.focus({ preventScroll: true })
    }, [open, panelRef])
    useEffect(() => {
        if (!open || !selected) return
        setClosedLanes((old) => {
            const next = new Set(old)
            if (laneId) next.delete(laneId)
            return next
        })
        setOpenEpisodes((old) => {
            const next = new Set(old)
            if (episodeId) next.add(episodeId)
            return next
        })
    }, [selected, laneId, episodeId, open])
    useLayoutEffect(() => {
        if (!open) return
        const list = listRef.current
        const row = list?.querySelector<HTMLElement>('[data-selected="true"]')
        if (!list || !row) return
        const box = list.getBoundingClientRect(),
            target = row.getBoundingClientRect()
        if (target.top < box.top || target.bottom > box.bottom)
            list.scrollTo({ top: list.scrollTop + target.top - box.top - (box.height - target.height) / 2 })
    }, [selected, open, closedLanes, openEpisodes])
    useLayoutEffect(() => {
        detailRef.current?.scrollTo({ top: 0 })
    }, [selected])
    const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
        set((old) => {
            const next = new Set(old)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    return (
        <aside
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label={l.list}
            aria-hidden={!open}
            tabIndex={-1}
            data-testid="trail-inspector"
            className={`absolute inset-y-3 right-3 z-20 flex w-[min(420px,calc(100%_-_1.5rem))] min-h-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xl outline-none motion-safe:transition-[transform,opacity] motion-safe:duration-200 ${open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-[calc(100%_+_1rem)] opacity-0'}`}
        >
            <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
                <h3 className="flex-1 text-sm font-semibold">
                    {l.list} <span className="ml-1 font-normal text-muted-foreground">{graph.steps.length}</span>
                </h3>
                <Button size="icon-sm" variant="ghost" aria-label={l.closePanel} title={l.closePanel} onClick={close}>
                    <X aria-hidden />
                </Button>
            </header>
            <div
                ref={listRef}
                className="min-h-0 flex-1 overflow-auto overscroll-contain p-3"
                role="region"
                aria-label={l.list}
            >
                {graph.lanes.map((lane) => (
                    <section key={lane.id} className="mb-2 rounded-md border bg-background/50 p-1">
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                className="min-w-0 flex-1 justify-start"
                                aria-expanded={!closedLanes.has(lane.id)}
                                onClick={() => toggle(setClosedLanes, lane.id)}
                            >
                                {closedLanes.has(lane.id) ? <ChevronRight aria-hidden /> : <ChevronDown aria-hidden />}
                                <span className="min-w-0 flex-1 truncate text-left">
                                    {lane.title || (lane.primary ? l.main : l.unknownAgent)}
                                </span>
                                <span className="text-xs text-muted-foreground">{l[lane.status]}</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`${collapsed.has(lane.id) ? l.expandTree : l.foldTree}: ${lane.title || l.main}`}
                                title={collapsed.has(lane.id) ? l.expandTree : l.foldTree}
                                aria-pressed={collapsed.has(lane.id)}
                                onClick={() => fold(lane.id)}
                            >
                                <GitBranch aria-hidden />
                            </Button>
                        </div>
                        {!closedLanes.has(lane.id) && (
                            <>
                                {lane.outcome && (
                                    <details className="mx-3 my-2 text-xs text-muted-foreground">
                                        <summary className="cursor-pointer">{l.outcome}</summary>
                                        <p className="mt-2 whitespace-pre-wrap break-words">
                                            {lane.outcome.message || lane.outcome.status}
                                        </p>
                                    </details>
                                )}
                                {graph.episodes
                                    .filter((episode) => episode.laneId === lane.id)
                                    .map((episode) => (
                                        <div key={episode.id} className="ml-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full justify-start text-muted-foreground"
                                                aria-expanded={openEpisodes.has(episode.id)}
                                                onClick={() => toggle(setOpenEpisodes, episode.id)}
                                            >
                                                {openEpisodes.has(episode.id) ? (
                                                    <ChevronDown aria-hidden />
                                                ) : (
                                                    <ChevronRight aria-hidden />
                                                )}
                                                {l[episode.activity]}{' '}
                                                <span className="ml-auto">{episode.stepIds.length}</span>
                                            </Button>
                                            {openEpisodes.has(episode.id) &&
                                                episode.stepIds.map((id) => {
                                                    const item = byId.get(id)
                                                    return (
                                                        item && (
                                                            <Button
                                                                key={id}
                                                                variant={id === selected ? 'secondary' : 'ghost'}
                                                                aria-pressed={id === selected}
                                                                data-selected={id === selected}
                                                                className="flex h-auto min-h-10 w-full justify-start gap-2 whitespace-normal rounded-md px-3 py-2 text-left"
                                                                onClick={() => select(item)}
                                                            >
                                                                <span
                                                                    className={`shrink-0 text-xs ${item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
                                                                >
                                                                    {l[item.status]}
                                                                </span>
                                                                <span className="line-clamp-2 min-w-0 flex-1 break-words">
                                                                    {item.title || l.noTitle}
                                                                </span>
                                                            </Button>
                                                        )
                                                    )
                                                })}
                                        </div>
                                    ))}
                            </>
                        )}
                    </section>
                ))}
                {!graph.steps.length && <p className="p-3 text-sm text-muted-foreground">{l.empty}</p>}
                {!!graph.coverage.length && (
                    <details className="px-2 py-3 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">{l.details}</summary>
                        <ul className="mt-2 list-disc space-y-2 pl-4">
                            {graph.coverage.map((code) => (
                                <li key={code}>{l[code]}</li>
                            ))}
                        </ul>
                    </details>
                )}
            </div>
            {step && (
                <section
                    ref={detailRef}
                    className="max-h-[55%] shrink-0 overflow-auto overscroll-contain border-t bg-muted/30 p-4"
                    aria-label={l.details}
                >
                    <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <p className="mb-1 truncate text-xs text-muted-foreground">
                                {graph.lanes.find((lane) => lane.id === step.laneId)?.title} / {l[step.activity]}
                            </p>
                            <h4 className="break-words text-sm font-semibold">{step.title || l.noTitle}</h4>
                        </div>
                        <Button size="icon-sm" variant="ghost" aria-label={l.close} title={l.close} onClick={clear}>
                            <X aria-hidden />
                        </Button>
                    </div>
                    <p
                        className={`mt-2 text-xs ${step.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
                    >
                        {l[step.status]}
                    </p>
                    {step.startedAt && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(step.startedAt).toLocaleString(locale.replaceAll('_', '-'))}
                        </p>
                    )}
                    <div className="my-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => focusTree(step)}>
                            <Crosshair aria-hidden />
                            {l.focusTree}
                        </Button>
                        {graph.layer === 'conversation' && step.answer !== undefined && (
                            <Button size="sm" onClick={() => inspect(step)}>
                                {l.inspect}
                            </Button>
                        )}
                        {step.messageId && (
                            <Button size="sm" variant="outline" onClick={() => locate(step)}>
                                {locateLabel}
                                <ArrowUpRight aria-hidden />
                            </Button>
                        )}
                    </div>
                    {[step.preview, step.answer].filter(Boolean).map((text, index) => (
                        <p key={index} className="mt-3 whitespace-pre-wrap break-words text-sm">
                            {text}
                        </p>
                    ))}
                    {(
                        [
                            ['input', step.input],
                            ['output', step.output]
                        ] as const
                    ).map(
                        ([kind, text]) =>
                            text && (
                                <details key={kind} className="mt-3 rounded-md border bg-background p-3">
                                    <summary className="cursor-pointer text-sm font-medium">{l[kind]}</summary>
                                    <pre className="mt-2 whitespace-pre-wrap break-all text-xs">{text}</pre>
                                </details>
                            )
                    )}
                </section>
            )}
        </aside>
    )
}
