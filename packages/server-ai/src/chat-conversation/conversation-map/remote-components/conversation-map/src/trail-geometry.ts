export type Point = { x: number; y: number }
export type BranchSample = Point & { width: number }
export type TrailShape = {
    id: string
    laneId: string
    path: string
    outline: string
    samples: BranchSample[]
    width: number
    uncertain?: boolean
}

export function cubicPoint(a: Point, b: Point, c: Point, d: Point, t: number): Point {
    const s = 1 - t
    return {
        x: s ** 3 * a.x + 3 * s * s * t * b.x + 3 * s * t * t * c.x + t ** 3 * d.x,
        y: s ** 3 * a.y + 3 * s * s * t * b.y + 3 * s * t * t * c.y + t ** 3 * d.y
    }
}
export function cubicTangent(a: Point, b: Point, c: Point, d: Point, t: number): Point {
    const s = 1 - t
    return {
        x: 3 * s * s * (b.x - a.x) + 6 * s * t * (c.x - b.x) + 3 * t * t * (d.x - c.x),
        y: 3 * s * s * (b.y - a.y) + 6 * s * t * (c.y - b.y) + 3 * t * t * (d.y - c.y)
    }
}
export function sampleCubic(a: Point, b: Point, c: Point, d: Point): Point[] {
    return Array.from({ length: 41 }, (_, i) => cubicPoint(a, b, c, d, i / 40))
}
const coordinate = (p: Point) => `${Number(p.x.toFixed(3))},${Number(p.y.toFixed(3))}`

/** A closed ribbon gives SVG a real varying width, including smooth round ends. */
export function taperedShape(
    id: string,
    laneId: string,
    points: Point[],
    widthAt: (point: Point, progress: number) => number,
    uncertain = false
): TrailShape {
    const samples = points.map((point, i) => ({
        ...point,
        width: Math.max(0.25, widthAt(point, i / Math.max(1, points.length - 1)))
    }))
    const directions = samples.map((point, i) => {
        const before = samples[Math.max(0, i - 1)],
            after = samples[Math.min(samples.length - 1, i + 1)]
        const dx = after.x - before.x,
            dy = after.y - before.y
        const length = Math.hypot(dx, dy)
        return length ? { x: dx / length, y: dy / length } : { x: 1, y: 0 }
    })
    const edge = (side: number) =>
        samples.map((point, i) => ({
            x: point.x - (side * directions[i].y * point.width) / 2,
            y: point.y + (side * directions[i].x * point.width) / 2
        }))
    const left = edge(1),
        right = edge(-1)
    const first = samples[0],
        last = samples.at(-1)!
    const capStart = {
        x: first.x - (directions[0].x * first.width) / 2,
        y: first.y - (directions[0].y * first.width) / 2
    }
    const capEnd = {
        x: last.x + (directions.at(-1)!.x * last.width) / 2,
        y: last.y + (directions.at(-1)!.y * last.width) / 2
    }
    return {
        id,
        laneId,
        samples,
        uncertain,
        width: Math.max(...samples.map((point) => point.width)),
        path: `M${points.map(coordinate).join(' L')}`,
        outline: `M${left.map(coordinate).join(' L')} Q${coordinate(capEnd)} ${coordinate(right.at(-1)!)} L${right.slice(0, -1).reverse().map(coordinate).join(' L')} Q${coordinate(capStart)} ${coordinate(left[0])} Z`
    }
}
