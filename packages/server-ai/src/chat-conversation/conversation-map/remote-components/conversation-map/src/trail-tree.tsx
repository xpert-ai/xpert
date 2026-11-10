import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@xpert-ai/shadcn-ui'
import { Minus, Plus, Scan } from 'lucide-react'
import type { TrailGraph, TrailStep } from '../../../../../../../contracts/src/ai/conversation-trail.model'
import { layoutTrail } from './trail-layout'
import { fitTrailBounds, revealTrailPoint, type TrailBounds } from './trail-camera'
import { ActivityGlyph } from './trail-glyph'
import { TrailLegend } from './trail-legend'
import type { TrailLabels } from './trail-i18n'

export function TrailTree({
    graph,
    collapsed,
    selected,
    select,
    focusRequest,
    panelOpen,
    panelRef,
    labels: l,
    showStatus = true
}: {
    graph: TrailGraph
    collapsed: ReadonlySet<string>
    selected?: string
    select: (step: TrailStep) => void
    focusRequest?: { id: string; revision: number }
    panelOpen: boolean
    panelRef: React.RefObject<HTMLElement>
    labels: TrailLabels
    /** Public message projections have no execution status; hide status glyphs and labels. */
    showStatus?: boolean
}) {
    const drawing = useMemo(() => layoutTrail(graph, collapsed), [graph, collapsed])
    const maskId = useId().replaceAll(':', '')
    const [zoom, setZoom] = useState(1)
    const [fitBesidePanel, setFitBesidePanel] = useState(false)
    useEffect(() => {
        if (!panelOpen) setFitBesidePanel(false)
    }, [panelOpen])
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [size, setSize] = useState({ width: 0, height: 0, panelWidth: 0 })
    const viewportRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<SVGGElement>(null)
    const [measurement, setMeasurement] = useState<{
        drawing: typeof drawing
        labels: TrailLabels
        bounds: TrailBounds
    }>()
    const bounds = measurement?.drawing === drawing && measurement.labels === l ? measurement.bounds : undefined
    const drag = useRef<{ x: number; y: number; panX: number; panY: number }>()
    const lastFocus = useRef('')
    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return
        const observer = new ResizeObserver(() =>
            setSize({
                width: viewport.clientWidth,
                height: viewport.clientHeight,
                panelWidth: panelRef.current?.getBoundingClientRect().width ?? 0
            })
        )
        observer.observe(viewport)
        if (panelRef.current) observer.observe(panelRef.current)
        return () => observer.disconnect()
    }, [panelRef])
    const measure = useCallback(() => {
        const box = contentRef.current?.getBBox()
        if (!box || !box.width || !box.height) return
        setMeasurement((old) =>
            old?.drawing === drawing &&
            old.labels === l &&
            old.bounds.x === box.x &&
            old.bounds.y === box.y &&
            old.bounds.width === box.width &&
            old.bounds.height === box.height
                ? old
                : { drawing, labels: l, bounds: { x: box.x, y: box.y, width: box.width, height: box.height } }
        )
    }, [drawing, l])
    useLayoutEffect(() => {
        let active = true
        measure()
        void document.fonts.ready.then(() => {
            if (active) measure()
        })
        return () => {
            active = false
        }
    }, [measure])
    // Keep the full canvas on narrow screens, where the inspector covers almost all of it.
    const remainingWidth = size.width - size.panelWidth - 24
    const usableWidth =
        fitBesidePanel && panelOpen && size.panelWidth > 0 && remainingWidth >= 240 ? remainingWidth : size.width
    const base = fitTrailBounds(
        bounds ?? { x: 0, y: 0, width: drawing.width, height: drawing.height },
        usableWidth,
        size.height,
        zoom
    )
    const scale = base.scale
    const point = drawing.marks.find((mark) => mark.step.id === focusRequest?.id)
    useLayoutEffect(() => {
        const requestKey = focusRequest && `${focusRequest.id}:${focusRequest.revision}`
        if (!requestKey || lastFocus.current === requestKey || !point || !bounds || !size.width || !size.height) return
        lastFocus.current = requestKey
        const viewport = viewportRef.current?.getBoundingClientRect()
        const panel = panelOpen ? panelRef.current?.getBoundingClientRect() : undefined
        const width =
            panel && viewport ? Math.max(0, Math.min(size.width, panel.left - viewport.left - 12)) : size.width
        setPan((current) => {
            const delta = revealTrailPoint(
                { x: base.x + current.x + point.x * scale, y: base.y + current.y + point.y * scale },
                width,
                size.height
            )
            return { x: current.x + delta.x, y: current.y + delta.y }
        })
    }, [focusRequest, point, size, bounds, scale, base.x, base.y, panelOpen, panelRef])
    const fit = () => {
        measure()
        setFitBesidePanel(panelOpen)
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }
    const activeLane = graph.steps.find((step) => step.id === selected)?.laneId
    const active = new Set<string>()
    let lane = activeLane
    while (lane && !active.has(lane)) {
        active.add(lane)
        lane = graph.lanes.find((item) => item.id === lane)?.parentId ?? undefined
    }
    return (
        <div className="relative min-h-0 min-w-0 flex-1" data-testid="trail-tree">
            <div className="pointer-events-none absolute inset-y-3 left-3 z-10 flex w-56 max-w-[calc(100%_-_1.5rem)] flex-col items-start gap-2">
                <div className="pointer-events-auto flex shrink-0 gap-1 rounded-lg border bg-card p-1 shadow-sm">
                    {[
                        { label: l.zoomOut, Icon: Minus, action: () => setZoom((n) => Math.max(0.5, n / 1.3)) },
                        { label: l.fit, Icon: Scan, action: fit },
                        { label: l.zoomIn, Icon: Plus, action: () => setZoom((n) => Math.min(8, n * 1.3)) }
                    ].map(({ label, Icon, action }) => (
                        <Tooltip key={label}>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={label} onClick={action}>
                                    <Icon aria-hidden />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" sideOffset={6}>
                                {label}
                            </TooltipContent>
                        </Tooltip>
                    ))}
                </div>
                <TrailLegend layer={graph.layer} labels={l} />
            </div>
            <div
                ref={viewportRef}
                className="absolute inset-0 touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                tabIndex={0}
                aria-label={l.pan}
                data-testid="trail-viewport"
                onPointerDown={(event) => {
                    if (
                        event.button !== 0 ||
                        (event.target instanceof Element && event.target.closest('[role="button"]'))
                    )
                        return
                    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
                    event.currentTarget.setPointerCapture(event.pointerId)
                    event.currentTarget.focus({ preventScroll: true })
                }}
                onPointerMove={(event) => {
                    if (drag.current)
                        setPan({
                            x: drag.current.panX + event.clientX - drag.current.x,
                            y: drag.current.panY + event.clientY - drag.current.y
                        })
                }}
                onPointerUp={() => {
                    drag.current = undefined
                }}
                onPointerCancel={() => {
                    drag.current = undefined
                }}
                onLostPointerCapture={() => {
                    drag.current = undefined
                }}
                onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return
                    const directions: { [key: string]: { x: number; y: number } } = {
                        ArrowLeft: { x: 48, y: 0 },
                        ArrowRight: { x: -48, y: 0 },
                        ArrowUp: { x: 0, y: 48 },
                        ArrowDown: { x: 0, y: -48 }
                    }
                    const direction = directions[event.key]
                    if (direction) {
                        event.preventDefault()
                        setPan((old) => ({ x: old.x + direction.x, y: old.y + direction.y }))
                    }
                    if (event.key === 'Home') {
                        event.preventDefault()
                        fit()
                    }
                }}
            >
                <svg
                    className="block h-full w-full cursor-grab active:cursor-grabbing"
                    role="group"
                    aria-label={graph.layer === 'conversation' ? l.discussionLegend : l.executionLegend}
                >
                    <defs>
                        {drawing.paths.map(
                            (shape, index) =>
                                shape.uncertain && (
                                    <mask
                                        key={shape.id}
                                        id={`${maskId}-${index}`}
                                        maskUnits="userSpaceOnUse"
                                        x={0}
                                        y={0}
                                        width={drawing.width}
                                        height={drawing.height}
                                        style={{ maskType: 'alpha' }}
                                    >
                                        <path
                                            d={shape.path}
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={shape.width + 2}
                                            strokeDasharray="7 5"
                                            strokeLinecap="butt"
                                        />
                                    </mask>
                                )
                        )}
                    </defs>
                    <g
                        ref={contentRef}
                        data-testid="trail-camera"
                        transform={`translate(${base.x + pan.x} ${base.y + pan.y}) scale(${scale})`}
                    >
                        {drawing.paths.map((shape, index) => (
                            <path
                                key={shape.id}
                                d={shape.outline}
                                fill="currentColor"
                                mask={shape.uncertain ? `url(#${maskId}-${index})` : undefined}
                                className={active.has(shape.laneId) ? 'text-primary' : 'text-foreground'}
                                opacity={active.size && !active.has(shape.laneId) ? 0.3 : 1}
                            />
                        ))}
                        {drawing.episodes.map((episode) => (
                            <g key={episode.id} className="text-muted-foreground" pointerEvents="none">
                                <ActivityGlyph activity={episode.activity} x={episode.x} y={episode.y} />
                                <text x={episode.x + 9} y={episode.y + 4} fontSize={12} fill="currentColor">
                                    {episode.number}
                                </text>
                            </g>
                        ))}
                        {drawing.marks.map(({ step, x, y, angle, junction }) => (
                            <g
                                key={step.id}
                                transform={`translate(${x} ${y}) rotate(${angle})`}
                                className={`cursor-pointer ${step.status === 'error' ? 'text-destructive' : step.id === selected ? 'text-primary' : 'text-foreground'}`}
                                role="button"
                                tabIndex={0}
                                aria-label={`${step.title || l[step.activity]}${showStatus ? ` — ${l[step.status]}` : ''}`}
                                aria-pressed={step.id === selected}
                                data-step-id={step.id}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault()
                                        select(step)
                                    }
                                }}
                                onClick={() => select(step)}
                            >
                                <title>{`${step.title || l[step.activity]}${showStatus ? ` — ${l[step.status]}` : ''}`}</title>
                                <circle r={16} fill="transparent" />
                                {junction ? (
                                    <circle r={2.5} fill="currentColor" />
                                ) : (
                                    <>
                                        <path d="M0 0L0 -14" stroke="currentColor" strokeWidth={1.2} />
                                        {showStatus && step.status === 'error' ? (
                                            <path
                                                d="M-4 -20L4 -12M4 -20L-4 -12"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                            />
                                        ) : showStatus &&
                                          step.kind !== 'turn' &&
                                          ['unknown', 'running', 'pending', 'waiting', 'cancelling'].includes(
                                              step.status
                                          ) ? (
                                            <circle
                                                cy={-17}
                                                r={4}
                                                fill="var(--background)"
                                                stroke="currentColor"
                                                strokeDasharray={step.status === 'running' ? '2 2' : undefined}
                                            />
                                        ) : (
                                            <path d="M0 -12Q-8 -21 0 -27Q8 -21 0 -12Z" fill="currentColor" />
                                        )}
                                    </>
                                )}
                                {step.id === selected && (
                                    <circle
                                        cy={junction ? 0 : -17}
                                        r={junction ? 9 : 11}
                                        fill="none"
                                        stroke="var(--primary)"
                                        strokeWidth={2}
                                    />
                                )}
                            </g>
                        ))}
                        {drawing.tips.map(({ lane, x, y }) => (
                            <g key={lane.id}>
                                <circle
                                    cx={x}
                                    cy={y}
                                    r={5}
                                    fill="var(--background)"
                                    stroke={
                                        lane.status === 'error' || lane.outcome?.accepted === false
                                            ? 'var(--destructive)'
                                            : 'var(--foreground)'
                                    }
                                    strokeWidth={2}
                                />
                                <text x={x + 14} y={y - 4} fontSize={14} fill="var(--foreground)">
                                    {(lane.title || (lane.primary ? l.main : l.branch)).slice(0, 24)}
                                </text>
                                {showStatus && (
                                    <text x={x + 14} y={y + 15} fontSize={12} fill="var(--muted-foreground)">
                                        {l[lane.status]}
                                        {lane.elapsedMs === undefined
                                            ? ''
                                            : ` / ${(lane.elapsedMs / 1000).toFixed(1)} s`}
                                    </text>
                                )}
                                {lane.outcome && (
                                    <text
                                        x={x + 14}
                                        y={y + 34}
                                        fontSize={12}
                                        fill={lane.outcome.accepted ? 'var(--muted-foreground)' : 'var(--destructive)'}
                                    >
                                        {l.outcome}: {(lane.outcome.message || lane.outcome.status).slice(0, 24)}
                                    </text>
                                )}
                            </g>
                        ))}
                    </g>
                </svg>
            </div>
            <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-muted-foreground">{l.pan}</p>
        </div>
    )
}
