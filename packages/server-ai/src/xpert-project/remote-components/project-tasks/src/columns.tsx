import { useRef, useState } from 'react'
import type { Texts } from './i18n'

export const columnDefaults = { name: 240, status: 152, assignee: 228, attempts: 90, dates: 240 }
export type Column = keyof typeof columnDefaults
const minimums: Record<Column, number> = { name: 120, status: 80, assignee: 120, attempts: 64, dates: 120 }

export function useTaskColumns() {
    const [widths, setWidths] = useState(columnDefaults)
    const resize = (column: Column, value: number) =>
        setWidths((previous) => ({ ...previous, [column]: Math.max(minimums[column], Math.min(800, value)) }))
    return { widths, resize }
}
export type TaskColumns = ReturnType<typeof useTaskColumns>

/** Pointer capture keeps dragging local to the handle; keyboard arrows offer the same adjustment. */
export function ColumnHeader({
    column,
    label,
    columns,
    t
}: {
    column: Column
    label: string
    columns: TaskColumns
    t: Texts
}) {
    const drag = useRef<{ pointer: number; x: number; width: number } | null>(null)
    const width = columns.widths[column]
    return (
        <div role="columnheader" className="relative flex h-full min-w-0 items-center px-3">
            <span className="truncate">{label}</span>
            <div
                role="separator"
                tabIndex={0}
                aria-label={`${t.resizeColumn}: ${label}`}
                aria-orientation="vertical"
                aria-valuemin={minimums[column]}
                aria-valuemax={800}
                aria-valuenow={width}
                title={`${t.resizeColumn}: ${label} · ${t.resetWidth}`}
                className="absolute inset-y-0 right-0 z-40 w-2 touch-none cursor-col-resize select-none outline-none after:absolute after:inset-y-2 after:right-0 after:w-px after:bg-border hover:after:w-0.5 hover:after:bg-primary focus-visible:after:w-0.5 focus-visible:after:bg-ring"
                onPointerDown={(event) => {
                    if (event.button !== 0) return
                    event.preventDefault()
                    drag.current = { pointer: event.pointerId, x: event.clientX, width }
                    event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                    const start = drag.current
                    if (start?.pointer === event.pointerId)
                        columns.resize(column, start.width + event.clientX - start.x)
                }}
                onPointerUp={(event) => {
                    drag.current = null
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                        event.currentTarget.releasePointerCapture(event.pointerId)
                }}
                onPointerCancel={() => {
                    drag.current = null
                }}
                onLostPointerCapture={() => {
                    drag.current = null
                }}
                onDoubleClick={() => columns.resize(column, columnDefaults[column])}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                        event.preventDefault()
                        columns.resize(
                            column,
                            width + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 40 : 10)
                        )
                    } else if (event.key === 'Home') {
                        event.preventDefault()
                        columns.resize(column, columnDefaults[column])
                    }
                }}
            />
        </div>
    )
}
