import type { IXpert, NodeOf, TCopilotModel, TXpertTeamDraft } from '@xpert-ai/contracts'

export const delegationAgents = (draft: TXpertTeamDraft) =>
  draft.nodes.filter((node): node is NodeOf<'agent'> => node.type === 'agent' && !node.entity.options?.hidden)

export function eligibleParents(draft: TXpertTeamDraft, key?: string) {
  const excluded = new Set(key ? [key] : [])
  let size = -1
  while (size !== excluded.size) {
    size = excluded.size
    for (const edge of draft.connections) {
      if (edge.type === 'agent' && excluded.has(edge.from)) excluded.add(edge.to)
    }
    for (const node of delegationAgents(draft)) {
      if (node.entity.leaderKey && excluded.has(node.entity.leaderKey)) excluded.add(node.key)
    }
  }
  return delegationAgents(draft).filter((node) => !excluded.has(node.key))
}

export function attachExternalExpert(draft: TXpertTeamDraft, expert: IXpert, parentKey: string): TXpertTeamDraft {
  const parent = delegationAgents(draft).find((node) => node.key === parentKey)
  if (
    !parent ||
    !expert.id ||
    !expert.version ||
    expert.id === draft.team.id ||
    (expert.name === draft.team.name && expert.workspaceId === draft.team.workspaceId) ||
    draft.nodes.some((node) => node.key === expert.id || (node.type === 'xpert' && node.entity.id === expert.id))
  ) {
    throw new Error('XP.XpertSettings.Delegation.InvalidAssignment')
  }
  const position = {
    x: parent.position.x + 360,
    y: parent.position.y + 240 + draft.nodes.filter((node) => node.type === 'xpert').length * 180
  }
  const primary = expert.graph?.nodes.find((node) => node.key === expert.agent?.key)
  const node: NodeOf<'xpert'> = {
    type: 'xpert',
    key: expert.id,
    entity: structuredClone(expert),
    position,
    size: { width: 280, height: 210 },
    expanded: false,
    nodes: primary ? [{ ...structuredClone(primary), position: { x: position.x + 20, y: position.y + 40 } }] : []
  }
  return {
    ...draft,
    nodes: [...draft.nodes, node],
    connections: [
      ...draft.connections,
      { type: 'xpert', key: `${parentKey}/${node.key}`, from: parentKey, to: node.key, required: true }
    ]
  }
}

export function detachExternalExpert(draft: TXpertTeamDraft, key: string): TXpertTeamDraft {
  if (!draft.nodes.some((node) => node.type === 'xpert' && node.key === key)) return draft
  return {
    ...draft,
    team: {
      ...draft.team,
      agentConfig: {
        ...draft.team.agentConfig,
        mute: draft.team.agentConfig?.mute?.filter((path) => !path.includes(key))
      }
    },
    nodes: draft.nodes.filter((node) => node.key !== key),
    connections: draft.connections.filter((edge) => edge.from !== key && edge.to !== key)
  }
}

export interface SubAgentSettings {
  title: string
  description: string
  prompt: string
  parentKey: string
  disableMessageHistory: boolean
  required: boolean
  copilotModel: TCopilotModel | null
}

export function updateSubAgent(draft: TXpertTeamDraft, key: string, value: SubAgentSettings): TXpertTeamDraft {
  const parent = eligibleParents(draft, key).find((node) => node.key === value.parentKey)
  const existing = draft.nodes.find((node) => node.key === key)
  if (!value.title.trim() || !parent || key === draft.team.agent?.key || (existing && existing.type !== 'agent')) {
    throw new Error('XP.XpertSettings.Delegation.InvalidParent')
  }
  const node: NodeOf<'agent'> = {
    ...(existing?.type === 'agent'
      ? existing
      : {
          type: 'agent',
          key,
          position: { x: parent.position.x + 320, y: parent.position.y + 220 + delegationAgents(draft).length * 120 }
        }),
    entity: {
      ...(existing?.type === 'agent' ? existing.entity : { key, name: key }),
      title: value.title.trim(),
      description: value.description,
      prompt: value.prompt,
      leaderKey: parent.key,
      copilotModel: value.copilotModel ?? undefined,
      copilotModelId: undefined,
      options: {
        ...(existing?.type === 'agent' ? existing.entity.options : {}),
        disableMessageHistory: value.disableMessageHistory
      }
    }
  }
  const incoming = draft.connections.find((edge) => edge.type === 'agent' && edge.to === key)
  return {
    ...draft,
    nodes: existing ? draft.nodes.map((item) => (item.key === key ? node : item)) : [...draft.nodes, node],
    connections: [
      ...draft.connections.filter((edge) => !(edge.type === 'agent' && edge.to === key)),
      { ...incoming, type: 'agent', key: `${parent.key}/${key}`, from: parent.key, to: key, required: value.required }
    ]
  }
}
