import { Assistant } from '@langchain/langgraph-sdk'
import {
    agentLabel,
    agentUniqueName,
    getAgentMiddlewareNodes,
    getAssistantBindingDisabledSkillIds,
    getEnabledTools,
    ICopilotModel,
    IWFNMiddleware,
    IXpertAgent,
    isRequiredMiddleware,
    IXpert,
    ModelPropertyKey,
    normalizeMiddlewareProvider,
    resolveRuntimeXpert,
    TXpertGraph,
    TXpertTeamConnection,
    TXpertTeamNode
} from '@xpert-ai/contracts'
import { ApiKeyOrClientSecretAuthGuard, Public, TransformInterceptor } from '@xpert-ai/server-core'
import { Body, Controller, Get, Logger, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger'
import { AgentMiddlewareRegistry, normalizeContextSize, RequestContext } from '@xpert-ai/plugin-sdk'
import { parseQueryBoolean } from '@xpert-ai/server-common'
import { isNil, omitBy, pick } from 'lodash-es'
import { AssistantBindingService } from '../assistant-binding'
import { PublishedXpertAccessService } from '../xpert'
import { SkillPackageService } from '../skill-package'
import { SKILLS_MIDDLEWARE_NAME } from '../skill-package/types'
import { PromptWorkflowService } from '../prompt-workflow'
import {
    getAgentSubAgentConnections,
    getSubAgentConnectionTargetKey,
    isRequiredSubAgentConnection
} from '../shared/agent/sub-agent'
import { RuntimeCommandService } from './runtime-command.service'

const ASSISTANT_RELATIONS = ['agent', 'agent.copilotModel', 'copilotModel']

@ApiTags('AI/Assistants')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('assistants')
export class AssistantsController {
    readonly #logger = new Logger(AssistantsController.name)

    constructor(
        private readonly publishedXpertAccessService: PublishedXpertAccessService,
        private readonly assistantBindingService: AssistantBindingService,
        private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry,
        private readonly skillPackageService: SkillPackageService,
        private readonly runtimeCommandService: RuntimeCommandService,
        private readonly promptWorkflowService: PromptWorkflowService
    ) {}

    @Post('search')
    async search(@Body() query: { limit: number; offset: number; graph_id?: string; metadata?: any }) {
        this.#logger.log(`Search Assistants: ${JSON.stringify(query)}`)
        const assistants = await this.publishedXpertAccessService.findAccessiblePublishedXperts({
            where: transformMetadata2Where(query.metadata),
            relations: ASSISTANT_RELATIONS,
            take: query.limit,
            skip: query.offset
        })
        return assistants.map(transformAssistant)
    }

    @Post('count')
    async count(@Body() body: { graph_id?: string; metadata?: any }) {
        this.#logger.log(`Count Assistants: ${JSON.stringify(body)}`)
        const where = transformMetadata2Where(body?.metadata)
        if (body?.graph_id) {
            where['id'] = body.graph_id
        }
        return this.publishedXpertAccessService.countAccessiblePublishedXperts(where)
    }

    @Get(':id')
    async getOne(@Param('id') id: string) {
        const item = (await this.assistantBindingService.isEffectiveSystemAssistantId(id))
            ? await this.publishedXpertAccessService.getPublishedXpertInTenant(id, {
                  relations: ASSISTANT_RELATIONS
              })
            : await this.publishedXpertAccessService.getAccessiblePublishedXpert(id, {
                  relations: ASSISTANT_RELATIONS
              })
        return transformAssistant(item)
    }

    @Get(':id/runtime-capabilities')
    @ApiQuery({ name: 'isDraft', required: false, type: Boolean })
    async getRuntimeCapabilities(@Param('id') id: string, @Query('isDraft') isDraft?: string | boolean | string[]) {
        const sourceXpert = (await this.assistantBindingService.isEffectiveSystemAssistantId(id))
            ? await this.publishedXpertAccessService.getPublishedXpertInTenant(id, {
                  relations: ASSISTANT_RELATIONS
              })
            : await this.publishedXpertAccessService.getAccessiblePublishedXpert(id, {
                  relations: ASSISTANT_RELATIONS
              })
        const xpert = resolveRuntimeXpert(sourceXpert, parseQueryBoolean(isDraft))
        const agentKey = getAssistantPrimaryAgentKey(xpert)
        const graph = xpert.graph
        const middlewareNodes = agentKey && graph ? getAgentMiddlewareNodes(graph, agentKey) : []
        const hasSkillsMiddleware = middlewareNodes.some((node) => {
            const entity = node.entity as unknown as IWFNMiddleware
            return normalizeMiddlewareProvider(entity?.provider) === SKILLS_MIDDLEWARE_NAME
        })
        const defaultSkillSelection = collectDefaultSkillSelection(middlewareNodes)
        const disabledSkillIds =
            hasSkillsMiddleware && xpert.workspaceId
                ? new Set(
                      getAssistantBindingDisabledSkillIds(
                          (await this.assistantBindingService.getUserPreferenceByAssistantId(xpert.id ?? id))
                              ?.toolPreferences,
                          xpert.workspaceId
                      )
                  )
                : new Set<string>()

        const plugins = middlewareNodes
            .map((node) => {
                const entity = node.entity as unknown as IWFNMiddleware
                const provider = normalizeMiddlewareProvider(entity?.provider)
                if (!provider || provider === SKILLS_MIDDLEWARE_NAME || isRequiredMiddleware(entity)) {
                    return null
                }

                const strategy = tryGetMiddlewareStrategy(this.agentMiddlewareRegistry, provider)
                const meta = strategy?.meta
                const runtimeMeta = omitBy(
                    {
                        icon: meta?.icon
                    },
                    isNil
                )
                return {
                    nodeKey: node.key,
                    provider,
                    label: resolveI18nText(meta?.label, provider),
                    description: resolveI18nText(meta?.description),
                    ...(Object.keys(runtimeMeta).length ? { meta: runtimeMeta } : {}),
                    toolNames: Object.entries(entity?.tools ?? {})
                        .filter(([, enabled]) => enabled !== false)
                        .map(([name]) => name)
                }
            })
            .filter((item): item is NonNullable<typeof item> => !!item)

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
                xpertCommands,
                preferredSkillCommands,
                workspaceCommands,
                skillCommands
            ])
        }
    }

    private async getRuntimeSkills(
        workspaceId: string,
        defaultSelection: RuntimeSkillDefaultSelection,
        disabledSkillIds: Set<string>
    ) {
        const result = await this.skillPackageService.getAllByWorkspace(
            workspaceId,
            {
                relations: ['skillIndex', 'skillIndex.repository']
            } as any,
            false,
            RequestContext.currentUser()
        )

        const enabledItems = (result.items ?? []).filter((skill) => !disabledSkillIds.has(skill.id))
        const skills = enabledItems.map((skill) => {
            const skillIndex = skill.skillIndex
            const repositoryId = skillIndex?.repositoryId ?? skillIndex?.repository?.id
            const runtimeMeta = omitBy(
                {
                    icon: skill.metadata?.icon
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
        const entity = node.entity as unknown as IWFNMiddleware
        if (normalizeMiddlewareProvider(entity?.provider) !== SKILLS_MIDDLEWARE_NAME) {
            continue
        }

        const options = asRecord(entity?.options)
        for (const id of normalizeStringArray(options?.skills)) {
            skillIds.add(id)
        }

        const repositoryDefault = asRecord(options?.repositoryDefault)
        const repositoryId =
            typeof repositoryDefault?.repositoryId === 'string' ? repositoryDefault.repositoryId.trim() : ''
        if (repositoryId) {
            repositoryDefaults.push({
                repositoryId,
                disabledSkillIds: new Set(normalizeStringArray(repositoryDefault?.disabledSkillIds))
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
    const primaryAgentKey = getAssistantPrimaryAgentKey(xpert)
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

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
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

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>
        if (typeof record.zh_Hans === 'string' && record.zh_Hans.trim()) {
            return record.zh_Hans
        }
        if (typeof record.en_US === 'string' && record.en_US.trim()) {
            return record.en_US
        }
    }

    return fallback
}

function transformAssistant(xpert: IXpert) {
    const contextSize = getAssistantContextSize(xpert)
    const agentKey = getAssistantPrimaryAgentKey(xpert)
    const configurable = omitBy(
        {
            context_size: contextSize,
            agentKey
        },
        isNil
    )
    const config = omitBy(
        {
            ...pick(xpert, 'agentConfig', 'options', 'summarize', 'memory', 'features'),
            configurable: Object.keys(configurable).length ? configurable : undefined
        },
        isNil
    )

    return {
        assistant_id: xpert.id,
        graph_id: xpert.id,
        name: xpert.name,
        description: xpert.description,
        version: Number(xpert.version) || 0,
        created_at: xpert.createdAt.toISOString(),
        updated_at: xpert.updatedAt.toISOString(),
        config,
        metadata: omitBy(
            {
                workspaceId: xpert.workspaceId,
                avatar: xpert.avatar,
                slug: xpert.slug,
                type: xpert.type,
                title: xpert.title,
                tags: xpert.tags?.length ? xpert.tags : undefined,
                context_size: contextSize,
                agent_key: agentKey
            },
            isNil
        ),
        context: null
    } as Assistant
}

function transformMetadata2Where(metadata: Record<string, any> | undefined) {
    const where = {}
    if (metadata?.slug) {
        where['slug'] = metadata.slug
    }
    if (metadata?.workspaceId) {
        where['workspaceId'] = metadata.workspaceId
    }
    if (metadata?.type) {
        where['type'] = metadata.type
    }
    if (!isNil(metadata?.latest)) {
        where['latest'] = metadata.latest
    }
    if (!isNil(metadata?.version)) {
        where['version'] = metadata.version
    }
    return where
}

function getAssistantContextSize(xpert: IXpert): number | undefined {
    const effectiveCopilotModel = (xpert.agent?.copilotModel ?? xpert.copilotModel) as ICopilotModel
    return normalizeContextSize(effectiveCopilotModel?.options?.[ModelPropertyKey.CONTEXT_SIZE])
}

function getAssistantPrimaryAgentKey(xpert: IXpert): string | undefined {
    const key = xpert?.agent?.key
    if (typeof key !== 'string') {
        return
    }
    const normalized = key.trim()
    return normalized || undefined
}
