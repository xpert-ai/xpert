import { Injectable } from '@nestjs/common'
import { compactObject, nonEmptyArray } from '@xpert-ai/server-common'
import type {
    SkillPromptWorkflow,
    SkillSlashCommand,
    SkillSlashCommandAction,
    TXpertCommandProfileEntry
} from '@xpert-ai/contracts'
import type { RuntimePromptWorkflowCommandSource } from '../prompt-workflow'
import type { TRuntimeCapabilitiesSelection } from '../shared/agent/runtime-capabilities'
import {
    BUILTIN_SLASH_COMMAND_NAMES,
    isRuntimeSlashCommandName,
    parseRuntimeCommandSkill,
    parseRuntimePromptWorkflowCommandSource,
    parseSkillSlashCommands,
    RuntimeCommandAllowList,
    RuntimeMiddlewareCommandOptions,
    RuntimeCommandOptions,
    RuntimeCommandSkill,
    RuntimeCommandSkillInput,
    RuntimePromptWorkflowCommandInput,
    RuntimePromptWorkflowCommandOptions,
    RuntimeSlashCommand,
    RuntimeSlashCommandAction,
    RuntimeSlashCommandSource
} from './runtime-command.guards'

@Injectable()
export class RuntimeCommandService {
    normalizeSkillRuntimeSlashCommands(
        skill: RuntimeCommandSkill,
        options: RuntimeCommandOptions
    ): RuntimeSlashCommand[] {
        const parsedSkill = parseRuntimeCommandSkill(skill)
        if (!parsedSkill) {
            return []
        }

        return parsedSkill.metadata.commands
            .map((command) => this.createSkillRuntimeSlashCommand(parsedSkill, command, options))
            .filter((command): command is RuntimeSlashCommand => !!command)
    }

    normalizePromptWorkflowRuntimeSlashCommands(
        sources: RuntimePromptWorkflowCommandSource[],
        options: RuntimePromptWorkflowCommandOptions
    ): RuntimeSlashCommand[] {
        return sources
            .map(parseRuntimePromptWorkflowCommandSource)
            .filter((source): source is RuntimePromptWorkflowCommandInput => !!source)
            .map((source) => this.createPromptWorkflowRuntimeSlashCommand(source, options))
            .filter((command): command is RuntimeSlashCommand => !!command)
    }

    normalizeMiddlewareRuntimeSlashCommands(
        commands: unknown,
        options: RuntimeMiddlewareCommandOptions
    ): RuntimeSlashCommand[] {
        return parseSkillSlashCommands(commands)
            .map((command) => this.createMiddlewareRuntimeSlashCommand(command, options))
            .filter((command): command is RuntimeSlashCommand => !!command)
    }

    selectProfileSkillRuntimeSlashCommands(
        commands: RuntimeSlashCommand[],
        skillEntries: TXpertCommandProfileEntry[]
    ): RuntimeSlashCommand[] {
        if (!skillEntries.length) {
            return commands
        }

        const commandMap = new Map(commands.map((command) => [command.name, command] as const))

        return skillEntries
            .filter((entry) => entry.enabled !== false)
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
            .map((entry) => commandMap.get(entry.skillCommandName ?? entry.name ?? ''))
            .filter((command): command is RuntimeSlashCommand => !!command)
    }

    mergeRuntimeSlashCommands(commandGroups: RuntimeSlashCommand[][]): RuntimeSlashCommand[] {
        const result: RuntimeSlashCommand[] = []
        const seen = new Set<string>()

        for (const group of commandGroups) {
            for (const command of group) {
                if (
                    !isRuntimeSlashCommandName(command.name) ||
                    isBlockedBuiltinCommand(command) ||
                    seen.has(command.name)
                ) {
                    continue
                }
                seen.add(command.name)
                result.push(command)
            }
        }

        return result
    }

    private createSkillRuntimeSlashCommand(
        skill: RuntimeCommandSkillInput,
        command: SkillSlashCommand,
        options: RuntimeCommandOptions
    ): RuntimeSlashCommand | null {
        const runtimeCapabilities = createSkillRuntimeCapabilities(options.workspaceId, skill.id)
        const action = this.createSkillRuntimeSlashCommandAction(command.action, runtimeCapabilities, skill.id)
        if (!action) {
            return null
        }

        const label = command.label ?? command.name
        const description = command.description
        const icon = command.icon ?? skill.metadata.icon
        const kind =
            command.kind ??
            (action.type === 'submit_prompt' || action.type === 'insert_invocation' ? 'prompt_workflow' : 'command')
        const workflow = this.createSkillPromptWorkflow(command.workflow, {
            kind,
            name: command.name,
            label,
            description,
            tags: skill.metadata.tags
        })
        const meta = createCommandMeta(command.meta, icon)
        const category = command.category ?? (kind === 'prompt_workflow' ? 'prompt_workflow' : undefined)
        const argsHint = command.argsHint ?? inferArgsHint(action)

        return compactObject<RuntimeSlashCommand>({
            name: command.name,
            label,
            description,
            icon,
            category,
            aliases: nonEmptyArray(command.aliases),
            argsHint,
            availability: command.availability,
            kind: kind === 'prompt_workflow' ? kind : undefined,
            workflow,
            meta,
            action,
            source: {
                type: 'skill',
                skillId: skill.id,
                workspaceId: options.workspaceId,
                label: options.label
            }
        })
    }

    private createSkillRuntimeSlashCommandAction(
        action: SkillSlashCommandAction,
        runtimeCapabilities: TRuntimeCapabilitiesSelection,
        skillId: string
    ): RuntimeSlashCommandAction | null {
        if (action.type === 'insert_text' || action.type === 'insert_invocation' || action.type === 'submit_prompt') {
            return {
                type: action.type,
                template: action.template,
                runtimeCapabilities
            }
        }

        if (action.type === 'client_action') {
            return {
                type: 'client_action',
                action: compactObject<Extract<SkillSlashCommandAction, { type: 'client_action' }>['action']>({
                    type: action.action.type,
                    payload: action.action.payload
                })
            }
        }

        if (action.type === 'select_capability') {
            const capability = action.capability
            if (!capability || capability.type !== 'skill' || capability.id !== skillId) {
                return null
            }

            return {
                type: 'select_capability',
                capability
            }
        }

        return null
    }

    private createMiddlewareRuntimeSlashCommand(
        command: SkillSlashCommand,
        options: RuntimeMiddlewareCommandOptions
    ): RuntimeSlashCommand | null {
        const action = this.createMiddlewareRuntimeSlashCommandAction(
            command.name,
            command.action,
            createMiddlewareRuntimeCapabilities(options.nodeKey)
        )
        if (!action) {
            return null
        }

        const label = command.label ?? command.name
        const description = command.description
        const kind =
            command.kind ??
            (action.type === 'submit_prompt' || action.type === 'insert_invocation' ? 'prompt_workflow' : 'command')
        const workflow = this.createSkillPromptWorkflow(command.workflow, {
            kind,
            name: command.name,
            label,
            description,
            tags: []
        })
        const meta = createCommandMeta(command.meta, command.icon)
        const category = command.category ?? (kind === 'prompt_workflow' ? 'prompt_workflow' : undefined)
        const argsHint = command.argsHint ?? inferArgsHint(action)

        return compactObject<RuntimeSlashCommand>({
            name: command.name,
            label,
            description,
            icon: command.icon,
            category,
            aliases: nonEmptyArray(command.aliases),
            argsHint,
            availability: command.availability,
            kind: kind === 'prompt_workflow' ? kind : undefined,
            workflow,
            meta,
            action,
            source: {
                type: 'middleware',
                provider: options.provider,
                nodeKey: options.nodeKey,
                label: options.label
            }
        })
    }

    private createMiddlewareRuntimeSlashCommandAction(
        commandName: string,
        action: SkillSlashCommandAction,
        runtimeCapabilities: TRuntimeCapabilitiesSelection
    ): RuntimeSlashCommandAction | null {
        if (action.type === 'submit_prompt') {
            return {
                type: 'submit_prompt',
                template: action.template,
                runtimeCapabilities
            }
        }

        if (action.type === 'insert_text' || action.type === 'insert_invocation') {
            return {
                type: 'insert_invocation',
                template: `/${commandName} `,
                runtimeCapabilities
            }
        }

        if (action.type === 'client_action') {
            return {
                type: 'client_action',
                action: compactObject<Extract<SkillSlashCommandAction, { type: 'client_action' }>['action']>({
                    type: action.action.type,
                    payload: action.action.payload
                })
            }
        }

        return null
    }

    private createPromptWorkflowRuntimeSlashCommand(
        source: RuntimePromptWorkflowCommandInput,
        options: RuntimePromptWorkflowCommandOptions
    ): RuntimeSlashCommand | null {
        const label = source.label ?? source.name
        const runtimeCapabilities = filterRuntimeCapabilitiesByAllowList(
            source.runtimeCapabilities,
            createPromptWorkflowAllowList(options)
        )
        const action = compactObject<RuntimeSlashCommandAction>({
            type: this.getPromptWorkflowActionType(options),
            template: this.getPromptWorkflowActionTemplate(source, options),
            runtimeCapabilities
        })

        const sourcePayload = createPromptWorkflowSourcePayload(source, options)
        const workflow = compactObject<SkillPromptWorkflow>({
            type: 'prompt_workflow',
            name: source.name,
            label,
            description: source.description,
            tags: nonEmptyArray(source.tags)
        })

        const argsHint = source.argsHint ?? inferArgsHintFromTemplate(source.template)

        return compactObject<RuntimeSlashCommand>({
            name: source.name,
            label,
            description: source.description,
            icon: source.icon,
            category: source.category ?? 'prompt_workflow',
            aliases: nonEmptyArray(source.aliases),
            argsHint,
            kind: 'prompt_workflow',
            workflow,
            action,
            source: sourcePayload
        })
    }

    private getPromptWorkflowActionType(
        options: RuntimePromptWorkflowCommandOptions
    ): Extract<RuntimeSlashCommandAction['type'], 'insert_invocation' | 'submit_prompt'> {
        return options.sourceType === 'workspace_prompt_workflow' ? 'insert_invocation' : 'submit_prompt'
    }

    private getPromptWorkflowActionTemplate(
        source: RuntimePromptWorkflowCommandInput,
        options: RuntimePromptWorkflowCommandOptions
    ): string {
        return options.sourceType === 'workspace_prompt_workflow' ? `/${source.name} ` : source.template
    }

    private createSkillPromptWorkflow(
        value: SkillSlashCommand['workflow'],
        defaults: {
            kind: NonNullable<SkillSlashCommand['kind']>
            name: string
            label: NonNullable<SkillSlashCommand['label']>
            description?: SkillSlashCommand['description']
            tags: string[]
        }
    ): SkillPromptWorkflow | undefined {
        if (defaults.kind !== 'prompt_workflow') {
            return undefined
        }

        const tags = value?.tags?.length ? value.tags : defaults.tags
        const description = value?.description ?? defaults.description
        return compactObject<SkillPromptWorkflow>({
            type: 'prompt_workflow',
            name: value?.name ?? defaults.name,
            label: value?.label ?? defaults.label,
            description,
            tags: nonEmptyArray(tags)
        })
    }
}

function createMiddlewareRuntimeCapabilities(nodeKey: string): TRuntimeCapabilitiesSelection {
    return {
        mode: 'allowlist',
        skills: {
            ids: []
        },
        plugins: {
            nodeKeys: [nodeKey]
        },
        subAgents: {
            nodeKeys: []
        }
    }
}

function createSkillRuntimeCapabilities(workspaceId: string, skillId: string): TRuntimeCapabilitiesSelection {
    return {
        mode: 'allowlist',
        skills: {
            workspaceId,
            ids: [skillId]
        },
        plugins: {
            nodeKeys: []
        },
        subAgents: {
            nodeKeys: []
        }
    }
}

function createPromptWorkflowSourcePayload(
    source: RuntimePromptWorkflowCommandInput,
    options: RuntimePromptWorkflowCommandOptions
): RuntimeSlashCommandSource {
    if (options.sourceType === 'xpert') {
        return compactObject<RuntimeSlashCommandSource>({
            type: 'xpert',
            xpertId: source.xpertId,
            label: options.label
        })
    }

    return compactObject<RuntimeSlashCommandSource>({
        type: 'workspace_prompt_workflow',
        workflowId: source.workflowId,
        workspaceId: source.workspaceId ?? options.workspaceId,
        label: options.label
    })
}

function createPromptWorkflowAllowList(options: RuntimePromptWorkflowCommandOptions): RuntimeCommandAllowList {
    const sourceAllowList = options.allowList
    return compactObject<RuntimeCommandAllowList>({
        workspaceId: options.workspaceId ?? sourceAllowList?.workspaceId,
        skillIds: sourceAllowList?.skillIds,
        pluginNodeKeys: sourceAllowList?.pluginNodeKeys,
        subAgentNodeKeys: sourceAllowList?.subAgentNodeKeys
    })
}

function createCommandMeta(
    meta: SkillSlashCommand['meta'],
    icon: SkillSlashCommand['icon'] | undefined
): SkillSlashCommand['meta'] | undefined {
    const commandMeta = compactObject<NonNullable<SkillSlashCommand['meta']>>(Object.assign({}, meta, { icon }))
    return Object.keys(commandMeta).length ? commandMeta : undefined
}

function inferArgsHint(action: RuntimeSlashCommandAction): string | undefined {
    return action.type === 'insert_text' || action.type === 'insert_invocation' || action.type === 'submit_prompt'
        ? inferArgsHintFromTemplate(action.template)
        : undefined
}

function inferArgsHintFromTemplate(template: string): string | undefined {
    return /\{\{\s*args\s*\}\}/.test(template) ? '<args>' : undefined
}

function isBlockedBuiltinCommand(command: RuntimeSlashCommand): boolean {
    return BUILTIN_SLASH_COMMAND_NAMES.has(command.name) && command.source.type !== 'middleware'
}

function filterRuntimeCapabilitiesByAllowList(
    value: TRuntimeCapabilitiesSelection | undefined,
    allowList?: RuntimeCommandAllowList
): TRuntimeCapabilitiesSelection | null {
    if (!value) {
        return null
    }

    const skillIds = new Set(allowList?.skillIds ?? [])
    const pluginNodeKeys = new Set(allowList?.pluginNodeKeys ?? [])
    const subAgentNodeKeys = new Set(allowList?.subAgentNodeKeys ?? [])
    const workspaceId = allowList?.workspaceId ?? value.skills.workspaceId
    const restrictSkills = Array.isArray(allowList?.skillIds)
    const restrictPlugins = Array.isArray(allowList?.pluginNodeKeys)
    const restrictSubAgents = Array.isArray(allowList?.subAgentNodeKeys)

    return {
        mode: 'allowlist',
        skills: compactObject<TRuntimeCapabilitiesSelection['skills']>({
            workspaceId,
            ids: value.skills.ids.filter((id) => !restrictSkills || skillIds.has(id))
        }),
        plugins: {
            nodeKeys: value.plugins.nodeKeys.filter((nodeKey) => !restrictPlugins || pluginNodeKeys.has(nodeKey))
        },
        subAgents: {
            nodeKeys: value.subAgents.nodeKeys.filter((nodeKey) => !restrictSubAgents || subAgentNodeKeys.has(nodeKey))
        }
    }
}
