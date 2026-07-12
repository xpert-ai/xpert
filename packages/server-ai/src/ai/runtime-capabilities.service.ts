import { Injectable } from '@nestjs/common'
import {
    agentLabel,
    agentUniqueName,
    getAgentMiddlewareNodes,
    getAssistantBindingDisabledSkillIds,
    getEnabledTools,
    IWFNMiddleware,
    IXpert,
    IXpertAgent,
    isRequiredMiddleware,
    normalizeMiddlewareProvider,
    TXpertGraph,
    TXpertTeamConnection,
    TXpertTeamNode
} from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { PaginationParams } from '@xpert-ai/server-core'
import { isNil, omitBy } from 'lodash-es'
import { AssistantBindingService } from '../assistant-binding'
import { PromptWorkflowService } from '../prompt-workflow'
import { SkillPackageService } from '../skill-package'
import type { SkillPackage } from '../skill-package/skill-package.entity'
import { SKILLS_MIDDLEWARE_NAME } from '../skill-package/types'
import {
    getAgentSubAgentConnections,
    getSubAgentConnectionTargetKey,
    isRequiredSubAgentConnection
} from '../shared/agent/sub-agent'
import { normalizeRuntimeIcon } from './runtime-icon'
import { RuntimeCommandService } from './runtime-command.service'

export const RUNTIME_CAPABILITY_XPERT_RELATIONS = ['agent', 'agent.copilotModel', 'copilotModel']

@Injectable()
export class RuntimeCapabilitiesService {
    constructor(
        private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry,
        private readonly skillPackageService: SkillPackageService,
        private readonly runtimeCommandService: RuntimeCommandService,
        private readonly promptWorkflowService: PromptWorkflowService,
        private readonly assistantBindingService: AssistantBindingService
    ) {}

    async getRuntimeCapabilities(xpert: IXpert, assistantId?: string) {
        const agentKey = getRuntimePrimaryAgentKey(xpert)
        const graph = xpert.graph
        const middlewareNodes = agentKey && graph ? getAgentMiddlewareNodes(graph, agentKey) : []
        const hasSkillsMiddleware = middlewareNodes.some((node) => {
            const entity = toMiddlewareEntity(node.entity)
            return normalizeMiddlewareProvider(entity?.provider) === SKILLS_MIDDLEWARE_NAME
        })
        const defaultSkillSelection = collectDefaultSkillSelection(middlewareNodes)
        const disabledSkillIds = await this.getDisabledSkillIds(hasSkillsMiddleware, xpert, assistantId)

        const middlewareCapabilities = middlewareNodes
            .map((node) => {
                const entity = toMiddlewareEntity(node.entity)
                const provider = normalizeMiddlewareProvider(entity?.provider)
                if (!entity || !provider || provider === SKILLS_MIDDLEWARE_NAME) {
                    return null
                }

                const strategy = tryGetMiddlewareStrategy(this.agentMiddlewareRegistry, provider)
                const meta = strategy?.meta
                const label = resolveI18nText(meta?.label, provider)
                const runtimeMeta = omitBy(
                    {
                        icon: meta?.icon
                    },
                    isNil
                )
                return {
                    plugin: isRequiredMiddleware(entity)
                        ? null
                        : {
                              nodeKey: node.key,
                              provider,
                              label,
                              description: resolveI18nText(meta?.description),
                              ...(Object.keys(runtimeMeta).length ? { meta: runtimeMeta } : {}),
                              toolNames: Object.entries(entity.tools ?? {})
                                  .filter(([, enabled]) => enabled !== false)
                                  .map(([name]) => name)
                          },
                    commands: this.runtimeCommandService.normalizeMiddlewareRuntimeSlashCommands(
                        meta?.slashCommands ?? [],
                        {
                            provider,
                            nodeKey: node.key,
                            label
                        }
                    )
                }
            })
            .filter((item): item is NonNullable<typeof item> => !!item)
        const plugins = middlewareCapabilities
            .map((item) => item.plugin)
            .filter((item): item is NonNullable<typeof item> => !!item)
        const middlewareCommands = middlewareCapabilities.flatMap((item) => item.commands)
        const runtimeSkills =
            hasSkillsMiddleware && xpert.workspaceId
                ? await this.getRuntimeSkills(xpert.workspaceId, defaultSkillSelection, disabledSkillIds)
                : { skills: [], commands: [] }
        const subAgents = agentKey && graph ? collectRuntimeSubAgents(graph, agentKey) : []
        const commandAllowList = {
            workspaceId: xpert.workspaceId,
            skillIds: runtimeSkills.skills.map((skill) => skill.id),
            pluginNodeKeys: plugins.map((plugin) => plugin.nodeKey),
            subAgentNodeKeys: subAgents.map((subAgent) => subAgent.nodeKey)
        }
        const commandProfile = await this.promptWorkflowService.resolveRuntimeCommandProfile(xpert)
        const xpertCommands = this.runtimeCommandService.normalizePromptWorkflowRuntimeSlashCommands(
            commandProfile.xpertCommands,
            {
                sourceType: 'xpert',
                workspaceId: xpert.workspaceId,
                label: xpert.title ?? xpert.name,
                allowList: commandAllowList
            }
        )
        const workspaceCommands = this.runtimeCommandService.normalizePromptWorkflowRuntimeSlashCommands(
            commandProfile.workspaceCommands,
            {
                sourceType: 'workspace_prompt_workflow',
                workspaceId: xpert.workspaceId,
                label: xpert.title ?? xpert.name,
                allowList: commandAllowList
            }
        )
        const preferredSkillCommands = commandProfile.hasProfile
            ? this.runtimeCommandService.selectProfileSkillRuntimeSlashCommands(
                  runtimeSkills.commands,
                  commandProfile.preferredSkillEntries
              )
            : []
        const skillCommands = commandProfile.hasProfile
            ? this.runtimeCommandService.selectProfileSkillRuntimeSlashCommands(
                  runtimeSkills.commands,
                  commandProfile.skillEntries
              )
            : runtimeSkills.commands

        return {
            skills: runtimeSkills.skills,
            plugins,
            subAgents,
            commands: this.runtimeCommandService.mergeRuntimeSlashCommands([
                middlewareCommands,
                xpertCommands,
                preferredSkillCommands,
                workspaceCommands,
                skillCommands
            ])
        }
    }

    private async getDisabledSkillIds(hasSkillsMiddleware: boolean, xpert: IXpert, assistantId?: string) {
        const targetId = xpert.id ?? assistantId
        if (!hasSkillsMiddleware || !xpert.workspaceId || !targetId) {
            return new Set<string>()
        }

        return new Set(
            getAssistantBindingDisabledSkillIds(
                (await this.assistantBindingService.getUserPreferenceByAssistantId(targetId))?.toolPreferences,
                xpert.workspaceId
            )
        )
    }

    private async getRuntimeSkills(
        workspaceId: string,
        defaultSelection: RuntimeSkillDefaultSelection,
        disabledSkillIds: Set<string>
    ) {
        const query: PaginationParams<SkillPackage> = {
            relations: ['skillIndex', 'skillIndex.repository'],
            order: {},
            where: {},
            withDeleted: false
        } as PaginationParams<SkillPackage>
        // Capability discovery is part of execution and must honor run-only workspace access.
        const result = await this.skillPackageService.getAllByWorkspaceForRuntime(
            workspaceId,
            query,
            false,
            RequestContext.currentUser()
        )

        const enabledItems = (result.items ?? []).filter((skill) => !disabledSkillIds.has(skill.id))
        const skills = enabledItems.map((skill) => {
            const skillIndex = skill.skillIndex
            const repositoryId = skillIndex?.repositoryId ?? skillIndex?.repository?.id
            const runtimeMeta = omitBy(
                {
                    icon: normalizeRuntimeIcon(skill.metadata?.icon),
                    color: readSkillMetadataColor(skill.metadata)
                },
                isNil
            )
            const isDefault =
                defaultSelection.skillIds.has(skill.id) ||
                defaultSelection.repositoryDefaults.some(
                    (selection) =>
                        !!repositoryId &&
                        selection.repositoryId === repositoryId &&
                        !selection.disabledSkillIds.has(skill.id)
                )
            return {
                id: skill.id,
                workspaceId: skill.workspaceId,
                label: resolveI18nText(skill.name, skillIndex?.name ?? skillIndex?.skillId ?? skill.id),
                description: skillIndex?.description,
                repositoryName: skillIndex?.repository?.name,
                provider: skillIndex?.repository?.provider,
                ...(Object.keys(runtimeMeta).length ? { meta: runtimeMeta } : {}),
                ...(isDefault ? { default: true } : {})
            }
        })
        const commands = enabledItems.flatMap((skill) =>
            this.runtimeCommandService.normalizeSkillRuntimeSlashCommands(skill, {
                workspaceId,
                label: resolveI18nText(skill.name, skill.skillIndex?.name ?? skill.skillIndex?.skillId ?? skill.id)
            })
        )

        return { skills, commands }
    }
}

function readSkillMetadataColor(metadata?: SkillPackage['metadata'] | null) {
    const color = metadata?.color?.trim()
    if (color) {
        return color
    }
    if (metadata && typeof Reflect.get(metadata, 'brandColor') === 'string') {
        const brandColor = Reflect.get(metadata, 'brandColor').trim()
        return brandColor || undefined
    }
    return undefined
}

type RuntimeSkillDefaultSelection = {
    skillIds: Set<string>
    repositoryDefaults: Array<{
        repositoryId: string
        disabledSkillIds: Set<string>
    }>
}

function tryGetMiddlewareStrategy(agentMiddlewareRegistry: AgentMiddlewareRegistry, provider: string) {
    try {
        return agentMiddlewareRegistry.get(provider)
    } catch {
        return null
    }
}

function collectDefaultSkillSelection(
    middlewareNodes: ReturnType<typeof getAgentMiddlewareNodes>
): RuntimeSkillDefaultSelection {
    const skillIds = new Set<string>()
    const repositoryDefaults: RuntimeSkillDefaultSelection['repositoryDefaults'] = []

    for (const node of middlewareNodes) {
        const entity = toMiddlewareEntity(node.entity)
        if (normalizeMiddlewareProvider(entity?.provider) !== SKILLS_MIDDLEWARE_NAME) {
            continue
        }

        const options = entity?.options
        for (const id of normalizeStringArray(readUnknownProperty(options, 'skills'))) {
            skillIds.add(id)
        }

        const repositoryDefault = readUnknownProperty(options, 'repositoryDefault')
        const repositoryId = readStringProperty(repositoryDefault, 'repositoryId')?.trim() ?? ''
        if (repositoryId) {
            repositoryDefaults.push({
                repositoryId,
                disabledSkillIds: new Set(
                    normalizeStringArray(readUnknownProperty(repositoryDefault, 'disabledSkillIds'))
                )
            })
        }
    }

    return { skillIds, repositoryDefaults }
}

function collectRuntimeSubAgents(graph: TXpertGraph, agentKey: string) {
    const nodeMap = new Map(graph.nodes.map((node) => [node.key, node]))

    return getAgentSubAgentConnections(graph, agentKey)
        .filter((connection) => !isRequiredSubAgentConnection(connection))
        .map((connection) => {
            const targetKey = getSubAgentConnectionTargetKey(connection)
            const node = nodeMap.get(targetKey)
            if (node?.type === 'agent') {
                return transformAgentSubAgentCapability(connection, graph, node as TXpertTeamNode<'agent'>)
            }
            if (node?.type === 'xpert') {
                return transformXpertSubAgentCapability(connection, node as TXpertTeamNode<'xpert'>)
            }
            return null
        })
        .filter((item): item is NonNullable<typeof item> => !!item)
}

function transformAgentSubAgentCapability(
    connection: TXpertTeamConnection,
    graph: TXpertGraph,
    node: TXpertTeamNode<'agent'>
) {
    const agent = node.entity as IXpertAgent
    const resources = collectAgentResourceDetails(graph, agent.key)
    return omitBy(
        {
            nodeKey: getSubAgentConnectionTargetKey(connection),
            type: 'agent',
            label: agentLabel(agent),
            name: agentUniqueName(agent),
            description: agent.description,
            avatar: agent.avatar,
            agentKey: agent.key,
            parameters: agent.parameters,
            ...resources
        },
        isNil
    )
}

function transformXpertSubAgentCapability(connection: TXpertTeamConnection, node: TXpertTeamNode<'xpert'>) {
    const xpert = node.entity as IXpert
    const nestedGraph = getNestedXpertGraph(node, xpert)
    const primaryAgentKey = getRuntimePrimaryAgentKey(xpert)
    const resources =
        nestedGraph && primaryAgentKey
            ? collectAgentResourceDetails(nestedGraph, primaryAgentKey)
            : collectXpertResourceDetails(xpert)
    const parameters = xpert.agentConfig?.parameters ?? (xpert.agent?.options?.hidden ? [] : xpert.agent?.parameters)

    return omitBy(
        {
            nodeKey: getSubAgentConnectionTargetKey(connection),
            type: 'xpert',
            label: xpert.title || xpert.name || node.key,
            name: xpert.slug,
            description: xpert.description,
            avatar: xpert.avatar,
            agentKey: xpert.agent?.key,
            xpertId: xpert.id,
            parameters,
            ...resources
        },
        isNil
    )
}

function getNestedXpertGraph(node: TXpertTeamNode<'xpert'>, xpert: IXpert): TXpertGraph | null {
    const nodeGraph = {
        nodes: node.nodes ?? [],
        connections: node.connections ?? []
    }
    if (nodeGraph.nodes.length) {
        return nodeGraph
    }

    return xpert.graph ?? null
}

function collectAgentResourceDetails(graph: TXpertGraph, agentKey: string) {
    const nodeMap = new Map(graph.nodes.map((node) => [node.key, node]))
    const connections = graph.connections?.filter((connection) => connection.from === agentKey) ?? []
    const toolsetNodes = connections
        .filter((connection) => connection.type === 'toolset')
        .map((connection) => nodeMap.get(connection.to))
        .filter((node): node is TXpertTeamNode<'toolset'> => node?.type === 'toolset')
    const knowledgeNodes = connections
        .filter((connection) => connection.type === 'knowledge')
        .map((connection) => nodeMap.get(connection.to))
        .filter((node): node is TXpertTeamNode<'knowledge'> => node?.type === 'knowledge')

    return {
        toolNames: uniqueStrings(
            toolsetNodes.flatMap((node) => getEnabledTools(node.entity)?.map((tool) => tool.name) ?? [])
        ),
        toolsetNames: uniqueStrings(toolsetNodes.map((node) => node.entity.name ?? node.key)),
        knowledgebaseNames: uniqueStrings(knowledgeNodes.map((node) => node.entity.name ?? node.key))
    }
}

function collectXpertResourceDetails(xpert: IXpert) {
    return {
        toolNames: uniqueStrings(
            (xpert.toolsets ?? []).flatMap((toolset) => getEnabledTools(toolset)?.map((tool) => tool.name) ?? [])
        ),
        toolsetNames: uniqueStrings((xpert.toolsets ?? []).map((toolset) => toolset.name ?? toolset.id)),
        knowledgebaseNames: uniqueStrings(
            (xpert.knowledgebases ?? []).map((knowledgebase) => knowledgebase.name ?? knowledgebase.id)
        )
    }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.map((value) => value?.trim() ?? '').filter(Boolean)))
}

function toMiddlewareEntity(value: unknown): IWFNMiddleware | null {
    return isObjectValue(value) ? (value as IWFNMiddleware) : null
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readUnknownProperty(value: unknown, property: string): unknown {
    if (!isObjectValue(value)) {
        return
    }

    return Reflect.get(value, property)
}

function readStringProperty(value: unknown, property: string): string | undefined {
    const propertyValue = readUnknownProperty(value, property)
    return typeof propertyValue === 'string' ? propertyValue : undefined
}

function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }

    return Array.from(
        new Set(value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter((item) => item.length > 0))
    )
}

function resolveI18nText(value: unknown, fallback = '') {
    if (typeof value === 'string') {
        return value
    }

    const zhHans = readStringProperty(value, 'zh_Hans')?.trim()
    if (zhHans) {
        return zhHans
    }

    const enUS = readStringProperty(value, 'en_US')?.trim()
    if (enUS) {
        return enUS
    }

    return fallback
}

export function getRuntimePrimaryAgentKey(xpert: IXpert): string | undefined {
    const key = xpert?.agent?.key
    if (typeof key !== 'string') {
        return
    }
    const normalized = key.trim()
    return normalized || undefined
}
