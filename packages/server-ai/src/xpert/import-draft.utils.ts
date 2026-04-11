import {
  IXpert,
  IXpertAgent,
  omitXpertRelations,
  TXpertTeamConnection,
  TXpertTeamNode,
  TXpertTeamDraft
} from '@xpert-ai/contracts'
import { omit } from 'lodash'

const SYSTEM_FIELDS = ['tenantId', 'organizationId', 'id', 'createdById', 'updatedById']
const OVERWRITE_PROTECTED_TEAM_FIELDS = [
  ...SYSTEM_FIELDS,
  'createdAt',
  'updatedAt',
  'workspaceId',
  'type',
  'agent',
  'slug',
  'latest',
  'version',
  'publishAt'
]
const OVERWRITE_PROTECTED_AGENT_FIELDS = [...SYSTEM_FIELDS, 'createdAt', 'updatedAt', 'xpertId', 'key']

export function getLatestPrimaryAgent(draft: Partial<TXpertTeamDraft>, key: string): IXpertAgent {
  const primaryAgentNode = draft.nodes?.find((node) => node.type === 'agent' && node.key === key)
  if (primaryAgentNode) {
    return primaryAgentNode.entity as IXpertAgent
  }

  // Pure workflow drafts can omit a visible primary agent node.
  return {
    key,
    options: {
      hidden: true
    }
  }
}

export function buildOverwriteDraftFromImportedDsl(
  currentXpert: IXpert,
  draft: Partial<TXpertTeamDraft>
): TXpertTeamDraft {
  if (!draft?.team) {
    throw new Error('Missing team definition in imported DSL.')
  }

  if (!currentXpert.agent?.key || !draft.team.agent?.key) {
    throw new Error('Missing primary agent key in imported DSL.')
  }

  const currentTeam = {
    ...omitXpertRelations(currentXpert),
    ...(currentXpert.draft?.team ?? {}),
    agent: currentXpert.agent
  } as TXpertTeamDraft['team']

  const importedPrimaryAgent = getLatestPrimaryAgent(draft, draft.team.agent.key)
  const targetPrimaryAgent = {
    ...currentXpert.agent,
    ...omit(importedPrimaryAgent, ...OVERWRITE_PROTECTED_AGENT_FIELDS),
    key: currentXpert.agent.key
  } as IXpertAgent

  const nextTeam = {
    ...currentTeam,
    ...omit(draft.team, ...OVERWRITE_PROTECTED_TEAM_FIELDS),
    id: currentTeam.id ?? currentXpert.id,
    workspaceId: currentTeam.workspaceId ?? currentXpert.workspaceId,
    type: currentXpert.type,
    agent: targetPrimaryAgent
  } as TXpertTeamDraft['team']

  return replacePrimaryAgentInDraft(
    {
      ...(currentXpert.draft ?? {}),
      ...omit(draft, 'memories'),
      team: nextTeam,
      nodes: draft.nodes ?? [],
      connections: draft.connections ?? []
    } as TXpertTeamDraft,
    draft.team.agent.key,
    targetPrimaryAgent
  )
}

function replacePrimaryAgentInDraft(draft: TXpertTeamDraft, sourceKey: string, agent: IXpertAgent): TXpertTeamDraft {
  const targetKey = agent?.key
  if (!targetKey) {
    throw new Error('Target agent key is required.')
  }

  const nodes = draft.nodes?.map((node) =>
    node.type === 'agent' && node.key === sourceKey
      ? ({
          ...node,
          key: targetKey,
          entity: {
            ...(node.entity ?? {}),
            ...agent,
            key: targetKey
          }
        } as TXpertTeamNode<'agent'>)
      : node
  )

  const connections = draft.connections?.map((connection) => {
    const from = connection.from === sourceKey ? targetKey : connection.from
    const to = connection.to === sourceKey ? targetKey : connection.to

    if (from === connection.from && to === connection.to) {
      return connection
    }

    return {
      ...connection,
      from,
      to,
      key: `${from}/${to}`
    } as TXpertTeamConnection
  })

  return {
    ...draft,
    team: draft.team
      ? {
          ...draft.team,
          agent: draft.team.agent
            ? {
                ...draft.team.agent,
                ...agent,
                key: targetKey
              }
            : {
                ...agent,
                key: targetKey
              }
        }
      : draft.team,
    nodes,
    connections
  } as TXpertTeamDraft
}
