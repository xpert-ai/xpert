// Layout is presentation only: control nodes share role lanes without changing execution ownership.
// Topology and configured labels determine routing; domain-specific naming has no meaning here.
import type { PipelineGraph, PipelineNode } from './bridge'
import { dependencyColumns } from './layout-columns'

export const laneWidth = 180,
    stageWidth = 220,
    headerHeight = 56,
    nodeWidth = 184,
    nodeHeight = 112,
    controlSize = 32
const controlWidth = 100,
    nodeGap = 16
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
    nodes: Array<{ projection: Pick<PipelineNode['projection'], 'key' | 'title' | 'kind' | 'laneKey' | 'stageKey'> }>
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

/** Business stages group columns; dependencies, not names, order sequential steps within each stage. */
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
            const ranks = dependencyColumns(
                nodes.map((node) => node.projection.key),
                graph.edges
            )
            const start = x
            const groups = Array.from({ length: Math.max(0, ...ranks.values()) + 1 }, (_, rank) => {
                const ranked = nodes
                    .filter((node) => ranks.get(node.projection.key) === rank)
                    .sort((a, b) => a.projection.key.localeCompare(b.projection.key))
                const controls = ranked.filter((node) => isControlNode(node.projection.kind))
                const work = ranked.filter((node) => !isControlNode(node.projection.kind))
                // Each control owns a visible column, even alongside work or another control at the same depth.
                return [...controls.map((node) => [node]), ...(work.length || !ranked.length ? [work] : [])]
            }).flat()
            const columns = groups.map((group) => {
                const keys = group.map((node) => node.projection.key)
                const control =
                    group.length === 1 && isControlNode(group[0].projection.kind) ? group[0].projection : null
                const labels = graph.edges.filter((edge) => edge.label && keys.includes(edge.from))
                const labelWidth = Math.max(0, ...labels.map((edge) => edgeLabelWidth(edge.label!)))
                const width = control ? Math.max(controlWidth, Math.min(340, labelWidth * 2 + 64)) : stageWidth
                const column = { x, width, keys, control }
                x += width
                return column
            })
            return { ...stage, x: start, width: x - start, control, columns }
        })
    // Headers and row dividers share these sections so control columns remain visible across every lane.
    const headers = stages.flatMap((stage, index) => {
        const sections: Array<{
            key: string
            x: number
            width: number
            label: string
            icon: typeof stage.icon
            stageNumber: number
            control: LayoutGraph['nodes'][number]['projection'] | null
        }> = []
        stage.columns.forEach((column, columnIndex) => {
            const previous = sections[sections.length - 1]
            if (!column.control && previous && !previous.control) {
                previous.width += column.width
                return
            }
            sections.push({
                key: `${stage.key}:${columnIndex}`,
                x: column.x,
                width: column.width,
                label: column.control?.title ?? stage.label,
                icon: stage.icon,
                stageNumber: stages.slice(0, index + 1).filter((item) => !item.control).length,
                control: column.control
            })
        })
        return sections
    })
    const rows: Array<{ key: string; label: string; y: number; height: number }> = []
    const positions = new Map<string, { x: number; y: number; width: number }>()
    const topPadding = 24
    let y = headerHeight
    for (const lane of lanes.filter((item) => !laneFilter || item.key === laneFilter)) {
        let count = 1
        for (const column of stages.flatMap((stage) => stage.columns)) {
            const nodes = graph.nodes
                .filter(
                    (node) =>
                        displayLanes.get(node.projection.key) === lane.key && column.keys.includes(node.projection.key)
                )
                .sort((a, b) => a.projection.key.localeCompare(b.projection.key))
            count = Math.max(count, nodes.length)
            nodes.forEach((node, index) => {
                const width = isControlNode(node.projection.kind) ? controlWidth - 16 : nodeWidth
                positions.set(node.projection.key, {
                    x: column.x + (column.width - width) / 2,
                    y: y + topPadding + index * (nodeHeight + nodeGap),
                    width
                })
            })
        }
        const height = count * (nodeHeight + nodeGap) + topPadding
        rows.push({ key: lane.key, label: lane.label, y, height })
        y += height
    }
    const layout = { stages, headers, rows, positions, width: x, height: y }
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
        for (const column of stages.flatMap((stage) => stage.columns)) {
            const nodes = graph.nodes
                .filter(
                    (node) =>
                        displayLanes.get(node.projection.key) === row.key && column.keys.includes(node.projection.key)
                )
                .sort((a, b) => a.projection.key.localeCompare(b.projection.key))
            nodes.forEach((node, index) => {
                positions.get(node.projection.key)!.y = row.y + topPadding + extra + index * (nodeHeight + nodeGap)
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
    const radius = (kind: PipelineNode['projection']['kind']) =>
        kind === 'terminal' ? controlSize / 2 : controlSize / Math.SQRT2
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
    const bend = (x1 + x2) / 2
    return {
        path: `M${x1},${y1} H${bend} V${y2} H${x2}`,
        aboveCards: false,
        labelX: (x1 + x2) / 2,
        labelY: (y1 + y2) / 2 - 8,
        labelWidth: Math.max(24, Math.abs(x2 - x1) - 8)
    }
}
