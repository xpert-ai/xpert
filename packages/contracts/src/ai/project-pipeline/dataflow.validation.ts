import type { ProjectPipelineDefinition } from './definition.schema'
import type { ProjectPipelineValidationIssue } from './definition.validation'

/** Bounded symbolic execution proves required outputs exist on every selected branch. */
export function validateProjectPipelineDataflow(
  definition: Extract<ProjectPipelineDefinition, { executionAuthority?: 'platform' }>,
  ordered: string[]
): ProjectPipelineValidationIssue[] {
  const issues: ProjectPipelineValidationIssue[] = []
  const reported = new Set<string>()
  const report = (code: string, index: number, input: string) => {
    const key = JSON.stringify([code, index, input])
    if (!reported.has(key)) issues.push({ code, path: ['nodes', index, 'inputBindings', input] })
    reported.add(key)
  }
  const byKey = new Map(definition.nodes.map((node, index) => [node.key, { node, index }]))
  const ancestors = new Map<string, Set<string>>()
  let scenarios: Array<{ active: Set<string>; selectedEdges: Set<number> }> = [
    { active: new Set(), selectedEdges: new Set() }
  ]
  for (const key of ordered) {
    const item = byKey.get(key)
    if (!item) continue
    const { node, index } = item
    const inputs = definition.edges.flatMap((edge, i) => (edge.to === key ? [i] : []))
    const outputs = definition.edges.flatMap((edge, i) => (edge.from === key ? [i] : []))
    const upstream = new Set<string>()
    for (const i of inputs) {
      const source = definition.edges[i].from
      upstream.add(source)
      for (const ancestor of ancestors.get(source) ?? []) upstream.add(ancestor)
    }
    ancestors.set(key, upstream)
    for (const [name, binding] of Object.entries(node.inputBindings ?? {})) {
      const refs = binding.from === 'collection' ? binding.items : binding.from === 'node_output' ? [binding] : []
      for (const ref of refs) {
        const ports = byKey.get(ref.nodeKey)?.node.outputPorts
        if (!ports || !Object.prototype.hasOwnProperty.call(ports, ref.port))
          report('OUTPUT_PORT_NOT_FOUND', index, name)
        if (!upstream.has(ref.nodeKey)) report('OUTPUT_NOT_UPSTREAM', index, name)
      }
    }
    const next: typeof scenarios = []
    for (const scenario of scenarios) {
      if (key !== definition.roundPolicy.entryNodeKey && !inputs.some((i) => scenario.selectedEdges.has(i))) {
        next.push(scenario)
        continue
      }
      for (const [name, binding] of Object.entries(node.inputBindings ?? {})) {
        const refs = binding.from === 'collection' ? binding.items : binding.from === 'node_output' ? [binding] : []
        if (refs.some((ref) => !scenario.active.has(ref.nodeKey))) report('OUTPUT_NOT_ALWAYS_AVAILABLE', index, name)
      }
      const choices = 'outcomes' in node ? node.outcomes : [undefined]
      for (const outcome of choices) {
        const selectedEdges = new Set(scenario.selectedEdges)
        for (const i of outputs) {
          if (definition.edges[i].outcome === outcome) selectedEdges.add(i)
        }
        next.push({ active: new Set([...scenario.active, key]), selectedEdges })
        if (next.length > 4096) {
          return [...issues, { code: 'DATAFLOW_COMPLEXITY_LIMIT', path: ['nodes'] }]
        }
      }
    }
    scenarios = next
  }
  return issues
}
