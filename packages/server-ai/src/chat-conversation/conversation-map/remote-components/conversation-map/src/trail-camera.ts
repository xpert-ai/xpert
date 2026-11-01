export type Point = { x: number; y: number }
export type TrailBounds = Point & { width: number; height: number }

/** Fit rendered geometry and labels, excluding the layout's reserved empty canvas. */
export function fitTrailBounds(bounds: TrailBounds, width: number, height: number, zoom = 1) {
    if (width <= 0 || height <= 0) return { x: 0, y: 0, scale: 0 }
    const padding = Math.min(32, width / 4, height / 4)
    const scale =
        Math.min(
            1.5,
            (width - padding * 2) / Math.max(1, bounds.width),
            (height - padding * 2) / Math.max(1, bounds.height)
        ) * zoom
    return {
        x: width / 2 - (bounds.x + bounds.width / 2) * scale,
        y: height / 2 - (bounds.y + bounds.height / 2) * scale,
        scale
    }
}

/** Keep the same scale: only translate a selected leaf when it is outside the unobscured canvas. */
export function revealTrailPoint(point: Point, width: number, height: number): Point {
    if (width < 120 || height < 100) return { x: 0, y: 0 }
    const margin = 36
    return {
        x: point.x < margin || point.x > width - margin ? width / 2 - point.x : 0,
        y: point.y < margin || point.y > height - margin ? height / 2 - point.y : 0
    }
}
