import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { Button, Separator } from '@xpert-ai/shadcn-ui'
import { useDragScroll } from '../drag-scroll'
import { saveTaskViewState, type PipelineFocus } from '../bridge'
import type { PipelineTexts } from './i18n'

const minimum = 0.1,
    maximum = 2
const clamp = (scale: number) => Math.max(minimum, Math.min(maximum, scale))

/** Keep controls outside the scaled canvas and preserve the viewport's center when zooming. */
export function PipelineViewport({
    status,
    viewport,
    width,
    height,
    t,
    initialScroll,
    focusNode,
    children
}: {
    status?: ReactNode
    viewport: RefObject<HTMLDivElement>
    width: number
    height: number
    t: PipelineTexts
    initialScroll?: PipelineFocus
    focusNode?: string | null
    children: ReactNode
}) {
    const [scale, setScale] = useState(() => clamp(initialScroll?.pipelineScale ?? 1))
    const [fitting, setFitting] = useState(false)
    const position = useRef<{ left: number; top: number } | null>(null)
    useDragScroll(viewport)
    useLayoutEffect(() => {
        const element = viewport.current
        if (element && !focusNode) {
            element.scrollLeft = initialScroll?.scrollLeft ?? 0
            element.scrollTop = initialScroll?.scrollTop ?? 0
        }
    }, [])
    useLayoutEffect(() => {
        const element = viewport.current
        if (!element) return
        if (position.current) {
            element.scrollLeft = position.current.left
            element.scrollTop = position.current.top
            position.current = null
        }
        saveTaskViewState({ pipelineScale: scale, scrollLeft: element.scrollLeft, scrollTop: element.scrollTop })
    }, [scale, fitting])
    useLayoutEffect(() => {
        const element = viewport.current
        if (!fitting || !element) return
        const fit = () => {
            if (!element.clientWidth || !element.clientHeight) return
            position.current = { left: 0, top: 0 }
            element.scrollLeft = element.scrollTop = 0
            setScale(clamp(Math.min(1, (element.clientWidth - 16) / width, (element.clientHeight - 16) / height)))
        }
        fit()
        const observer = new ResizeObserver(fit)
        observer.observe(element)
        return () => observer.disconnect()
    }, [fitting, width, height])
    const zoom = (value: number) => {
        const next = clamp(value)
        const element = viewport.current
        if (element)
            position.current = {
                left: Math.max(
                    0,
                    ((element.scrollLeft + element.clientWidth / 2) * next) / scale - element.clientWidth / 2
                ),
                top: Math.max(
                    0,
                    ((element.scrollTop + element.clientHeight / 2) * next) / scale - element.clientHeight / 2
                )
            }
        setFitting(false)
        setScale(next)
    }
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-4 border-b bg-background px-3 py-0.5">
                {status}
                <div role="group" aria-label={t.zoom} className="ml-auto flex shrink-0 items-center gap-0.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.zoomOut}
                        title={t.zoomOut}
                        disabled={scale <= minimum}
                        onClick={() => zoom(scale - 0.1)}
                    >
                        <Minus className="size-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="tabular-nums"
                        aria-label={t.resetZoom}
                        title={t.resetZoom}
                        onClick={() => zoom(1)}
                    >
                        {Math.round(scale * 100)}%
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.zoomIn}
                        title={t.zoomIn}
                        disabled={scale >= maximum}
                        onClick={() => zoom(scale + 0.1)}
                    >
                        <Plus className="size-3.5" />
                    </Button>
                    <Separator orientation="vertical" className="mx-1 h-4" />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-pressed={fitting}
                        onClick={() => setFitting(true)}
                    >
                        <Maximize className="size-3.5" />
                        {t.fitView}
                    </Button>
                </div>
            </div>
            <div
                ref={viewport}
                aria-label={t.stages}
                className="min-h-0 flex-1 overflow-auto overscroll-contain data-[panning=true]:cursor-grabbing"
                onScroll={(event) =>
                    saveTaskViewState({
                        scrollLeft: event.currentTarget.scrollLeft,
                        scrollTop: event.currentTarget.scrollTop
                    })
                }
            >
                {/* CSS zoom scales scroll geometry and sticky headers together, without a phantom unscaled scroll area. */}
                <div style={{ zoom: scale, width, height }}>{children}</div>
            </div>
        </div>
    )
}
