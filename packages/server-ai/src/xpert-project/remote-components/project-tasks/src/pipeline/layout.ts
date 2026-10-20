// Layout is presentation only: control nodes share role lanes without changing execution ownership.
// Topology and configured labels determine routing; domain-specific naming has no meaning here.
import type { PipelineGraph, PipelineNode } from './bridge'

export const laneWidth = 232,
    stageWidth = 248,
    headerHeight = 96,
    nodeWidth = 204,
    nodeHeight = 172
const controlWidth = 132
export const edgeLabelWidth = (label: string) =>
    [...label].reduce((width, char) => width + (/[^\x00-\x7F]/.test(char) ? 10 : 6), 0)
export function edgeLabelLines(label: string, width: number): string[] {
    const lines: string[] = []
    let line = ''
    for (const char of label) {
        if (line && edgeLabelWidth(line + char) > width) {
            lines.push(line)
            line = ''
        }
        line += char
    }
    if (line) lines.push(line)
    return lines
}
export const isControlNode = (kind: PipelineNode['projection']['kind']) =>
    kind === 'fork' || kind === 'join' || kind === 'router' || kind === 'terminal'

type LayoutGraph = {
    definition: Pick<PipelineGraph['definition'], 'lanes' | 'stages'>
    nodes: Array<{ projection: Pick<PipelineNode['projection'], 'key' | 'kind' | 'laneKey' | 'stageKey'> }>
    edges: Array<Pick<PipelineGraph['edges'][number], 'from' | 'to' | 'label'>>
}

/** Display ownership follows the nearest upstream role, without changing execution ownership.
 * Entry controls fall back to downstream roles. Stable topology, never runtime state, decides ties.
 */
function presentationLanes(graph: LayoutGraph, lanes: LayoutGraph['definition']['lanes']) {
    const nodes = new Map(graph.nodes.map(({ projection }) => [projection.key, projection]))
    const predecessors = new Map<string, string[]>(),
        successors = new Map<string, string[]>()
    for (const edge of graph.edges) {
        predecessors.set(edge.to, [...(predecessors.get(edge.to) ?? []), edge.from])
        successors.set(edge.from, [...(successors.get(edge.from) ?? []), edge.to])
    }
    const nearestLane = (key: string, adjacency: Map<string, string[]>) => {
        let frontier = [key]
        const visited = new Set<string>(frontier)
        while (frontier.length) {
            const next = [...new Set(frontier.flatMap((item) => adjacency.get(item) ?? []))]
                .filter((item) => !visited.has(item))
                .sort()
            for (const item of next) {
                visited.add(item)
                const lane = nodes.get(item)?.laneKey
                if (lane && lanes.some((candidate) => candidate.key === lane)) return lane
            }
            frontier = next
        }
        return undefined
    }
    return new Map(
        graph.nodes.map(({ projection }) => [
            projection.key,
            projection.laneKey ??
                nearestLane(projection.key, predecessors) ??
                nearestLane(projection.key, successors) ??
                lanes[0]?.key
        ])
    )
}

/** Stable identity order avoids moving cards when only a status or runtime timestamp changes. */
export function pipelineLayout(graph: LayoutGraph, laneFilter: string) {
    const lanes = [...graph.definition.lanes].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    // Resolve against the full graph before filtering, so controls never jump to another role.
    const displayLanes = presentationLanes(graph, lanes)
    let x = laneWidth
    const stages = [...graph.definition.stages]
        .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
        .map((stage) => {
            const nodes = graph.nodes.filter((node) => node.projection.stageKey === stage.key)
            const control = nodes.length > 0 && nodes.every((node) => isControlNode(node.projection.kind))
            // Reserve room for configured labels beside controls; longer labels wrap without data loss.
            const labels = graph.edges.filter(
                (edge) => edge.label && nodes.some((node) => node.projection.key === edge.from)
            )
            const labelWidth = Math.max(0, ...labels.map((edge) => edgeLabelWidth(edge.label!)))
            const width = control ? Math.max(controlWidth, Math.min(340, labelWidth * 2 + 64)) : stageWidth
            const column = { ...stage, x, width, control }
            x += width
            return column
        })
    const rows: Array<{ key: string; label: string; y: number; height: number }> = []
    const positions = new Map<string, { x: number; y: number; width: number }>()
    const topPadding = 24
    let y = headerHeight
    for (const lane of lanes.filter((item) => !laneFilter || item.key === laneFilter)) {
        let count = 1
        for (const stage of stages) {
            const nodes = graph.nodes
                .filter(
                    (node) =>
                        displayLanes.get(node.projection.key) === lane.key && node.projection.stageKey === stage.key
                )
                .sort((a, b) => a.projection.key.localeCompare(b.projection.key))
            count = Math.max(count, nodes.length)
            nodes.forEach((node, index) => {
                const width = isControlNode(node.projection.kind) ? controlWidth - 16 : nodeWidth
                positions.set(node.projection.key, {
                    x: stage.x + (stage.width - width) / 2,
                    y: y + topPadding + index * (nodeHeight + 20),
                    width
                })
            })
        }
        const height = count * (nodeHeight + 20) + topPadding
        rows.push({ key: lane.key, label: lane.label, y, height })
        y += height
    }
    const layout = { stages, rows, positions, width: x, height: y }
    const edgeRoutes = new Map<LayoutGraph['edges'][number], NonNullable<ReturnType<typeof pipelineEdgePath>>>()
    const kinds = new Map(graph.nodes.map((node) => [node.projection.key, node.projection.kind]))
    const tracks: Array<{
        edge: LayoutGraph['edges'][number]
        row: (typeof rows)[number]
        width: number
        height: number
    }> = []
    // Long or bypass conditions get separate tracks sized from their actual endpoint gaps.
    for (const edge of graph.edges) {
        if (!edge.label) continue
        const from = positions.get(edge.from),
            to = positions.get(edge.to)
        if (!from || !to) continue
        const route = pipelineEdgePath(layout, edge.from, edge.to, kinds.get(edge.from)!, kinds.get(edge.to)!)!
        const labelHeight = edgeLabelLines(edge.label, route.labelWidth).length * 12
        if (!route.aboveCards && labelHeight <= nodeHeight / 2 - 12) {
            edgeRoutes.set(edge, route)
            continue
        }
        const top = Math.min(from.y, to.y)
        const row = rows.find((row) => top >= row.y && top < row.y + row.height)!
        // Raised labels may span the cards below: their reserved row band has no card obstacles.
        const width = Math.max(
            24,
            Math.min(240, (route.labelX - laneWidth - 8) * 2, (layout.width - route.labelX - 8) * 2)
        )
        tracks.push({ edge, row, width, height: edgeLabelLines(edge.label, width).length * 12 + 12 })
    }
    let shift = 0
    for (const row of rows) {
        const extra = Math.max(
            0,
            tracks.filter((track) => track.row === row).reduce((sum, track) => sum + track.height, 0) - 12
        )
        row.y += shift
        row.height += extra
        shift += extra
    }
    // Apply each row's padding once using its stable ownership.
    for (const row of rows) {
        const extra = Math.max(
            0,
            tracks.filter((track) => track.row === row).reduce((sum, track) => sum + track.height, 0) - 12
        )
        for (const stage of stages) {
            const nodes = graph.nodes
                .filter(
                    (node) =>
                        displayLanes.get(node.projection.key) === row.key && node.projection.stageKey === stage.key
                )
                .sort((a, b) => a.projection.key.localeCompare(b.projection.key))
            nodes.forEach((node, index) => {
                positions.get(node.projection.key)!.y = row.y + topPadding + extra + index * (nodeHeight + 20)
            })
        }
    }
    for (const row of rows) {
        let trackY = row.y + 8
        for (const track of tracks.filter((track) => track.row === row)) {
            const from = positions.get(track.edge.from)!,
                to = positions.get(track.edge.to)!
            const fromKind = kinds.get(track.edge.from)!,
                toKind = kinds.get(track.edge.to)!
            const endpoints = edgeEndpoints(from, to, fromKind, toKind)
            const { x1, x2, y1, y2 } = endpoints
            const rail = trackY + track.height - 6
            edgeRoutes.set(track.edge, {
                path: `M${x1},${y1} H${x1 + 8} V${rail} H${x2 - 8} V${y2} H${x2}`,
                aboveCards: true,
                labelX: (x1 + x2) / 2,
                labelY: rail - 5,
                labelWidth: track.width
            })
            trackY += track.height
        }
    }
    for (const [edge, route] of edgeRoutes) {
        if (!route.aboveCards)
            edgeRoutes.set(
                edge,
                pipelineEdgePath(layout, edge.from, edge.to, kinds.get(edge.from)!, kinds.get(edge.to)!)!
            )
    }
    return { ...layout, height: y + shift, edgeRoutes }
}

/** Route forward skip edges above intervening cards instead of drawing through them. */
type Position = { x: number; y: number; width: number }
function edgeEndpoints(
    from: Position,
    to: Position,
    fromKind: PipelineNode['projection']['kind'],
    toKind: PipelineNode['projection']['kind']
) {
    const radius = (kind: PipelineNode['projection']['kind']) => (kind === 'terminal' ? 28 : 38)
    return {
        x1: from.x + (isControlNode(fromKind) ? from.width / 2 + radius(fromKind) : from.width),
        x2: to.x + (isControlNode(toKind) ? to.width / 2 - radius(toKind) : 0),
        y1: from.y + nodeHeight / 2,
        y2: to.y + nodeHeight / 2
    }
}
export function pipelineEdgePath(
    layout: { positions: Map<string, Position> },
    fromKey: string,
    toKey: string,
    fromKind: PipelineNode['projection']['kind'],
    toKind: PipelineNode['projection']['kind']
) {
    const from = layout.positions.get(fromKey),
        to = layout.positions.get(toKey)
    if (!from || !to) return null
    const { x1, x2, y1, y2 } = edgeEndpoints(from, to, fromKind, toKind)
    const obstacles = [...layout.positions.entries()].filter(
        ([key, position]) =>
            key !== fromKey &&
            key !== toKey &&
            position.x < x2 &&
            position.x + position.width > x1 &&
            position.y < Math.max(y1, y2) &&
            position.y + nodeHeight > Math.min(y1, y2)
    )
    if (x2 > x1 && obstacles.length) {
        const rail = Math.min(from.y, to.y, ...obstacles.map(([, position]) => position.y)) - 16
        return {
            path: `M${x1},${y1} H${x1 + 12} V${rail} H${x2 - 12} V${y2} H${x2}`,
            aboveCards: true,
            labelX: (x1 + x2) / 2,
            labelY: rail - 5,
            labelWidth: x2 - x1 - 24
        }
    }
    const bend = Math.max(24, Math.abs(x2 - x1) / 2)
    return {
        path: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`,
        aboveCards: false,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 8,
        labelWidth: Math.max(24, Math.abs(x2 - x1) - 8)
    }
}
