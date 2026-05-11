import type {
  ChatKitCommandSource,
  ChatKitSlashCommand,
  ChatKitSlashCommandAction,
  ChatKitSlashCommandCapability,
  ChatKitSlashCommandExecutionType,
  RuntimeCapabilitiesSelection
} from '@xpert-ai/chatkit-types'

export type ChatRuntimeCapabilityKind = 'skill' | 'plugin' | 'subAgent'

export type ChatRuntimeCapabilityOption = {
  type: ChatRuntimeCapabilityKind
  id: string
  label: string
  workspaceId?: string
  description?: string
  default?: boolean
  meta?: Record<string, unknown>
  toolNames?: string[]
  toolsetNames?: string[]
  knowledgebaseNames?: string[]
}

export type ChatRuntimeCapabilities = {
  skills: ChatRuntimeCapabilityOption[]
  plugins: ChatRuntimeCapabilityOption[]
  subAgents: ChatRuntimeCapabilityOption[]
  commands: ChatKitSlashCommand[]
}

export type ChatComposerBuiltinCommand = 'plan' | 'skills' | 'plugins' | 'tools' | 'subagents' | 'agents'

export type ChatComposerSlashOption = {
  type: 'command' | 'capability'
  name: string
  label: string
  labelKey?: string
  description?: string
  descriptionKey?: string
  aliases?: string[]
  icon?: string | Record<string, unknown>
  category?: string
  kind?: ChatKitSlashCommand['kind']
  executionType: ChatKitSlashCommandExecutionType
  disabled?: boolean
  disabledReason?: string
  disabledReasonKey?: string
  command?: ChatKitSlashCommand
  capability?: ChatRuntimeCapabilityOption
  childCount?: number
  children?: ChatComposerSlashOption[]
  expanded?: boolean
  selected?: boolean
  builtin?: {
    command: ChatComposerBuiltinCommand
    group?: ChatRuntimeCapabilityKind
  }
  source: 'builtin' | 'runtime'
}

export type ChatComposerSlashRange = {
  trigger: '/' | '$'
  start: number
  end: number
  query: string
}

export type ChatComposerSlashInvocation = {
  name: string
  args: string
}

const SLASH_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

const BUILTIN_OPTIONS: ChatComposerSlashOption[] = [
  {
    type: 'command',
    name: 'plan',
    label: 'Plan mode',
    labelKey: 'PAC.Chat.PlanMode',
    description: 'Plan first, then execute after confirmation.',
    descriptionKey: 'PAC.Chat.PlanModeDesc',
    executionType: 'submit_prompt',
    builtin: { command: 'plan' },
    source: 'builtin'
  },
  {
    type: 'command',
    name: 'skills',
    label: 'Skills',
    labelKey: 'PAC.Chat.Skills',
    description: 'Choose skills for this run.',
    descriptionKey: 'PAC.Chat.SkillsDesc',
    executionType: 'select_capability',
    builtin: { command: 'skills', group: 'skill' },
    source: 'builtin'
  },
  {
    type: 'command',
    name: 'plugins',
    label: 'Plugins',
    labelKey: 'PAC.Chat.Plugins',
    description: 'Choose plugins for this run.',
    descriptionKey: 'PAC.Chat.PluginsDesc',
    aliases: ['tools'],
    executionType: 'select_capability',
    builtin: { command: 'plugins', group: 'plugin' },
    source: 'builtin'
  },
  {
    type: 'command',
    name: 'subagents',
    label: 'Subagents',
    labelKey: 'PAC.Chat.Subagents',
    description: 'Choose subagents for this run.',
    descriptionKey: 'PAC.Chat.SubagentsDesc',
    aliases: ['agents'],
    executionType: 'select_capability',
    builtin: { command: 'subagents', group: 'subAgent' },
    source: 'builtin'
  }
]

export function createEmptyRuntimeCapabilitiesSelection(workspaceId?: string): RuntimeCapabilitiesSelection {
  return {
    mode: 'allowlist',
    skills: {
      ...(workspaceId ? { workspaceId } : {}),
      ids: []
    },
    plugins: {
      nodeKeys: []
    },
    subAgents: {
      nodeKeys: []
    }
  }
}

export function normalizeRuntimeCapabilitiesSelection(
  value: RuntimeCapabilitiesSelection | null | undefined
): RuntimeCapabilitiesSelection | null {
  if (!value || value.mode !== 'allowlist') {
    return null
  }

  return {
    mode: 'allowlist',
    skills: {
      ...(value.skills?.workspaceId ? { workspaceId: value.skills.workspaceId } : {}),
      ids: uniqueStrings(value.skills?.ids)
    },
    plugins: {
      nodeKeys: uniqueStrings(value.plugins?.nodeKeys)
    },
    subAgents: {
      nodeKeys: uniqueStrings(value.subAgents?.nodeKeys)
    }
  }
}

export function hasRuntimeCapabilitiesSelection(value: RuntimeCapabilitiesSelection | null | undefined): boolean {
  const selection = normalizeRuntimeCapabilitiesSelection(value)
  return Boolean(
    selection &&
    (selection.skills.ids.length || selection.plugins.nodeKeys.length || (selection.subAgents?.nodeKeys.length ?? 0))
  )
}

export function mergeRuntimeCapabilitiesSelections(
  ...values: Array<RuntimeCapabilitiesSelection | null | undefined>
): RuntimeCapabilitiesSelection | null {
  const selections = values.map(normalizeRuntimeCapabilitiesSelection).filter(Boolean) as RuntimeCapabilitiesSelection[]
  if (!selections.length) {
    return null
  }

  const workspaceId = selections.find((selection) => selection.skills.workspaceId)?.skills.workspaceId
  const merged = createEmptyRuntimeCapabilitiesSelection(workspaceId)
  for (const selection of selections) {
    merged.skills.ids = uniqueStrings([...merged.skills.ids, ...selection.skills.ids])
    merged.plugins.nodeKeys = uniqueStrings([...merged.plugins.nodeKeys, ...selection.plugins.nodeKeys])
    merged.subAgents = {
      nodeKeys: uniqueStrings([...(merged.subAgents?.nodeKeys ?? []), ...(selection.subAgents?.nodeKeys ?? [])])
    }
  }

  return hasRuntimeCapabilitiesSelection(merged) ? merged : null
}

export function isRuntimeCapabilitySelected(
  selection: RuntimeCapabilitiesSelection | null | undefined,
  option: ChatRuntimeCapabilityOption
): boolean {
  const normalized = normalizeRuntimeCapabilitiesSelection(selection)
  if (!normalized) {
    return false
  }

  if (option.type === 'skill') {
    return normalized.skills.ids.includes(option.id)
  }
  if (option.type === 'plugin') {
    return normalized.plugins.nodeKeys.includes(option.id)
  }
  return Boolean(normalized.subAgents?.nodeKeys.includes(option.id))
}

export function setRuntimeCapabilitySelected(
  selection: RuntimeCapabilitiesSelection | null | undefined,
  option: ChatRuntimeCapabilityOption,
  selected: boolean,
  workspaceId?: string
): RuntimeCapabilitiesSelection | null {
  const normalized =
    normalizeRuntimeCapabilitiesSelection(selection) ?? createEmptyRuntimeCapabilitiesSelection(workspaceId)
  if (workspaceId && !normalized.skills.workspaceId) {
    normalized.skills.workspaceId = workspaceId
  }

  if (option.type === 'skill') {
    normalized.skills.ids = setStringMembership(normalized.skills.ids, option.id, selected)
  } else if (option.type === 'plugin') {
    normalized.plugins.nodeKeys = setStringMembership(normalized.plugins.nodeKeys, option.id, selected)
  } else {
    normalized.subAgents = {
      nodeKeys: setStringMembership(normalized.subAgents?.nodeKeys ?? [], option.id, selected)
    }
  }

  return hasRuntimeCapabilitiesSelection(normalized) ? normalized : null
}

export function toggleRuntimeCapabilitySelection(
  selection: RuntimeCapabilitiesSelection | null | undefined,
  option: ChatRuntimeCapabilityOption,
  workspaceId?: string
): RuntimeCapabilitiesSelection | null {
  return setRuntimeCapabilitySelected(selection, option, !isRuntimeCapabilitySelected(selection, option), workspaceId)
}

export function getSelectedRuntimeCapabilityOptions(
  capabilities: ChatRuntimeCapabilities | null | undefined,
  selection: RuntimeCapabilitiesSelection | null | undefined
): ChatRuntimeCapabilityOption[] {
  if (!capabilities) {
    return []
  }

  return [...capabilities.skills, ...capabilities.plugins, ...capabilities.subAgents].filter((option) =>
    isRuntimeCapabilitySelected(selection, option)
  )
}

export function runtimeCapabilityOptionFromCapability(
  capabilities: ChatRuntimeCapabilities | null | undefined,
  capability: ChatKitSlashCommandCapability
): ChatRuntimeCapabilityOption | null {
  if (!capabilities) {
    return null
  }

  if (capability.type === 'skill') {
    return capabilities.skills.find((option) => option.id === capability.id) ?? null
  }
  if (capability.type === 'plugin') {
    return capabilities.plugins.find((option) => option.id === capability.id) ?? null
  }
  return capabilities.subAgents.find((option) => option.id === capability.id) ?? null
}

export function normalizeChatRuntimeCapabilities(value: unknown): ChatRuntimeCapabilities {
  const record = unwrapRuntimeCapabilitiesRecord(value)
  return {
    skills: normalizeCapabilityOptions(readArrayLike(record, ['skills', 'skillItems']), 'skill'),
    plugins: normalizeCapabilityOptions(
      readArrayLike(record, ['plugins', 'pluginItems', 'toolsets', 'tools']),
      'plugin'
    ),
    subAgents: normalizeCapabilityOptions(
      readArrayLike(record, ['subAgents', 'subagents', 'sub_agents', 'agents']),
      'subAgent'
    ),
    commands: normalizeSlashCommands(readArrayLike(record, ['commands', 'slashCommands', 'runtimeCommands']))
  }
}

export function getRuntimeCapabilityOptions(
  capabilities: ChatRuntimeCapabilities | null | undefined,
  kind: ChatRuntimeCapabilityKind
): ChatRuntimeCapabilityOption[] {
  if (!capabilities) {
    return []
  }
  if (kind === 'skill') {
    return capabilities.skills
  }
  if (kind === 'plugin') {
    return capabilities.plugins
  }
  return capabilities.subAgents
}

export function resolveSlashTrigger(text: string, caretOffset: number): ChatComposerSlashRange | null {
  const beforeCaret = text.slice(0, Math.max(0, caretOffset))
  const lineStart = Math.max(beforeCaret.lastIndexOf('\n'), beforeCaret.lastIndexOf('\r')) + 1
  const linePrefix = beforeCaret.slice(lineStart)
  const match = /(^|\s)([/$])([^\s/]*)$/.exec(linePrefix)
  if (!match) {
    return null
  }

  const start = lineStart + (match.index ?? 0) + match[1].length
  return {
    trigger: match[2] as '/' | '$',
    start,
    end: caretOffset,
    query: match[3].toLowerCase()
  }
}

export function parseSlashInvocation(text: string): ChatComposerSlashInvocation | null {
  const match = /^\s*\/([a-z0-9][a-z0-9_-]{0,63})(?:\s+([\s\S]*))?\s*$/i.exec(text)
  if (!match) {
    return null
  }

  return {
    name: match[1].toLowerCase(),
    args: match[2]?.trim() ?? ''
  }
}

export function buildSlashOptions(
  runtimeCommands: ChatKitSlashCommand[] | null | undefined,
  query = '',
  capabilities?: ChatRuntimeCapabilities | null,
  expandedGroups: readonly ChatRuntimeCapabilityKind[] = [],
  selection?: RuntimeCapabilitiesSelection | null
): ChatComposerSlashOption[] {
  const normalizedQuery = query.trim().toLowerCase()
  const expandedGroupSet = new Set(expandedGroups)
  const builtinOptions = BUILTIN_OPTIONS.map((option) =>
    option.builtin?.group
      ? withCapabilityChildren(option, capabilities, option.builtin.group, expandedGroupSet, selection)
      : option
  )
  const runtimeOptions = (runtimeCommands ?? [])
    .filter((command) => isSupportedRuntimeSlashCommand(command))
    .map(commandToSlashOption)

  return [...builtinOptions, ...runtimeOptions].filter((option) => matchesSlashQuery(option, normalizedQuery))
}

export function buildTriggerOptions(
  runtimeCommands: ChatKitSlashCommand[] | null | undefined,
  range: ChatComposerSlashRange | null | undefined,
  capabilities?: ChatRuntimeCapabilities | null,
  expandedGroups: readonly ChatRuntimeCapabilityKind[] = [],
  selection?: RuntimeCapabilitiesSelection | null
): ChatComposerSlashOption[] {
  if (!range) {
    return []
  }

  if (range.trigger === '$') {
    return buildCapabilitySlashOptions(capabilities, 'skill', range.query, selection)
  }

  return buildSlashOptions(runtimeCommands, range.query, capabilities, expandedGroups, selection)
}

export function buildCapabilitySlashOptions(
  capabilities: ChatRuntimeCapabilities | null | undefined,
  kind: ChatRuntimeCapabilityKind,
  query = '',
  selection?: RuntimeCapabilitiesSelection | null
): ChatComposerSlashOption[] {
  const normalizedQuery = query.trim().toLowerCase()
  return getRuntimeCapabilityOptions(capabilities, kind)
    .map((capability) => ({
      type: 'capability' as const,
      name: capability.id,
      label: capability.label,
      description: capability.description,
      executionType: 'select_capability' as const,
      capability,
      selected: isRuntimeCapabilitySelected(selection, capability),
      source: 'runtime' as const
    }))
    .filter((option) => matchesSlashQuery(option, normalizedQuery))
}

export function findSlashOptionByInvocation(
  options: ChatComposerSlashOption[],
  invocation: ChatComposerSlashInvocation
): ChatComposerSlashOption | null {
  return (
    options.find((option) => {
      if (option.name.toLowerCase() === invocation.name) {
        return true
      }
      return option.aliases?.some((alias) => alias.toLowerCase() === invocation.name)
    }) ?? null
  )
}

export function renderSlashCommandTemplate(template: string, args: string): string {
  const rendered = template.replace(/\{\{\s*args\s*\}\}/g, args)
  if (rendered !== template) {
    return rendered.trim()
  }

  const suffix = args.trim()
  if (!suffix) {
    return rendered
  }

  return `${rendered}${/\s$/.test(rendered) ? '' : ' '}${suffix}`.trim()
}

export function createChatCommandSource(option: ChatComposerSlashOption): ChatKitCommandSource | null {
  if (option.type !== 'command') {
    return null
  }

  return {
    type: 'slash_command',
    name: option.name,
    source: option.source,
    executionType: option.executionType,
    ...(option.kind ? { kind: option.kind } : {}),
    ...(option.command?.workflow ? { workflow: option.command.workflow } : {})
  }
}

export function shouldSubmitRawSlashInvocation(option: ChatComposerSlashOption) {
  if (option.command?.action?.type !== 'insert_invocation') {
    return false
  }

  const sourceType = (option.command as { source?: { type?: unknown } }).source?.type
  return sourceType === 'workspace_prompt_workflow' || sourceType === 'middleware'
}

export function getSlashOptionKey(option: ChatComposerSlashOption) {
  return `${option.type}:${option.source}:${option.name}`
}

export function flattenSlashOptions(options: ChatComposerSlashOption[]): ChatComposerSlashOption[] {
  return options.flatMap((option) => [option, ...(option.children ?? [])])
}

export function getCapabilityKindLabel(kind: ChatRuntimeCapabilityKind) {
  if (kind === 'skill') {
    return 'Skills'
  }
  if (kind === 'plugin') {
    return 'Plugins'
  }
  return 'Subagents'
}

export function getCapabilityKindLabelKey(kind: ChatRuntimeCapabilityKind) {
  if (kind === 'skill') {
    return 'PAC.Chat.Skills'
  }
  if (kind === 'plugin') {
    return 'PAC.Chat.Plugins'
  }
  return 'PAC.Chat.Subagents'
}

function commandToSlashOption(command: ChatKitSlashCommand): ChatComposerSlashOption {
  const action = command.action
  const disabled = command.availability?.disabled
  const disabledReason = disabled ? command.availability?.reason : undefined
  return {
    type: 'command',
    name: command.name,
    label: command.label ?? command.name,
    description: command.description,
    aliases: command.aliases,
    icon: command.icon,
    category: command.category,
    kind: command.kind,
    executionType: action.type,
    disabled,
    disabledReason,
    disabledReasonKey: disabled && !disabledReason ? 'PAC.Chat.CommandUnavailable' : undefined,
    command,
    source: 'runtime'
  }
}

function isSupportedRuntimeSlashCommand(command: ChatKitSlashCommand) {
  if (!SLASH_NAME_PATTERN.test(command.name)) {
    return false
  }

  return command.action?.type !== 'client_action'
}

function matchesSlashQuery(option: ChatComposerSlashOption, query: string) {
  if (!query) {
    return true
  }

  const values = [
    option.name,
    option.label,
    option.description,
    option.type === 'capability' && option.capability?.type === 'skill' ? `$${option.name}` : undefined,
    option.type === 'capability' && option.capability?.type === 'skill' ? `$${option.label}` : undefined,
    ...(option.aliases ?? [])
  ]
  return values.some((value) => value?.toLowerCase().includes(query))
}

function withCapabilityChildren(
  option: ChatComposerSlashOption,
  capabilities: ChatRuntimeCapabilities | null | undefined,
  group: ChatRuntimeCapabilityKind,
  expandedGroups: ReadonlySet<ChatRuntimeCapabilityKind>,
  selection?: RuntimeCapabilitiesSelection | null
): ChatComposerSlashOption {
  const capabilityOptions = getRuntimeCapabilityOptions(capabilities, group)
  const expanded = expandedGroups.has(group)

  return {
    ...option,
    childCount: capabilityOptions.length,
    expanded,
    children: expanded ? buildCapabilitySlashOptions(capabilities, group, '', selection) : []
  }
}

function normalizeSlashCommands(value: unknown): ChatKitSlashCommand[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is ChatKitSlashCommand => {
    const command = item as Partial<ChatKitSlashCommand>
    return Boolean(command?.name && command.action?.type)
  })
}

function normalizeCapabilityOptions(value: unknown, type: ChatRuntimeCapabilityKind) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => normalizeCapabilityOption(item, type))
    .filter((item): item is ChatRuntimeCapabilityOption => Boolean(item))
}

function normalizeCapabilityOption(value: unknown, type: ChatRuntimeCapabilityKind) {
  const record = asRecord(value)
  const id =
    type === 'skill'
      ? readFirstString(record, ['id', 'skillId', 'skill_id', 'key', 'nodeKey', 'node_key'])
      : readFirstString(record, ['nodeKey', 'node_key', 'key', 'id', type === 'plugin' ? 'provider' : 'agentKey'])
  if (!record || !id) {
    return null
  }

  const label = readFirstString(record, ['label', 'title', 'name', 'displayName', 'display_name', 'provider']) || id
  return compactObject<ChatRuntimeCapabilityOption>({
    type,
    id,
    label,
    workspaceId: readFirstString(record, ['workspaceId', 'workspace_id']),
    description: readString(record['description']),
    default: record['default'] === true,
    meta: asRecord(record['meta']) ?? undefined,
    toolNames: readStringList(readFirstValue(record, ['toolNames', 'tool_names'])),
    toolsetNames: readStringList(readFirstValue(record, ['toolsetNames', 'toolset_names'])),
    knowledgebaseNames: readStringList(readFirstValue(record, ['knowledgebaseNames', 'knowledgebase_names']))
  })
}

function setStringMembership(values: string[], value: string, selected: boolean) {
  return selected ? uniqueStrings([...values, value]) : values.filter((item) => item !== value)
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return []
  }

  return Array.from(new Set(values.map((value) => readString(value)).filter(Boolean)))
}

function readStringList(value: unknown) {
  return uniqueStrings(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readFirstString(record: Record<string, unknown> | null | undefined, keys: string[]): string {
  return readString(readFirstValue(record, keys))
}

function readFirstValue(record: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!record) {
    return undefined
  }

  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key]
    }
  }
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function unwrapRuntimeCapabilitiesRecord(value: unknown): Record<string, unknown> | null {
  let record = asRecord(value)
  for (const key of ['data', 'result', 'capabilities', 'runtimeCapabilities', 'runtime_capabilities']) {
    const nested = asRecord(record?.[key])
    if (nested) {
      record = nested
    }
  }
  return record
}

function readArrayLike(record: Record<string, unknown> | null, keys: string[]): unknown[] {
  const value = readFirstValue(record, keys)
  if (Array.isArray(value)) {
    return value
  }

  const wrapped = asRecord(value)
  if (Array.isArray(wrapped?.['items'])) {
    return wrapped['items'] as unknown[]
  }
  if (Array.isArray(wrapped?.['data'])) {
    return wrapped['data'] as unknown[]
  }
  return []
}

function compactObject<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null)) as T
}

export function getSlashCommandActionRuntimeCapabilities(
  action: ChatKitSlashCommandAction | null | undefined
): RuntimeCapabilitiesSelection | null {
  if (!action || !('runtimeCapabilities' in action)) {
    return null
  }

  return normalizeRuntimeCapabilitiesSelection(action.runtimeCapabilities as RuntimeCapabilitiesSelection | null)
}
