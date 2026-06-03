import type {
    IconDefinition,
    SkillMetadata,
    SkillPromptWorkflow,
    SkillSlashCommand,
    SkillSlashCommandAction,
    SkillSlashCommandAvailability,
    SkillSlashCommandCapability
} from '@xpert-ai/contracts'
import { compactObject, nonEmptyArray } from '@xpert-ai/server-common'
import type { RuntimePromptWorkflowCommandSource } from '../prompt-workflow'
import {
    normalizeRuntimeCapabilitiesSelection,
    type TRuntimeCapabilitiesSelection
} from '../shared/agent/runtime-capabilities'

type RuntimeCommandI18nText = NonNullable<SkillSlashCommand['label']>

export const SLASH_COMMAND_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

export const BUILTIN_SLASH_COMMAND_NAMES = new Set([
    'help',
    'clear',
    'plan',
    'goal',
    'skills',
    'plugins',
    'subagents',
    'model',
    'effort',
    'status',
    'mention'
])

type RuntimeCommandTextAction =
    | {
          type: 'insert_text'
          template: string
          runtimeCapabilities?: TRuntimeCapabilitiesSelection
      }
    | {
          type: 'insert_invocation'
          template: string
          runtimeCapabilities?: TRuntimeCapabilitiesSelection
      }
    | {
          type: 'submit_prompt'
          template: string
          runtimeCapabilities?: TRuntimeCapabilitiesSelection
      }

type RuntimeCommandClientAction = Extract<SkillSlashCommandAction, { type: 'client_action' }> & {
    runtimeCapabilities?: TRuntimeCapabilitiesSelection
}

export type RuntimeSlashCommandAction =
    | RuntimeCommandTextAction
    | RuntimeCommandClientAction
    | Extract<SkillSlashCommandAction, { type: 'select_capability' }>

export type RuntimeSlashCommandSource =
    | {
          type: 'skill'
          skillId: string
          workspaceId: string
          label: string
      }
    | {
          type: 'xpert'
          xpertId?: string
          label?: string
      }
    | {
          type: 'workspace_prompt_workflow'
          workflowId?: string
          workspaceId?: string | null
          label?: string
      }
    | {
          type: 'middleware'
          provider: string
          nodeKey: string
          label?: string
      }

export type RuntimeSlashCommand = Omit<SkillSlashCommand, 'action' | 'label' | 'source'> & {
    name: string
    label: NonNullable<SkillSlashCommand['label']>
    action: RuntimeSlashCommandAction
    source: RuntimeSlashCommandSource
}

export type RuntimeCommandSkill = {
    id?: string
    metadata?: (Partial<Pick<SkillMetadata, 'icon' | 'tags'>> & { commands?: unknown }) | null
}

export type RuntimeCommandSkillInput = {
    id: string
    metadata: {
        icon?: SkillSlashCommand['icon']
        tags: string[]
        commands: SkillSlashCommand[]
    }
}

export type RuntimePromptWorkflowCommandInput = {
    sourceType: RuntimePromptWorkflowCommandSource['sourceType']
    workflowId?: string
    workspaceId?: string
    xpertId?: string
    order?: number
    name: string
    label?: string
    description?: string
    icon?: SkillSlashCommand['icon']
    category?: string
    aliases: string[]
    argsHint?: string
    template: string
    tags: string[]
    runtimeCapabilities?: TRuntimeCapabilitiesSelection
}

export type RuntimeCommandOptions = {
    workspaceId: string
    label: string
}

export type RuntimeCommandAllowList = {
    workspaceId?: string | null
    skillIds?: string[]
    pluginNodeKeys?: string[]
    subAgentNodeKeys?: string[]
}

export type RuntimePromptWorkflowCommandOptions = {
    sourceType: 'xpert' | 'workspace_prompt_workflow'
    workspaceId?: string | null
    label?: string
    allowList?: RuntimeCommandAllowList
}

export type RuntimeMiddlewareCommandOptions = {
    provider: string
    nodeKey: string
    label?: string
}

export function parseRuntimeCommandSkill(skill: RuntimeCommandSkill): RuntimeCommandSkillInput | null {
    const id = readTrimmedString(skill.id)
    if (!id) {
        return null
    }

    return {
        id,
        metadata: compactObject<RuntimeCommandSkillInput['metadata']>({
            icon: readIcon(skill.metadata?.icon),
            tags: readStringList(skill.metadata?.tags),
            commands: parseSkillSlashCommands(skill.metadata?.commands)
        })
    }
}

export function parseRuntimePromptWorkflowCommandSource(
    source: RuntimePromptWorkflowCommandSource
): RuntimePromptWorkflowCommandInput | null {
    const name = readSlashCommandName(source.name)
    const template = readTrimmedString(source.template)
    if (!name || !template) {
        return null
    }

    return compactObject<RuntimePromptWorkflowCommandInput>({
        sourceType: source.sourceType,
        workflowId: readTrimmedString(source.workflowId),
        workspaceId: readTrimmedString(source.workspaceId),
        xpertId: readTrimmedString(source.xpertId),
        order: typeof source.order === 'number' ? source.order : undefined,
        name,
        label: readTrimmedString(source.label),
        description: readTrimmedString(source.description),
        icon: readIcon(source.icon),
        category: readTrimmedString(source.category),
        aliases: readStringList(source.aliases),
        argsHint: readTrimmedString(source.argsHint),
        template,
        tags: readStringList(source.tags),
        runtimeCapabilities: normalizeRuntimeCapabilitiesSelection(source.runtimeCapabilities)
    })
}

export function isRuntimeSlashCommandName(value: string): boolean {
    return SLASH_COMMAND_NAME_PATTERN.test(value)
}

export function parseSkillSlashCommands(value: unknown): SkillSlashCommand[] {
    if (!Array.isArray(value)) {
        return []
    }

    return value.map(parseSkillSlashCommand).filter((command): command is SkillSlashCommand => Boolean(command))
}

function parseSkillSlashCommand(value: unknown): SkillSlashCommand | null {
    if (!isPlainObject(value)) {
        return null
    }

    const name = readSlashCommandName(readOwn(value, 'name'))
    const action = parseSkillSlashCommandAction(readOwn(value, 'action'))
    if (!name || !action) {
        return null
    }

    const meta = copyPlainObject(readOwn(value, 'meta'))
    const workflow = parsePromptWorkflow(readOwn(value, 'workflow'))
    const kind = parseCommandKind(readOwn(value, 'kind'))
    const aliases = readStringList(readOwn(value, 'aliases'))
    const availability = parseAvailability(readOwn(value, 'availability'))
    const label = readI18nText(readOwn(value, 'label'))
    const description = readI18nText(readOwn(value, 'description'))
    const icon = readIcon(readOwn(value, 'icon'))
    const category = readTrimmedString(readOwn(value, 'category'))
    const argsHint = readTrimmedString(readOwn(value, 'argsHint'))

    return compactObject<SkillSlashCommand>({
        name,
        label,
        description,
        icon,
        category,
        aliases: nonEmptyArray(aliases),
        argsHint,
        availability,
        kind,
        workflow,
        meta,
        action
    })
}

function parseSkillSlashCommandAction(value: unknown): SkillSlashCommandAction | null {
    if (!isPlainObject(value)) {
        return null
    }

    const type = readOwn(value, 'type')
    if (type === 'insert_text' || type === 'insert_invocation' || type === 'submit_prompt') {
        const template = readTrimmedString(readOwn(value, 'template'))
        if (!template) {
            return null
        }
        return {
            type,
            template
        }
    }

    if (type === 'client_action') {
        const action = parseClientAction(readOwn(value, 'action'))
        return action ? { type: 'client_action', action } : null
    }

    if (type === 'select_capability') {
        const capability = parseSkillSlashCommandCapability(readOwn(value, 'capability'))
        return capability ? { type: 'select_capability', capability } : null
    }

    return null
}

function parseClientAction(
    value: unknown
): Extract<SkillSlashCommandAction, { type: 'client_action' }>['action'] | null {
    if (!isPlainObject(value)) {
        return null
    }

    const type = readTrimmedString(readOwn(value, 'type'))
    if (!type) {
        return null
    }

    const payload = copyPlainObject(readOwn(value, 'payload'))
    return compactObject<Extract<SkillSlashCommandAction, { type: 'client_action' }>['action']>({
        type,
        payload
    })
}

function parseSkillSlashCommandCapability(value: unknown): SkillSlashCommandCapability | null {
    if (!isPlainObject(value)) {
        return null
    }

    const type = readOwn(value, 'type')
    const id = readTrimmedString(readOwn(value, 'id'))
    if (!id || (type !== 'skill' && type !== 'plugin' && type !== 'subAgent')) {
        return null
    }

    return {
        type,
        id
    }
}

function parseAvailability(value: unknown): SkillSlashCommandAvailability | undefined {
    if (!isPlainObject(value)) {
        return undefined
    }

    const disabled = readOwn(value, 'disabled')
    const reason = readTrimmedString(readOwn(value, 'reason'))
    const availability = compactObject<SkillSlashCommandAvailability>({
        disabled: typeof disabled === 'boolean' ? disabled : undefined,
        reason
    })
    return Object.keys(availability).length ? availability : undefined
}

function parsePromptWorkflow(value: unknown): SkillPromptWorkflow | undefined {
    if (value === undefined || value === null) {
        return undefined
    }
    if (!isPlainObject(value)) {
        return undefined
    }

    const type = readOwn(value, 'type')
    if (type !== undefined && type !== null && type !== 'prompt_workflow') {
        return undefined
    }

    const tags = readStringList(readOwn(value, 'tags'))
    const name = readTrimmedString(readOwn(value, 'name'))
    const label = readI18nText(readOwn(value, 'label'))
    const description = readI18nText(readOwn(value, 'description'))
    return compactObject<SkillPromptWorkflow>({
        type: 'prompt_workflow',
        name,
        label,
        description,
        tags: nonEmptyArray(tags)
    })
}

function parseCommandKind(value: unknown): SkillSlashCommand['kind'] | undefined {
    return value === 'command' || value === 'prompt_workflow' ? value : undefined
}

function readOwn(value: object, key: string): unknown {
    return Object.getOwnPropertyDescriptor(value, key)?.value
}

function isPlainObject(value: unknown): value is object {
    return Object.prototype.toString.call(value) === '[object Object]'
}

function readTrimmedString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readI18nText(value: unknown): RuntimeCommandI18nText | undefined {
    if (typeof value === 'string') {
        return value.trim() || undefined
    }
    if (!isPlainObject(value)) {
        return undefined
    }

    const localized: Record<string, string> = {}
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === 'string' && entry.trim()) {
            localized[key] = entry.trim()
        }
    }

    return Object.keys(localized).length ? localized : undefined
}

function readSlashCommandName(value: unknown): string | null {
    const name = readTrimmedString(value)
    return name && SLASH_COMMAND_NAME_PATTERN.test(name) ? name : null
}

function readStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }

    const seen = new Set<string>()
    const result: string[] = []
    for (const item of value) {
        const normalized = readTrimmedString(item)
        if (!normalized || seen.has(normalized)) {
            continue
        }
        seen.add(normalized)
        result.push(normalized)
    }
    return result
}

function readIcon(value: unknown): SkillSlashCommand['icon'] | undefined {
    return readTrimmedString(value) ?? (isIconDefinition(value) ? value : undefined)
}

function isIconDefinition(value: unknown): value is IconDefinition {
    if (!isPlainObject(value)) {
        return false
    }

    const type = readTrimmedString(readOwn(value, 'type'))
    const iconValue = readTrimmedString(readOwn(value, 'value'))
    if (!type || !iconValue) {
        return false
    }

    const size = readOwn(value, 'size')
    const color = readOwn(value, 'color')
    const alt = readOwn(value, 'alt')
    const style = readOwn(value, 'style')

    return (
        (size === undefined || typeof size === 'number') &&
        (color === undefined || typeof color === 'string') &&
        (alt === undefined || typeof alt === 'string') &&
        (style === undefined || isStringMap(style))
    )
}

function isStringMap(value: unknown): boolean {
    if (!isPlainObject(value)) {
        return false
    }
    return Object.keys(value).every((key) => typeof readOwn(value, key) === 'string')
}

function copyPlainObject(value: unknown): SkillSlashCommand['meta'] | undefined {
    if (!isPlainObject(value)) {
        return undefined
    }

    const output: NonNullable<SkillSlashCommand['meta']> = {}
    for (const key of Object.keys(value)) {
        output[key] = readOwn(value, key)
    }
    return Object.keys(output).length ? output : undefined
}
