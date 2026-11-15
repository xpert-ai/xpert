import {
  genXpertMiddlewareKey,
  XPERT_FILE_MEMORY_MIDDLEWARE_NAME,
  IWFNMiddleware,
  NodeOf,
  SKILLS_MIDDLEWARE_NAME,
  TXpertTeamDraft,
  TXpertTeamNode,
  WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { delegationAgents } from './settings-delegation.utils'

export type SettingsMiddlewareNode = NodeOf<'workflow'> & { entity: IWFNMiddleware }
export type MiddlewareSettings = Pick<IWFNMiddleware, 'title' | 'provider' | 'required' | 'options' | 'tools'>

const nodeKey = (endpoint: string) => endpoint.split('/')[0]

export function isSettingsMiddleware(node: TXpertTeamNode): node is SettingsMiddlewareNode {
  return node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE
}

export function assignedMiddlewares(draft: TXpertTeamDraft, agentKey: string): SettingsMiddlewareNode[] {
  const keys = new Set(
    draft.connections
      .filter((edge) => edge.type === 'workflow' && nodeKey(edge.from) === agentKey)
      .map((edge) => nodeKey(edge.to))
  )
  const nodes = draft.nodes.filter(isSettingsMiddleware).filter((node) => keys.has(node.key))
  const agent = delegationAgents(draft).find((node) => node.key === agentKey)
  const order =
    agent?.entity.options?.middlewares?.order ??
    (draft.team.agent?.key === agentKey ? draft.team.agent.options?.middlewares?.order : []) ??
    []
  const position = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length)
  return nodes.sort((a, b) => position(a.key) - position(b.key))
}

function withMiddlewareOrder(draft: TXpertTeamDraft, agentKey: string, order: string[]): TXpertTeamDraft {
  const update = (agent: NodeOf<'agent'>['entity']) => ({
    ...agent,
    options: { ...agent.options, middlewares: { ...agent.options?.middlewares, order } }
  })
  return {
    ...draft,
    team: draft.team.agent?.key === agentKey ? { ...draft.team, agent: update(draft.team.agent) } : draft.team,
    nodes: draft.nodes.map((node) =>
      node.type === 'agent' && node.key === agentKey ? { ...node, entity: update(node.entity) } : node
    )
  }
}

export function saveMiddleware(
  draft: TXpertTeamDraft,
  agentKey: string,
  key: string,
  value: MiddlewareSettings
): TXpertTeamDraft {
  const agent = delegationAgents(draft).find((node) => node.key === agentKey)
  const existing = draft.nodes.find((node) => node.key === key)
  const attached = assignedMiddlewares(draft, agentKey)
  if (
    !agent ||
    !value.title?.trim() ||
    !value.provider ||
    (existing &&
      (!isSettingsMiddleware(existing) ||
        existing.entity.provider !== value.provider ||
        !attached.some((node) => node.key === key)))
  ) {
    throw new Error('XP.XpertSettings.Middleware.InvalidAssignment')
  }
  // Runtime permits only one skills middleware per agent, including shared nodes.
  const parents = new Set([
    agentKey,
    ...draft.connections
      .filter((edge) => edge.type === 'workflow' && nodeKey(edge.to) === key)
      .map((edge) => nodeKey(edge.from))
  ])
  if (
    value.provider === SKILLS_MIDDLEWARE_NAME &&
    [...parents].some((parent) =>
      assignedMiddlewares(draft, parent).some(
        (node) => node.key !== key && node.entity.provider === SKILLS_MIDDLEWARE_NAME
      )
    )
  ) {
    throw new Error('XP.XpertSettings.Middleware.DuplicateSkills')
  }
  const node: SettingsMiddlewareNode = {
    ...(existing && isSettingsMiddleware(existing)
      ? existing
      : {
          type: 'workflow',
          key,
          position: { x: agent.position.x, y: agent.position.y + 220 + attached.length * 120 }
        }),
    entity: {
      ...(existing && isSettingsMiddleware(existing)
        ? existing.entity
        : { id: key, key, type: WorkflowNodeTypeEnum.MIDDLEWARE }),
      ...structuredClone(value),
      title: value.title.trim()
    }
  }
  const next = {
    ...draft,
    nodes: existing ? draft.nodes.map((item) => (item.key === key ? node : item)) : [...draft.nodes, node],
    connections: existing
      ? draft.connections
      : [...draft.connections, { type: 'workflow' as const, key: `${agentKey}/${key}`, from: agentKey, to: key }]
  }
  return existing ? next : withMiddlewareOrder(next, agentKey, [...attached.map((item) => item.key), key])
}

export function removeMiddleware(draft: TXpertTeamDraft, agentKey: string, key: string): TXpertTeamDraft {
  if (!assignedMiddlewares(draft, agentKey).some((node) => node.key === key)) return draft
  const connections = draft.connections.filter(
    (edge) => !(edge.type === 'workflow' && nodeKey(edge.from) === agentKey && nodeKey(edge.to) === key)
  )
  const shared = connections.some((edge) => nodeKey(edge.to) === key || nodeKey(edge.from) === key)
  const next = withMiddlewareOrder(
    {
      ...draft,
      connections,
      nodes: shared ? draft.nodes : draft.nodes.filter((node) => node.key !== key)
    },
    agentKey,
    assignedMiddlewares(draft, agentKey)
      .filter((node) => node.key !== key)
      .map((node) => node.key)
  )
  return next
}

function primaryMemoryAssignment(draft: TXpertTeamDraft) {
  const agentKey = draft.team.agent?.key ?? delegationAgents(draft).find((node) => !node.entity.leaderKey)?.key
  const nodes = assignedMiddlewares(draft, agentKey).filter(
    (node) => node.entity.provider === XPERT_FILE_MEMORY_MIDDLEWARE_NAME
  )
  return { agentKey, nodes }
}

export function isFileMemoryEnabled(draft?: TXpertTeamDraft): boolean {
  return !!draft && primaryMemoryAssignment(draft).nodes.length > 0
}

export function setFileMemoryEnabled(draft: TXpertTeamDraft, enabled: boolean): TXpertTeamDraft {
  const { agentKey, nodes } = primaryMemoryAssignment(draft)
  if (!agentKey || enabled === !!nodes.length) return draft

  // Keep configured nodes on the canvas so switching memory back on restores their options.
  if (!enabled) {
    const keys = new Set(nodes.map((node) => node.key))
    return {
      ...draft,
      connections: draft.connections.filter(
        (edge) => !(edge.type === 'workflow' && nodeKey(edge.from) === agentKey && keys.has(nodeKey(edge.to)))
      )
    }
  }
  const primary = delegationAgents(draft).find((node) => node.key === agentKey)
  const order = primary?.entity.options?.middlewares?.order ?? draft.team.agent?.options?.middlewares?.order ?? []
  const candidates = draft.nodes
    .filter(isSettingsMiddleware)
    .filter((node) => node.entity.provider === XPERT_FILE_MEMORY_MIDDLEWARE_NAME)
  const available =
    order.map((key) => candidates.find((node) => node.key === key)).find(Boolean) ??
    candidates.find((node) => !draft.connections.some((edge) => nodeKey(edge.to) === node.key))
  if (available) {
    return {
      ...draft,
      connections: [
        ...draft.connections,
        { type: 'workflow', key: `${agentKey}/${available.key}`, from: agentKey, to: available.key }
      ]
    }
  }
  return saveMiddleware(draft, agentKey, genXpertMiddlewareKey(), {
    title: 'Xpert Memory',
    provider: XPERT_FILE_MEMORY_MIDDLEWARE_NAME,
    required: true
  })
}
