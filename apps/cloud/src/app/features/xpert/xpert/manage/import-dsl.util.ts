import {
  IXpert,
  IXpertAgent,
  LongTermMemoryTypeEnum,
  omitXpertRelations,
  replaceAgentInDraft,
  TMemoryQA,
  TMemoryUserProfile,
  TXpertTeamDraft
} from '../../../../@core'
import { omit } from 'lodash-es'

type TImportedDslMemory = {
  prefix: string
  value: TMemoryQA | TMemoryUserProfile
}

export type TImportedXpertDsl = TXpertTeamDraft & {
  memories?: TImportedDslMemory[]
}

export type TGroupedDslMemories = Partial<Record<LongTermMemoryTypeEnum, Array<TMemoryQA | TMemoryUserProfile>>>

const OVERWRITABLE_TEAM_FIELDS = [
  'title',
  'titleCN',
  'description',
  'avatar',
  'starters',
  'tags',
  'copilotModel',
  'agentConfig',
  'memory',
  'summarize',
  'features',
  'options'
] as const satisfies ReadonlyArray<keyof TXpertTeamDraft['team']>

const OVERWRITE_PROTECTED_AGENT_FIELDS = [
  'tenantId',
  'organizationId',
  'id',
  'createdById',
  'updatedById',
  'createdAt',
  'updatedAt',
  'xpertId',
  'key'
] as const satisfies ReadonlyArray<keyof IXpertAgent>

export function createOverwriteDraftFromDsl(currentXpert: IXpert, importedDsl: TImportedXpertDsl): TXpertTeamDraft {
  if (!currentXpert?.agent?.key) {
    throw new Error('Current xpert primary agent not found')
  }

  if (!importedDsl?.team?.agent?.key) {
    throw new Error('Primary agent not found in DSL')
  }

  if (importedDsl.team.type !== currentXpert.type) {
    throw new Error('DSL type does not match the current xpert')
  }

  const currentTeam = {
    ...omitXpertRelations(currentXpert),
    ...(currentXpert.draft?.team ?? {}),
    agent: currentXpert.agent
  } as TXpertTeamDraft['team']

  const importedPrimaryAgent = importedDsl.nodes?.find(
    (node) => node.type === 'agent' && node.key === importedDsl.team.agent.key
  )?.entity as IXpertAgent | undefined
  const targetPrimaryAgent = importedPrimaryAgent
    ? ({
        ...currentXpert.agent,
        ...omit(importedPrimaryAgent, ...OVERWRITE_PROTECTED_AGENT_FIELDS),
        key: currentXpert.agent.key
      } as IXpertAgent)
    : currentXpert.agent

  const team: TXpertTeamDraft['team'] = { ...currentTeam }
  for (const field of OVERWRITABLE_TEAM_FIELDS) {
    team[field] = importedDsl.team?.[field] as any
  }

  return replaceAgentInDraft(
    {
      ...(currentXpert.draft ?? {}),
      team,
      nodes: importedDsl.nodes ?? [],
      connections: importedDsl.connections ?? []
    } as TXpertTeamDraft,
    importedDsl.team.agent.key,
    targetPrimaryAgent,
    { requireNode: false }
  )
}

export function groupImportedDslMemories(memories?: TImportedDslMemory[]): TGroupedDslMemories | null {
  if (!memories?.length) {
    return null
  }

  const grouped: TGroupedDslMemories = {}
  for (const memory of memories) {
    const segments =
      memory.prefix
        ?.split(':')
        .map((segment) => segment.trim())
        .filter(Boolean) ?? []
    const type = segments[segments.length - 1] as LongTermMemoryTypeEnum | undefined

    if (!type || !isLongTermMemoryType(type)) {
      throw new Error(`Unsupported memory type in prefix: ${memory.prefix}`)
    }

    grouped[type] ??= []
    grouped[type].push(memory.value)
  }

  return grouped
}

function isLongTermMemoryType(type: string): type is LongTermMemoryTypeEnum {
  return Object.values(LongTermMemoryTypeEnum).includes(type as LongTermMemoryTypeEnum)
}
