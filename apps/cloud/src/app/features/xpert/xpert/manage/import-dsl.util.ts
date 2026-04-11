import {
  IXpert,
  LongTermMemoryTypeEnum,
  omitXpertRelations,
  replaceAgentInDraft,
  TMemoryQA,
  TMemoryUserProfile,
  TXpertTeamDraft
} from '../../../../@core'

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
    currentXpert.agent,
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
