import { pipelineLayout, pipelineEdgePath, edgeLabelLines, nodeWidth, stageWidth } from './layout'

type Graph = Parameters<typeof pipelineLayout>[0]
const node = (
    key: string,
    kind: Graph['nodes'][number]['projection']['kind'],
    laneKey: string | null,
    stageKey = key
) => ({ projection: { key, kind, laneKey, stageKey } })
const makeGraph = (nodes: Graph['nodes'], edges: Graph['edges']): Graph => ({
    definition: {
        lanes: [
            { key: 'engineering', label: 'Engineering', roleKey: 'engineer', order: 1 },
            { key: 'review', label: 'Review', roleKey: 'reviewer', order: 2 }
        ],
        stages: [...new Set(nodes.map((item) => item.projection.stageKey))].map((key, order) => ({
            key,
            label: key,
            order
        }))
    },
    nodes,
    edges
})
const edge = (from: string, to: string) => ({ from, to })

it('places routers and terminal nodes inline with their upstream role without changing ownership', () => {
    const graph = makeGraph(
        [
            node('draft', 'work', 'engineering'),
            node('route', 'router', null),
            node('review', 'human_gate', 'review'),
            node('end', 'terminal', null)
        ],
        [edge('draft', 'route'), edge('route', 'review'), edge('review', 'end')]
    )
    const layout = pipelineLayout(graph, '')
    expect(layout.rows.map((row) => row.key)).toEqual(['engineering', 'review'])
    expect(layout.positions.get('route')?.y).toBe(layout.positions.get('draft')?.y)
    expect(layout.positions.get('end')?.y).toBe(layout.positions.get('review')?.y)
    expect(layout.stages.find((stage) => stage.key === 'route')?.width).toBeLessThan(stageWidth)
    expect(graph.nodes[1].projection.laneKey).toBeNull()
    const filtered = pipelineLayout(graph, 'review')
    expect(filtered.positions.has('route')).toBe(false)
    expect(filtered.positions.has('end')).toBe(true)
})
it('resolves entry controls downstream and traverses upstream control chains', () => {
    const graph = makeGraph(
        [
            node('entry', 'fork', null),
            node('task', 'work', 'review'),
            node('route', 'router', null),
            node('join', 'join', null)
        ],
        [edge('entry', 'task'), edge('task', 'route'), edge('route', 'join')]
    )
    const layout = pipelineLayout(graph, '')
    for (const key of ['entry', 'route', 'join'])
        expect(layout.positions.get(key)?.y).toBe(layout.positions.get('task')?.y)
})
it('keeps joins stable when node and edge arrival order changes', () => {
    const graph = makeGraph(
        [node('a', 'work', 'engineering'), node('b', 'work', 'review'), node('join', 'join', null)],
        [edge('b', 'join'), edge('a', 'join')]
    )
    const first = pipelineLayout(graph, '')
    const reordered = pipelineLayout(
        { ...graph, nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() },
        ''
    )
    expect(reordered.positions.get('join')).toEqual(first.positions.get('join'))
    expect(first.positions.get('join')?.y).toBe(first.positions.get('a')?.y)
})
it('handles control cycles and disconnected controls without adding a control row', () => {
    const graph = makeGraph(
        [node('a', 'router', null), node('b', 'join', null), node('end', 'terminal', null)],
        [edge('a', 'b'), edge('b', 'a')]
    )
    const layout = pipelineLayout(graph, '')
    expect(layout.rows).toHaveLength(2)
    expect(layout.positions.size).toBe(3)
    expect(pipelineLayout(graph, 'review').positions.size).toBe(0)
})
it('keeps mixed columns full size and stacks nodes without overlap', () => {
    const graph = makeGraph(
        [node('work', 'work', 'engineering', 'shared'), node('route', 'router', null, 'shared')],
        [edge('work', 'route')]
    )
    const layout = pipelineLayout(graph, '')
    expect(layout.stages[0].width).toBe(stageWidth)
    expect(layout.positions.get('work')?.width).toBe(nodeWidth)
    expect(Math.abs(layout.positions.get('work')!.y - layout.positions.get('route')!.y)).toBeGreaterThan(136)
})

it('routes a skip branch above intermediate cards while keeping adjacent edges level', () => {
    const graph = makeGraph(
        [node('route', 'router', null), node('optional', 'work', 'engineering'), node('finish', 'work', 'engineering')],
        [edge('route', 'optional'), edge('optional', 'finish'), edge('route', 'finish')]
    )
    const layout = pipelineLayout(graph, '')
    const skip = pipelineEdgePath(layout, 'route', 'finish', 'router', 'work')!
    expect(skip.path).toContain(' V')
    expect(skip.labelY).toBeLessThan(layout.positions.get('optional')!.y)
    expect(skip.labelY).toBeGreaterThan(layout.rows[0].y)
    expect(pipelineEdgePath(layout, 'route', 'optional', 'router', 'work')!.path).toContain(' C')
})

it('reserves space for configured Chinese branch labels and wraps without truncation', () => {
    const graph = makeGraph(
        [node('route', 'router', null), node('task', 'work', 'engineering')],
        [{ ...edge('route', 'task'), label: '需要人工复核' }]
    )
    const layout = pipelineLayout(graph, '')
    const route = pipelineEdgePath(layout, 'route', 'task', 'router', 'work')!
    expect(edgeLabelLines('需要人工复核', route.labelWidth)).toEqual(['需要人工复核'])
    const label = '根据配置显示完整的汽车电动机审核条件'
    expect(edgeLabelLines(label, 60).join('')).toBe(label)
    expect(edgeLabelLines(label, 60).every((line) => line.length <= 6)).toBe(true)
})

it('allocates separate tracks using actual label width without expanding unrelated rows', () => {
    const label = '需要检查所有必填属性并完成人工复核后才能继续执行此步骤'.repeat(3)
    const graph = makeGraph(
        [node('start', 'work', 'engineering'), node('next', 'work', 'engineering'), node('end', 'work', 'engineering')],
        [
            { from: 'start', to: 'next', label },
            { from: 'start', to: 'end', label: '审核通过后跳过处理' }
        ]
    )
    const layout = pipelineLayout(graph, '')
    const boxes = graph.edges.map((edge) => {
        const route = layout.edgeRoutes.get(edge)!
        const lines = edgeLabelLines(edge.label!, route.labelWidth)
        expect(lines.join('')).toBe(edge.label)
        return { top: route.labelY - lines.length * 12, bottom: route.labelY }
    })
    expect(boxes[0].top).toBeGreaterThanOrEqual(layout.rows[0].y)
    expect(boxes[1].top).toBeGreaterThan(boxes[0].bottom)
    expect(boxes[1].bottom).toBeLessThan(layout.positions.get('start')!.y)
    expect(layout.rows[1].height).toBe(216)
})
