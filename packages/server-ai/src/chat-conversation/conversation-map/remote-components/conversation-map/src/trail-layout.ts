import type { TrailGraph, TrailLane, TrailStep } from '../../../../../../../contracts/src/ai/conversation-trail.model'
import { cubicPoint, cubicTangent, sampleCubic, taperedShape, type Point, type TrailShape } from './trail-geometry'
export type { Point, TrailShape } from './trail-geometry'
export type TrailMark = Point & { step: TrailStep; angle: number; junction: boolean }
export type TrailDrawing = {
    width: number
    height: number
    paths: TrailShape[]
    marks: TrailMark[]
    tips: Array<Point & { lane: TrailLane }>
    episodes: Array<Point & { id: string; number: number; activity: TrailStep['activity'] }>
}
type Twig = {
    id: string
    laneId: string
    activity: TrailStep['activity']
    number: number
    steps: TrailStep[]
    start: number
    length: number
    sign: number
}
type Placement = {
    lane: TrailLane
    start: number
    flat: number
    end: number
    y: number
    fromY: number
    anchored: boolean
    twigs: Twig[]
}

export function visibleTrailLanes(graph: TrailGraph, collapsed: ReadonlySet<string>) {
    const lanes = new Map(graph.lanes.map((lane) => [lane.id, lane]))
    return graph.lanes.filter((lane) => {
        const seen = new Set([lane.id])
        let parent = lane.parentId
        while (parent) {
            if (seen.has(parent) || collapsed.has(parent) || !lanes.has(parent)) return false
            seen.add(parent)
            parent = lanes.get(parent)?.parentId ?? null
        }
        return true
    })
}

/** Delegation anchors live on the owning stem. Layout never changes runtime ancestry to improve the silhouette. */
export function layoutTrail(graph: TrailGraph, collapsed: ReadonlySet<string> = new Set()): TrailDrawing {
    const valid = visibleTrailLanes(graph, new Set())
    const lanes = new Map(valid.map((lane) => [lane.id, lane]))
    const ordered: TrailLane[] = [],
        visited = new Set<string>()
    const visit = (lane: TrailLane) => {
        if (visited.has(lane.id)) return
        visited.add(lane.id)
        const parent = lane.parentId && lanes.get(lane.parentId)
        if (parent) visit(parent)
        ordered.push(lane)
    }
    valid.forEach(visit)
    const visible = visibleTrailLanes(graph, collapsed)
    const visibleIds = new Set(visible.map((lane) => lane.id))
    const steps = [...graph.steps].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    const byId = new Map(steps.map((step) => [step.id, step]))
    const byLane = new Map<string, TrailStep[]>()
    for (const step of steps) {
        const own = byLane.get(step.laneId) ?? []
        own.push(step)
        byLane.set(step.laneId, own)
    }
    const children = new Map<string, TrailLane[]>()
    for (const lane of ordered)
        if (lane.parentId) children.set(lane.parentId, [...(children.get(lane.parentId) ?? []), lane])
    const junctions = new Set(
        ordered.flatMap((lane) =>
            lane.spawnStepId && byId.get(lane.spawnStepId)?.laneId === lane.parentId ? [lane.spawnStepId] : []
        )
    )
    const spacing = graph.layer === 'conversation' ? 112 : Math.max(8, Math.min(26, 12000 / Math.max(1, steps.length)))
    const baseX = new Map(steps.map((step, i) => [step.id, 90 + i * spacing]))
    const xOf = new Map<string, number>(),
        ys = new Map<string, number>()
    const occupied = new Map<number, Array<{ start: number; end: number }>>()
    const placements = new Map<string, Placement>()
    for (const lane of ordered) {
        const own = byLane.get(lane.id) ?? []
        const parent = lane.parentId ? placements.get(lane.parentId) : undefined
        const anchored = !!parent && !!lane.spawnStepId && junctions.has(lane.spawnStepId)
        const start = parent
            ? anchored
                ? xOf.get(lane.spawnStepId!)!
                : Math.max(parent.flat, (baseX.get(own[0]?.id) ?? parent.end) - 60)
            : 36
        let y = 0
        if (!lane.primary) {
            const lastStep = own.at(-1)
            const last = Math.max(start + 160, lastStep ? (baseX.get(lastStep.id) ?? start) : start) + 360
            let row = 0
            do {
                row++
                y = (row % 2 ? -1 : 1) * Math.ceil(row / 2) * 240
            } while (
                y === parent?.y ||
                (occupied.get(y) ?? []).some((range) => start < range.end && last > range.start)
            )
            occupied.set(y, [...(occupied.get(y) ?? []), { start, end: last }])
        }
        ys.set(lane.id, y)
        const flat = start + (parent && parent.y !== y ? 125 : 0)
        const shift = Math.max(0, flat + 20 - (baseX.get(own[0]?.id) ?? flat + 20))
        for (const step of own) xOf.set(step.id, baseX.get(step.id)! + shift)
        const twigs: Twig[] = []
        for (const episode of graph.episodes.filter((item) => item.laneId === lane.id)) {
            let group: TrailStep[] = []
            const flush = () => {
                if (!group.length) return
                twigs.push({
                    id: `${episode.id}:${group[0].id}`,
                    laneId: lane.id,
                    activity: episode.activity,
                    number: 0,
                    steps: group,
                    start: Math.max(flat + 10, xOf.get(group[0].id)! - 12),
                    length: Math.max(48, Math.min(260, group.length * spacing)),
                    sign: -1
                })
                group = []
            }
            for (const id of episode.stepIds) {
                const step = byId.get(id)
                if (!step) continue
                if (junctions.has(id)) flush()
                else group.push(step)
            }
            flush()
        }
        const end = Math.max(
            flat + 80,
            ...own.map((step) => xOf.get(step.id)! + 55),
            ...twigs.map((twig) => twig.start + twig.length + 25)
        )
        placements.set(lane.id, { lane, start, flat, end, y, fromY: parent?.y ?? y, anchored, twigs })
        // A missing call anchor still attaches to the known parent, with an explicitly dashed limb.
        if (parent) parent.end = Math.max(parent.end, start + 20)
    }
    const twigs = [...placements.values()]
        .flatMap((placement) => placement.twigs)
        .sort((a, b) => a.steps[0].order - b.steps[0].order || a.id.localeCompare(b.id))
    twigs.forEach((twig, index) => {
        twig.number = index + 1
        twig.sign = index % 2 ? 1 : -1
    })
    // Selected discussion segments continue one trunk without a tapered tip between segments.
    if (graph.layer === 'conversation')
        for (const placement of placements.values()) {
            const continuation = (children.get(placement.lane.id) ?? []).find((lane) => lane.primary)
            if (continuation && placement.lane.primary) placement.end = placements.get(continuation.id)!.start
        }
    const mass = new Map<string, number>()
    for (const lane of [...ordered].reverse())
        mass.set(
            lane.id,
            Math.max(
                1,
                (byLane.get(lane.id)?.length ?? 0) +
                    (children.get(lane.id) ?? []).reduce((sum, child) => sum + mass.get(child.id)!, 0)
            )
        )
    const widths = new Map<string, (x: number) => number>()
    for (const lane of ordered) {
        const p = placements.get(lane.id)!
        const contributions = p.twigs.map((twig) => ({ x: twig.start, mass: twig.steps.length }))
        for (const step of byLane.get(lane.id) ?? [])
            if (junctions.has(step.id)) contributions.push({ x: xOf.get(step.id)!, mass: 1 })
        let carry = 0
        for (const child of children.get(lane.id) ?? []) {
            if (graph.layer === 'conversation' && lane.primary && child.primary) carry += mass.get(child.id)!
            else contributions.push({ x: placements.get(child.id)!.start, mass: mass.get(child.id)! })
        }
        if (!contributions.length && !carry) contributions.push({ x: p.start, mass: 1 })
        const raw = (x: number) => {
            const remaining = contributions.reduce((sum, item) => {
                const progress = Math.max(0, Math.min(1, (x - item.x) / 44))
                return sum + item.mass * (1 - progress * progress * (3 - 2 * progress))
            }, carry)
            const progress = Math.max(0, Math.min(1, (x - p.start) / Math.max(1, p.end - p.start)))
            return 0.8 + Math.min(14, 1.55 * Math.sqrt(remaining)) * (1 - 0.12 * progress)
        }
        const parentWidth = lane.parentId ? widths.get(lane.parentId)?.(p.start) : undefined
        const continuation =
            graph.layer === 'conversation' && lane.primary && !!lane.parentId && lanes.get(lane.parentId)?.primary
        const startWidth =
            parentWidth === undefined
                ? raw(p.start)
                : continuation
                  ? parentWidth
                  : Math.min(raw(p.start), parentWidth * 0.88)
        const scale = startWidth / raw(p.start)
        widths.set(lane.id, (x) => raw(x) * scale)
    }
    const offset = 150 - Math.min(0, ...visible.map((lane) => ys.get(lane.id) ?? 0))
    const height = Math.max(360, offset + Math.max(0, ...visible.map((lane) => ys.get(lane.id) ?? 0)) + 150)
    const paths: TrailShape[] = [],
        marks: TrailMark[] = [],
        tips: TrailDrawing['tips'] = [],
        episodes: TrailDrawing['episodes'] = []
    for (const lane of ordered) {
        if (!visibleIds.has(lane.id)) continue
        const p = placements.get(lane.id)!,
            y = p.y + offset,
            width = widths.get(lane.id)!
        const start = { x: p.start, y: p.fromY + offset },
            flat = { x: p.flat, y }
        const points =
            p.fromY !== p.y ? sampleCubic(start, { x: p.start + 50, y: start.y }, { x: p.flat - 50, y }, flat) : [start]
        const count = Math.max(1, Math.min(200, Math.ceil((p.end - p.flat) / 16)))
        const knots = [
            p.flat,
            p.end,
            ...Array.from({ length: count }, (_, i) => p.flat + ((p.end - p.flat) * (i + 1)) / count),
            ...p.twigs.flatMap((twig) => [twig.start, twig.start + 22, twig.start + 44]),
            ...(children.get(lane.id) ?? []).flatMap((child) => {
                const x = placements.get(child.id)!.start
                return [x, x + 22, x + 44]
            })
        ]
        for (const x of [...new Set(knots)].sort((a, b) => a - b))
            if (x > points.at(-1)!.x && x <= p.end) points.push({ x, y })
        paths.push(
            taperedShape(
                `lane:${lane.id}`,
                lane.id,
                points,
                (point) => width(point.x),
                graph.layer === 'execution' && !!lane.parentId && !p.anchored
            )
        )
        tips.push({ x: p.end, y, lane })
        if (collapsed.has(lane.id)) continue
        for (const step of byLane.get(lane.id) ?? [])
            if (junctions.has(step.id)) marks.push({ step, x: xOf.get(step.id)!, y, angle: 0, junction: true })
        for (const twig of p.twigs) {
            const a = { x: twig.start, y },
                d = { x: twig.start + twig.length, y: y + twig.sign * (graph.layer === 'conversation' ? 58 : 95) }
            const b = { x: a.x + twig.length * 0.24, y: a.y + twig.sign * 24 },
                c = { x: a.x + twig.length * 0.48, y: d.y }
            const startWidth = Math.min(3.2, 0.9 + Math.sqrt(twig.steps.length) * 0.55, width(a.x) * 0.65)
            paths.push(
                taperedShape(twig.id, lane.id, sampleCubic(a, b, c, d), (_point, t) =>
                    Math.max(0.3, startWidth * (0.15 + 0.85 * (1 - t) ** 0.8))
                )
            )
            episodes.push({ ...d, id: twig.id, number: twig.number, activity: twig.activity })
            twig.steps.forEach((step, i) => {
                const t = (i + 1) / (twig.steps.length + 1)
                const tangent = cubicTangent(a, b, c, d, t)
                // The SVG leaf points up locally; rotate it forward along the twig, alternating sides.
                const angle = 90 + (Math.atan2(tangent.y, tangent.x) * 180) / Math.PI + (i % 2 ? 40 : -40)
                marks.push({
                    ...cubicPoint(a, b, c, d, t),
                    step,
                    angle,
                    junction: false
                })
            })
        }
    }
    const terminalTips =
        graph.layer === 'conversation'
            ? tips.filter((tip) => !visible.some((lane) => lane.parentId === tip.lane.id))
            : tips
    return {
        width: Math.max(
            graph.layer === 'conversation' ? 800 : 1100,
            ...terminalTips.map((tip) => tip.x + 230),
            ...episodes.map((episode) => episode.x + 50)
        ),
        height,
        paths,
        marks,
        tips: terminalTips,
        episodes
    }
}
