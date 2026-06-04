import {
  IXpert,
  IXpertAgent,
  LongTermMemoryTypeEnum,
  omitXpertRelations,
  replaceAgentInDraft,
  TAgentOutputVariable,
  TAgentPromptTemplate,
  TMemoryQA,
  TMemoryUserProfile,
  TXpertParameter,
  XpertParameterTypeEnum,
  TXpertTeamDraft
} from '../../../../@core'

type TImportedDslMemory = {
  prefix: string
  value: TMemoryQA | TMemoryUserProfile
}

type TImportedAgentOptions = NonNullable<IXpertAgent['options']>
type TImportedCopilotModel = NonNullable<IXpertAgent['copilotModel']>

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

const AGENT_PROMPT_TEMPLATE_ROLES = ['ai', 'human'] as const
const AGENT_OUTPUT_VARIABLE_OPERATIONS = ['append', 'extends', 'overwrite', 'clear'] as const

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

  const importedPrimaryAgentNode = importedDsl.nodes?.find(
    (node) => node.type === 'agent' && node.key === importedDsl.team.agent.key
  )
  const importedPrimaryAgentPatch = importedPrimaryAgentNode
    ? parseImportedPrimaryAgentPatch(importedPrimaryAgentNode.entity)
    : null
  const targetPrimaryAgent = importedPrimaryAgentPatch
    ? {
        ...currentXpert.agent,
        ...importedPrimaryAgentPatch,
        key: currentXpert.agent.key
      }
    : currentXpert.agent
  const nodes =
    importedDsl.nodes?.map((node) =>
      node.type === 'agent' && node.key === importedDsl.team.agent.key
        ? {
            ...node,
            entity: {
              key: importedDsl.team.agent.key,
              ...(importedPrimaryAgentPatch ?? {})
            }
          }
        : node
    ) ?? []

  const team: TXpertTeamDraft['team'] = { ...currentTeam }
  for (const field of OVERWRITABLE_TEAM_FIELDS) {
    team[field] = importedDsl.team?.[field] as any
  }

  return replaceAgentInDraft(
    {
      ...(currentXpert.draft ?? {}),
      team,
      nodes,
      connections: importedDsl.connections ?? []
    } as TXpertTeamDraft,
    importedDsl.team.agent.key,
    targetPrimaryAgent,
    { requireNode: false }
  )
}

function parseImportedPrimaryAgentPatch(value: unknown): Partial<IXpertAgent> {
  if (!hasStringProperty(value, 'key')) {
    throw new Error('Primary agent not found in DSL')
  }

  const patch: Partial<IXpertAgent> = {}
  const prompt = readOptionalString(value, 'prompt')
  if (prompt !== undefined) {
    patch.prompt = prompt
  }

  const promptTemplates = readOptionalArray(value, 'promptTemplates', isAgentPromptTemplate)
  if (promptTemplates !== undefined) {
    patch.promptTemplates = promptTemplates
  }

  const parameters = readOptionalArray(value, 'parameters', isXpertParameter)
  if (parameters !== undefined) {
    patch.parameters = parameters
  }

  const outputVariables = readOptionalArray(value, 'outputVariables', isAgentOutputVariable)
  if (outputVariables !== undefined) {
    patch.outputVariables = outputVariables
  }

  const options = readOptionalObject(value, 'options', isXpertAgentOptions)
  if (options !== undefined) {
    patch.options = options
  }

  const copilotModel = readOptionalObject(value, 'copilotModel', isCopilotModel)
  if (copilotModel !== undefined) {
    patch.copilotModel = copilotModel
  }

  return patch
}

function readOptionalString(value: object, key: string) {
  if (!(key in value)) {
    return undefined
  }

  const item = Reflect.get(value, key)
  if (item == null) {
    return undefined
  }

  if (typeof item !== 'string') {
    throw new Error(`Invalid primary agent field: ${key}`)
  }

  return item
}

function readOptionalArray<T>(value: object, key: string, isItem: (item: unknown) => item is T) {
  if (!(key in value)) {
    return undefined
  }

  const item: unknown = Reflect.get(value, key)
  if (item == null) {
    return undefined
  }

  if (!Array.isArray(item)) {
    throw new Error(`Invalid primary agent field: ${key}`)
  }

  const result: T[] = []
  for (const element of item) {
    if (!isItem(element)) {
      throw new Error(`Invalid primary agent field: ${key}`)
    }
    result.push(element)
  }

  return result
}

function readOptionalObject<T extends object>(value: object, key: string, isValue: (item: unknown) => item is T) {
  if (!(key in value)) {
    return undefined
  }

  const item: unknown = Reflect.get(value, key)
  if (item == null) {
    return undefined
  }

  if (!isValue(item)) {
    throw new Error(`Invalid primary agent field: ${key}`)
  }

  return item
}

function isAgentPromptTemplate(value: unknown): value is TAgentPromptTemplate {
  return (
    isObject(value) &&
    hasStringProperty(value, 'id') &&
    isOneOf(Reflect.get(value, 'role'), AGENT_PROMPT_TEMPLATE_ROLES) &&
    hasStringProperty(value, 'text')
  )
}

function isXpertParameter(value: unknown): value is TXpertParameter {
  return isObject(value) && isXpertParameterType(Reflect.get(value, 'type')) && hasStringProperty(value, 'name')
}

function isAgentOutputVariable(value: unknown): value is TAgentOutputVariable {
  return (
    isXpertParameter(value) &&
    hasStringProperty(value, 'variableSelector') &&
    isOneOf(Reflect.get(value, 'operation'), AGENT_OUTPUT_VARIABLE_OPERATIONS)
  )
}

function isXpertAgentOptions(value: unknown): value is TImportedAgentOptions {
  if (!isObject(value)) {
    return false
  }

  return (
    hasOptionalBooleanProperties(value, ['hidden', 'disableMessageHistory', 'parallelToolCalls']) &&
    hasOptionalStringProperties(value, ['historyVariable', 'structuredOutputMethod']) &&
    (!hasProperty(value, 'memories') || isOptionalArray(Reflect.get(value, 'memories'))) &&
    (!hasProperty(value, 'fileUnderstanding') || isFileUnderstandingOptions(Reflect.get(value, 'fileUnderstanding')))
  )
}

function isFileUnderstandingOptions(value: unknown): value is TImportedAgentOptions['fileUnderstanding'] {
  return isObject(value) && hasOptionalBooleanProperties(value, ['enabled'])
}

function isCopilotModel(value: unknown): value is TImportedCopilotModel {
  if (!isObject(value)) {
    return false
  }

  return (
    hasOptionalStringProperties(value, ['copilotId', 'referencedId', 'modelType', 'model']) &&
    (!hasProperty(value, 'options') || isOptionalObject(Reflect.get(value, 'options')))
  )
}

function hasOptionalBooleanProperties(value: object, keys: readonly string[]) {
  for (const key of keys) {
    if (hasProperty(value, key) && !isOptionalBoolean(Reflect.get(value, key))) {
      return false
    }
  }

  return true
}

function hasOptionalStringProperties(value: object, keys: readonly string[]) {
  for (const key of keys) {
    if (hasProperty(value, key) && !isOptionalString(Reflect.get(value, key))) {
      return false
    }
  }

  return true
}

function isXpertParameterType(value: unknown): value is XpertParameterTypeEnum {
  return typeof value === 'string' && Object.values(XpertParameterTypeEnum).includes(value as XpertParameterTypeEnum)
}

function isOptionalArray(value: unknown) {
  return value == null || Array.isArray(value)
}

function isOptionalObject(value: unknown) {
  return value == null || isObject(value)
}

function isOptionalString(value: unknown) {
  return value == null || typeof value === 'string'
}

function isOptionalBoolean(value: unknown) {
  return value == null || typeof value === 'boolean'
}

function isOneOf<T extends string>(value: unknown, items: readonly T[]): value is T {
  return typeof value === 'string' && items.includes(value as T)
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasProperty<K extends string>(value: object, key: K): value is object & { [P in K]: unknown } {
  return key in value
}

function hasStringProperty<K extends string>(value: unknown, key: K): value is object & { [P in K]: string } {
  return isObject(value) && key in value && typeof Reflect.get(value, key) === 'string'
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
