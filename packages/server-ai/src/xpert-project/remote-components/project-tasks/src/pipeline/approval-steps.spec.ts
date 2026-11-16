import { approvalStageMap } from './approval-steps'
import type { PipelineGraph } from './bridge'
import { approvalGraphFixture as fixture } from './__fixtures__/approval-graph'

it('folds declared services into their named approvals and keeps undeclared shared terminals visible', () => {
    const original = fixture(),
        stage = approvalStageMap(original)
    expect(stage.graph.nodes.map((n) => n.id)).toEqual(['a', 'b', 'end', 'stop'])
    expect(stage.graph.definition.lanes.map((l) => l.key)).toEqual(['person'])
    expect(stage.graph.edges.map((e) => [e.from, e.to])).toEqual([
        ['a', 'b'],
        ['a', 'stop'],
        ['b', 'end'],
        ['b', 'stop']
    ])
    expect(stage.steps.get('a')?.map((s) => [s.outcomes, s.node.id, s.destination.id])).toEqual([
        [['加急', '分批'], 'u', 'b'],
        [['退回'], 'v', 'stop']
    ])
    expect(original.nodes).toHaveLength(8)
    expect(original.edges).toHaveLength(10)
})
it('keeps undeclared steps visible even when a workbench supplies approval parents', () => {
    const historical = {
        ...fixture({}),
        historical: true,
        nodeWorkbench: { routeToExecutor: true, approvalParents: { u: 'a', v: 'a' } }
    }
    const stage = approvalStageMap(historical)
    expect(stage.steps.size).toBe(0)
    expect(stage.graph).toBe(historical)
    expect(stage.graph.nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['u', 'v']))
})
it('marks a folded route as selected only once its successor receives the handoff', () => {
    const original = fixture()
    original.edges.find((e) => e.to === 'v')!.selection = 'selected'
    const route = () => approvalStageMap(original).graph.edges.find((e) => e.from === 'a' && e.to === 'stop')
    expect(route()?.selection).toBe('undetermined')
    original.edges.find((e) => e.from === 'v')!.selection = 'selected'
    expect(route()?.selection).toBe('selected')
})
it('folds only the declared service even when its sibling shares the same approval and lane', () => {
    const original = fixture({ u: 'a' })
    if (original.definition.executionAuthority !== 'platform') throw Error()
    const declared = original.definition.nodes.find((n) => n.key === 'u')!
    declared.inputBindings = { order: { from: 'subject' } }
    const stage = approvalStageMap(original)
    expect(stage.steps.get('a')?.map((step) => step.node.id)).toEqual(['u'])
    expect(stage.steps.has('b')).toBe(false)
    expect(stage.graph.definition.lanes.map((l) => l.key)).toContain('machine')
    expect(stage.graph.nodes.find((n) => n.id === 'v')).toBe(original.nodes.find((n) => n.id === 'v'))
    expect(stage.graph.edges).toContain(original.edges.find((e) => e.from === 'v'))
})
it('retains the original graph when services have no declarations or the provider owns the topology', () => {
    const original = fixture({})
    const stage = approvalStageMap(original)
    expect(stage.graph).toBe(original)
    expect(stage.steps.size).toBe(0)
    const provider = {
        ...original,
        definition: { ...original.definition, executionAuthority: 'provider' }
    } as PipelineGraph
    expect(approvalStageMap(provider).graph).toBe(provider)
})
it('keeps a declared step visible if the projected handoff is incomplete', () => {
    const original = fixture({ u: 'a' })
    original.edges = original.edges.filter((edge) => edge.from !== 'u')
    expect(approvalStageMap(original).graph).toBe(original)
})
