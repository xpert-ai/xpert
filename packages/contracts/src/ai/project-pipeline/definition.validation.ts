import type { ProjectPipelineDefinition } from './definition.schema'
import { validateProjectPipelineDataflow } from './dataflow.validation'

export interface ProjectPipelineValidationIssue {
  code: string
  path: Array<string | number>
}

/** Pure semantic checks shared by configuration APIs, plugin registrations and persisted snapshots. */
export function validateProjectPipelineDefinition(
  definition: ProjectPipelineDefinition
): ProjectPipelineValidationIssue[] {
  const issues: ProjectPipelineValidationIssue[] = []
  const issue = (code: string, ...path: Array<string | number>) => issues.push({ code, path })
  const unique = (keys: string[], ...path: Array<string | number>) => {
    if (new Set(keys).size !== keys.length) issue('DUPLICATE_KEY', ...path)
  }
  unique(
    definition.roles.map((role) => role.key),
    'roles'
  )
  unique(
    definition.lanes.map((lane) => lane.key),
    'lanes'
  )
  unique(
    definition.stages.map((stage) => stage.key),
    'stages'
  )
  definition.roles.forEach((role, index) => unique(role.allowedKinds, 'roles', index, 'allowedKinds'))
  const roles = new Map(definition.roles.map((role) => [role.key, role]))
  const lanes = new Map(definition.lanes.map((lane) => [lane.key, lane]))
  const stages = new Set(definition.stages.map((stage) => stage.key))
  definition.lanes.forEach((lane, index) => {
    if (!roles.has(lane.roleKey)) issue('ROLE_NOT_FOUND', 'lanes', index, 'roleKey')
  })
  if (definition.executionAuthority === 'provider') return issues

  const { nodes, edges, roundPolicy } = definition
  unique(
    nodes.map((node) => node.key),
    'nodes'
  )
  unique(
    edges.map((edge) => JSON.stringify([edge.from, edge.to, edge.outcome ?? null])),
    'edges'
  )
  unique(roundPolicy.terminalOutcomes, 'roundPolicy', 'terminalOutcomes')
  const byKey = new Map(nodes.map((node) => [node.key, node]))
  const incoming = new Map(nodes.map((node) => [node.key, edges.filter((edge) => edge.to === node.key)]))
  const outgoing = new Map(nodes.map((node) => [node.key, edges.filter((edge) => edge.from === node.key)]))
  edges.forEach((edge, index) => {
    if (!byKey.has(edge.from) || !byKey.has(edge.to)) issue('EDGE_NODE_NOT_FOUND', 'edges', index)
  })
  nodes.forEach((node, index) => {
    if (!stages.has(node.stageKey)) issue('STAGE_NOT_FOUND', 'nodes', index, 'stageKey')
    if ('laneKey' in node && !lanes.has(node.laneKey)) issue('LANE_NOT_FOUND', 'nodes', index, 'laneKey')
    if (node.kind === 'human_gate' && !roles.get(node.candidateRoleKey)?.allowedKinds.includes('human')) {
      issue('HUMAN_ROLE_REQUIRED', 'nodes', index, 'candidateRoleKey')
    }
    const exits = outgoing.get(node.key) ?? []
    if ('outcomes' in node) {
      if (
        node.kind === 'human_gate' &&
        node.outcomeLabels &&
        Object.keys(node.outcomeLabels).some((key) => !node.outcomes.includes(key))
      )
        issue('UNKNOWN_OUTCOME_LABEL', 'nodes', index, 'outcomeLabels')
      unique(node.outcomes, 'nodes', index, 'outcomes')
      if (
        exits.some((edge) => !edge.outcome || !node.outcomes.includes(edge.outcome)) ||
        node.outcomes.some((outcome) => exits.filter((edge) => edge.outcome === outcome).length !== 1)
      ) {
        issue('OUTCOME_COVERAGE', 'nodes', index)
      }
    } else {
      if (exits.some((edge) => edge.outcome !== undefined)) issue('UNEXPECTED_OUTCOME', 'nodes', index)
      if (
        node.kind === 'terminal' ? exits.length !== 0 : node.kind === 'fork' ? exits.length < 2 : exits.length !== 1
      ) {
        issue('EXIT_CARDINALITY', 'nodes', index)
      }
    }
    if (node.kind === 'join' && (incoming.get(node.key)?.length ?? 0) < 2) issue('JOIN_INPUTS', 'nodes', index)
    if (
      node.kind === 'terminal' &&
      node.disposition !== 'await_new_subject' &&
      !roundPolicy.terminalOutcomes.includes(node.outcome)
    ) {
      issue('TERMINAL_OUTCOME_NOT_DECLARED', 'nodes', index, 'outcome')
    }
  })
  for (const outcome of roundPolicy.terminalOutcomes) {
    if (!nodes.some((node) => node.kind === 'terminal' && node.outcome === outcome)) {
      issue('TERMINAL_OUTCOME_NOT_USED', 'roundPolicy', 'terminalOutcomes')
    }
  }
  const entry = roundPolicy.entryNodeKey
  if (!byKey.has(entry) || (incoming.get(entry)?.length ?? 0) !== 0)
    issue('INVALID_ENTRY', 'roundPolicy', 'entryNodeKey')
  const reached = new Set<string>()
  const pending = [entry]
  while (pending.length) {
    const key = pending.pop()!
    if (reached.has(key)) continue
    reached.add(key)
    pending.push(...(outgoing.get(key) ?? []).map((edge) => edge.to))
  }
  if (nodes.some((node) => !reached.has(node.key))) issue('UNREACHABLE_NODE', 'nodes')
  const degree = new Map(nodes.map((node) => [node.key, incoming.get(node.key)?.length ?? 0]))
  const queue = nodes.filter((node) => degree.get(node.key) === 0).map((node) => node.key)
  const ordered: string[] = []
  while (queue.length) {
    const key = queue.shift()!
    ordered.push(key)
    for (const edge of outgoing.get(key) ?? []) {
      const next = (degree.get(edge.to) ?? 0) - 1
      degree.set(edge.to, next)
      if (next === 0) queue.push(edge.to)
    }
  }
  if (ordered.length !== nodes.length) {
    issue('CYCLE', 'edges')
    return issues
  }
  // Upstream reachability alone is insufficient: a value on an unselected branch may not exist.
  // Propagate alternative decision assignments. A join requires ALL selected predecessors;
  // a normal merge can be reached through any predecessor. See dataflow.validation.ts.
  issues.push(...validateProjectPipelineDataflow(definition, ordered))
  return issues
}
