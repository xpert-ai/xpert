import {
    getAgentMiddlewareNodes,
    normalizeMiddlewareProvider,
    type IWFNMiddleware,
    type IXpert,
    type SkillPromptWorkflow,
    type SkillSlashCommand,
    type SkillSlashCommandAction,
    type TChatRequestHuman
} from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { compactObject, nonEmptyArray } from '@xpert-ai/server-common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import {
    isPromptWorkflowInvocationCandidate,
    parsePromptWorkflowInvocation,
    renderPromptWorkflowTemplate
} from '../../../shared/agent/prompt-workflow-invocation'
import { ResolvePromptWorkflowInvocationQuery } from '../../../shared/agent/queries/resolve-prompt-workflow-invocation.query'
import type { PromptWorkflowInvocationResolution } from '../../../shared/agent/queries/resolve-prompt-workflow-invocation.query'
import {
    mergeRuntimeCapabilitiesSelection,
    normalizeRuntimeCapabilitiesSelection
} from '../../../shared/agent/runtime-capabilities'
import { PromptWorkflowService } from '../../prompt-workflow.service'
import type { RuntimePromptWorkflowCommandSource } from '../../prompt-workflow.service'

const SLASH_COMMAND_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
const RESERVED_PROMPT_WORKFLOW_INVOCATION_NAMES = new Set([
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

type TemplateSlashCommandAction = Extract<
    SkillSlashCommandAction,
    { type: 'insert_text' | 'insert_invocation' | 'submit_prompt' }
>

type MiddlewareSlashCommandSource = {
    provider: string
    nodeKey: string
    command: SkillSlashCommand
    action: TemplateSlashCommandAction
}

type PromptWorkflowCommandSourceMetadata = {
    type: 'slash_command'
    name: string
    source: 'runtime'
    executionType: TemplateSlashCommandAction['type']
    kind?: SkillSlashCommand['kind']
    workflow?: SkillPromptWorkflow
}

type PromptWorkflowInvocationDetails = PromptWorkflowInvocationResolution & {
    args: string
    commandSource: PromptWorkflowCommandSourceMetadata
    source: RuntimePromptWorkflowCommandSource | MiddlewareSlashCommandSource
}

@QueryHandler(ResolvePromptWorkflowInvocationQuery)
export class ResolvePromptWorkflowInvocationHandler implements IQueryHandler<ResolvePromptWorkflowInvocationQuery> {
    constructor(
        private readonly promptWorkflowService: PromptWorkflowService,
        private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry
    ) {}

    async execute(query: ResolvePromptWorkflowInvocationQuery) {
        if (!query.input.input || !isPromptWorkflowInvocationCandidate(query.input.input)) {
            return null
        }

        const middlewareResolution = applyMiddlewareSlashCommandInvocation(
            query.input,
            resolveMiddlewareSlashCommandSources(query.xpert, this.agentMiddlewareRegistry)
        )
        if (middlewareResolution) {
            return middlewareResolution
        }

        const commandProfile = await this.promptWorkflowService.resolveRuntimeCommandProfile(query.xpert)
        return applyPromptWorkflowInvocation(query.input, [
            ...commandProfile.xpertCommands,
            ...commandProfile.workspaceCommands
        ])
    }
}

function applyPromptWorkflowInvocation(
    input: TChatRequestHuman | null | undefined,
    sources: RuntimePromptWorkflowCommandSource[] | null | undefined
): PromptWorkflowInvocationDetails | null {
    if (!input || !sources?.length || typeof input.input !== 'string') {
        return null
    }

    const invocation = parsePromptWorkflowInvocation(input.input)
    if (!invocation) {
        return null
    }

    if (RESERVED_PROMPT_WORKFLOW_INVOCATION_NAMES.has(invocation.name)) {
        return null
    }

    const source = findPromptWorkflowCommandSource(sources, invocation.name)
    if (!source) {
        return null
    }

    const runtimeCapabilities = mergeRuntimeCapabilitiesSelection(
        normalizeRuntimeCapabilitiesSelection(input.runtimeCapabilities),
        normalizeRuntimeCapabilitiesSelection(source.runtimeCapabilities)
    )
    const commandSource = createPromptWorkflowCommandSource(source)
    const nextInput = compactObject<TChatRequestHuman>({
        ...input,
        input: renderPromptWorkflowTemplate(source.template, invocation.args),
        commandSource,
        runtimeCapabilities
    })

    return {
        input: nextInput,
        args: invocation.args,
        commandSource,
        source
    }
}

function findPromptWorkflowCommandSource(
    sources: RuntimePromptWorkflowCommandSource[],
    name: string
): RuntimePromptWorkflowCommandSource | null {
    for (const source of sources) {
        if (matchesPromptWorkflowCommandSource(source, name)) {
            return source
        }
    }
    return null
}

function matchesPromptWorkflowCommandSource(source: RuntimePromptWorkflowCommandSource, name: string): boolean {
    return getPromptWorkflowInvocationNames(source).includes(name)
}

function getPromptWorkflowInvocationNames(source: RuntimePromptWorkflowCommandSource): string[] {
    return [source.name, ...(source.aliases ?? [])].filter(
        (value): value is string => typeof value === 'string' && SLASH_COMMAND_NAME_PATTERN.test(value)
    )
}

function applyMiddlewareSlashCommandInvocation(
    input: TChatRequestHuman | null | undefined,
    sources: MiddlewareSlashCommandSource[]
): PromptWorkflowInvocationDetails | null {
    if (!input || !sources.length || typeof input.input !== 'string') {
        return null
    }

    const invocation = parsePromptWorkflowInvocation(input.input)
    if (!invocation) {
        return null
    }

    const source = findMiddlewareSlashCommandSource(sources, invocation.name)
    if (!source) {
        return null
    }

    const runtimeCapabilities = mergeRuntimeCapabilitiesSelection(
        normalizeRuntimeCapabilitiesSelection(input.runtimeCapabilities),
        normalizeRuntimeCapabilitiesSelection(createMiddlewareRuntimeCapabilities(source.nodeKey))
    )
    const commandSource = createMiddlewareCommandSource(source)
    const nextInput = compactObject<TChatRequestHuman>({
        ...input,
        input: renderPromptWorkflowTemplate(source.action.template, invocation.args),
        commandSource,
        runtimeCapabilities
    })

    return {
        input: nextInput,
        args: invocation.args,
        commandSource,
        source
    }
}

function resolveMiddlewareSlashCommandSources(
    xpert: Pick<IXpert, 'graph' | 'agent'>,
    agentMiddlewareRegistry: AgentMiddlewareRegistry
): MiddlewareSlashCommandSource[] {
    const agentKey = getPrimaryAgentKey(xpert)
    if (!agentKey || !xpert.graph) {
        return []
    }

    const sources: MiddlewareSlashCommandSource[] = []
    for (const node of getAgentMiddlewareNodes(xpert.graph, agentKey)) {
        const entity = node.entity as unknown as IWFNMiddleware
        const provider = normalizeMiddlewareProvider(entity?.provider)
        if (!provider) {
            continue
        }

        const strategy = tryGetMiddlewareStrategy(agentMiddlewareRegistry, provider)
        for (const command of normalizeMiddlewareSlashCommands(strategy?.meta?.slashCommands)) {
            const action = getTemplateSlashCommandAction(command)
            if (!action) {
                continue
            }
            sources.push({
                provider,
                nodeKey: node.key,
                command,
                action
            })
        }
    }

    return sources
}

function findMiddlewareSlashCommandSource(
    sources: MiddlewareSlashCommandSource[],
    name: string
): MiddlewareSlashCommandSource | null {
    for (const source of sources) {
        if (getMiddlewareInvocationNames(source.command).includes(name)) {
            return source
        }
    }
    return null
}

function getMiddlewareInvocationNames(command: SkillSlashCommand): string[] {
    return [command.name, ...(command.aliases ?? [])].filter(
        (value): value is string => typeof value === 'string' && SLASH_COMMAND_NAME_PATTERN.test(value)
    )
}

function normalizeMiddlewareSlashCommands(commands: SkillSlashCommand[] | null | undefined): SkillSlashCommand[] {
    return Array.isArray(commands) ? commands : []
}

function getTemplateSlashCommandAction(command: SkillSlashCommand): TemplateSlashCommandAction | null {
    const action = command.action
    if (
        (action.type === 'insert_text' || action.type === 'insert_invocation' || action.type === 'submit_prompt') &&
        action.template.trim()
    ) {
        return action
    }
    return null
}

function createMiddlewareRuntimeCapabilities(nodeKey: string) {
    return {
        mode: 'allowlist' as const,
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

function createMiddlewareCommandSource(source: MiddlewareSlashCommandSource): PromptWorkflowCommandSourceMetadata {
    const kind = source.command.kind ?? (source.action.type === 'insert_text' ? 'command' : 'prompt_workflow')
    return compactObject<PromptWorkflowCommandSourceMetadata>({
        type: 'slash_command',
        name: source.command.name,
        source: 'runtime',
        executionType: source.action.type,
        kind,
        workflow: kind === 'prompt_workflow' ? createMiddlewarePromptWorkflowMetadata(source) : undefined
    })
}

function createMiddlewarePromptWorkflowMetadata(source: MiddlewareSlashCommandSource): SkillPromptWorkflow {
    const workflow = source.command.workflow
    return compactObject<SkillPromptWorkflow>({
        type: 'prompt_workflow',
        name: workflow?.name ?? source.command.name,
        label: workflow?.label ?? source.command.label ?? source.command.name,
        description: workflow?.description ?? source.command.description,
        tags: nonEmptyArray(workflow?.tags ?? [])
    })
}

function getPrimaryAgentKey(xpert: Pick<IXpert, 'graph' | 'agent'>): string | undefined {
    if (typeof xpert.agent?.key === 'string' && xpert.agent.key.trim()) {
        return xpert.agent.key.trim()
    }

    const agentNode = xpert.graph?.nodes?.find((node) => node.type === 'agent')
    const entity = agentNode?.entity as { key?: unknown } | undefined
    if (typeof entity?.key === 'string' && entity.key.trim()) {
        return entity.key.trim()
    }

    return typeof agentNode?.key === 'string' && agentNode.key.trim() ? agentNode.key.trim() : undefined
}

function tryGetMiddlewareStrategy(agentMiddlewareRegistry: AgentMiddlewareRegistry, provider: string) {
    try {
        return agentMiddlewareRegistry.get(provider)
    } catch {
        return null
    }
}

function createPromptWorkflowCommandSource(
    source: RuntimePromptWorkflowCommandSource
): PromptWorkflowCommandSourceMetadata {
    return {
        type: 'slash_command',
        name: source.name,
        source: 'runtime',
        executionType: 'submit_prompt',
        kind: 'prompt_workflow',
        workflow: createPromptWorkflowMetadata(source)
    }
}

function createPromptWorkflowMetadata(source: RuntimePromptWorkflowCommandSource): SkillPromptWorkflow {
    return compactObject<SkillPromptWorkflow>({
        type: 'prompt_workflow',
        name: source.name,
        label: source.label ?? source.name,
        description: source.description,
        tags: nonEmptyArray(source.tags ?? [])
    })
}
