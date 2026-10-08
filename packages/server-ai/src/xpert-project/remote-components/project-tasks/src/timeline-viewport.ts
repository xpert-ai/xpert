export const MIN_TIMELINE_WIDTH = 240
export const MAX_TIMELINE_WIDTH = 96000

export function zoomTimelineWidth(width: number, direction: 'in' | 'out') {
    return Math.min(MAX_TIMELINE_WIDTH, Math.max(MIN_TIMELINE_WIDTH, width * (direction === 'in' ? 1.25 : 0.8)))
}

export type TimelineGeometry = {
    start: number
    end: number
    width: number
    columns: number
    viewport: number
    pinned: boolean
}

export function timelineAnchor(geometry: TimelineGeometry, scrollLeft: number) {
    const { start, end, width, columns, viewport, pinned } = geometry
    const screenX = pinned ? columns + (viewport - columns) / 2 : viewport / 2
    const fraction = Math.max(0, Math.min(1, (scrollLeft + screenX - columns) / width))
    return { time: start + fraction * (end - start), screenX }
}

export function timelineScrollLeft(geometry: TimelineGeometry, anchor: { time: number; screenX: number }) {
    const { start, end, width, columns, viewport } = geometry
    const position = columns + ((anchor.time - start) / (end - start)) * width - anchor.screenX
    return Math.max(0, Math.min(Math.max(0, columns + width - viewport), position))
}
