import {
    IXpert,
    IXpertTool,
    IXpertToolset,
    PLUGIN_COMPONENT_TYPE,
    TXpertTeamConnection,
    TXpertTeamDraft,
    TXpertTeamNode,
    XpertTemplatePluginDependencies,
    XpertTemplatePluginToolsetDependency,
    XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { getErrorMessage, yaml } from '@xpert-ai/server-common'
import { normalizePluginName } from '@xpert-ai/server-core'
import { BadRequestException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { XpertImportCommand } from '../../xpert/commands/import.command'
import { XpertDraftDslDTO } from '../../xpert/dto'
import { XpertService } from '../../xpert/xpert.service'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import {
    PluginResourceInstallComponent,
    PluginResourceInstallResult,
    PluginResourceInstallerService,
    RuntimeComponent
} from '../plugin-resource-installer.service'
import { PluginTemplateInstallCommand, PluginTemplateInstallBasic } from './install-template.command'

type TemplateToolsetResolution = {
    dependency: Required<Pick<XpertTemplatePluginToolsetDependency, 'provider' | 'templateNodeKey'>> &
        Pick<XpertTemplatePluginToolsetDependency, 'targetAgentKey' | 'instanceName' | 'pluginName'>
    toolset: IXpertToolset
}

@CommandHandler(PluginTemplateInstallCommand)
export class PluginTemplateInstallHandler implements ICommandHandler<PluginTemplateInstallCommand> {
    readonly #logger = new Logger(PluginTemplateInstallHandler.name)

    constructor(
        private readonly installer: PluginResourceInstallerService,
        private readonly workspaceAccess: XpertWorkspaceAccessService,
        private readonly xpertTemplateService: XpertTemplateService,
        private readonly commandBus: CommandBus,
        private readonly xpertService: XpertService,
        @InjectRepository(XpertToolset)
        private readonly toolsetRepo: Repository<XpertToolset>
    ) {}

    async execute(command: PluginTemplateInstallCommand): Promise<PluginResourceInstallResult> {
        await this.workspaceAccess.assertCanWrite(command.workspaceId)
        const template = await this.xpertTemplateService.getTemplateDetail(command.templateId, command.language)
        const parsed = yaml.parse(template.export_data) as unknown
        const draft = this.normalizeDraft(parsed, command.workspaceId, command.basic)
        const xpert = await this.commandBus.execute<XpertImportCommand, IXpert>(
            new XpertImportCommand(draft, {
                normalizeCopilotModels: true,
                templateId: command.templateId,
                sourceTemplateId: template.id
            })
        )

        try {
            const dependencies = template.dependencies
            const pluginName = template.pluginName
            const components = await this.resolveTemplateDependencyComponents(pluginName, dependencies)
            const result = await this.installer.installComponentsForXpert(xpert, components)
            const toolsets = await this.resolveTemplateToolsetDependencies(xpert.workspaceId, pluginName, dependencies)
            if (toolsets.length) {
                await this.attachTemplateToolsetsToXpert(xpert.id, toolsets)
            }
            return {
                ...result,
                xpert
            }
        } catch (error) {
            await this.rollbackTemplateXpert(xpert)
            throw error
        }
    }

    private normalizeDraft(value: unknown, workspaceId: string, basic?: PluginTemplateInstallBasic): XpertDraftDslDTO {
        if (!isObjectValue(value) || !isObjectValue(Reflect.get(value, 'team'))) {
            throw new BadRequestException('Template export_data must be a valid Xpert draft')
        }
        const teamValue = Reflect.get(value, 'team')
        const nodesValue = Reflect.get(value, 'nodes')
        const connectionsValue = Reflect.get(value, 'connections')
        if (!Array.isArray(nodesValue) || !Array.isArray(connectionsValue)) {
            throw new BadRequestException('Template draft must include nodes and connections')
        }

        const team = teamValue as TXpertTeamDraft['team']
        return new XpertDraftDslDTO({
            team: {
                ...team,
                ...basic,
                workspaceId
            },
            nodes: nodesValue as TXpertTeamNode[],
            connections: connectionsValue as TXpertTeamConnection[]
        })
    }

    private async resolveTemplateDependencyComponents(
        defaultPluginName: string | undefined,
        dependencies?: XpertTemplatePluginDependencies
    ): Promise<RuntimeComponent[]> {
        const pluginName = normalizePluginName(defaultPluginName ?? '')
        if (!pluginName) {
            return []
        }

        const components: PluginResourceInstallComponent[] = []
        for (const item of dependencies?.skills ?? []) {
            components.push({
                pluginName: normalizePluginName(item.pluginName ?? pluginName),
                componentType: PLUGIN_COMPONENT_TYPE.SKILL,
                componentKey: item.componentKey,
                targetAgentKey: item.targetAgentKey
            })
        }
        for (const item of dependencies?.mcpServers ?? []) {
            components.push({
                pluginName: normalizePluginName(item.pluginName ?? pluginName),
                componentType: PLUGIN_COMPONENT_TYPE.MCP_SERVER,
                componentKey: item.componentKey,
                targetAgentKey: item.targetAgentKey,
                policyOverrides: item.policyOverrides
            })
        }
        for (const item of dependencies?.hooks ?? []) {
            components.push({
                pluginName: normalizePluginName(item.pluginName ?? pluginName),
                componentType: PLUGIN_COMPONENT_TYPE.HOOK,
                componentKey: item.componentKey,
                targetAgentKey: item.targetAgentKey,
                events: item.events
            })
        }
        for (const item of dependencies?.apps ?? []) {
            components.push({
                pluginName: normalizePluginName(item.pluginName ?? pluginName),
                componentType: PLUGIN_COMPONENT_TYPE.APP,
                componentKey: item.componentKey,
                auth: item.auth
            })
        }

        if (!components.length) {
            return dependencies?.plugins?.includes(pluginName)
                ? await this.installer.resolveRuntimeComponents(pluginName, undefined)
                : []
        }

        const groups = await Promise.all(
            Array.from(new Set(components.map((item) => item.pluginName ?? pluginName))).map((name) =>
                this.installer.resolveRuntimeComponents(
                    name,
                    components.filter((item) => item.pluginName === name)
                )
            )
        )
        return groups.flat()
    }

    private async resolveTemplateToolsetDependencies(
        workspaceId: string | undefined,
        defaultPluginName: string | undefined,
        dependencies?: XpertTemplatePluginDependencies
    ): Promise<TemplateToolsetResolution[]> {
        if (!dependencies?.toolsets?.length) {
            return []
        }
        if (!workspaceId) {
            throw new BadRequestException('workspaceId is required for template toolset dependencies')
        }

        const defaultNormalizedPluginName = normalizePluginName(defaultPluginName ?? '')
        const resolutions: TemplateToolsetResolution[] = []
        for (const item of dependencies.toolsets) {
            const provider = normalizeNonEmptyString(item.provider)
            const templateNodeKey = normalizeNonEmptyString(item.templateNodeKey)
            const pluginName = normalizePluginName(item.pluginName ?? defaultNormalizedPluginName)
            if (!provider || !templateNodeKey || !pluginName) {
                throw new BadRequestException(
                    'Template toolset dependency requires pluginName, provider and templateNodeKey'
                )
            }

            const dependency = {
                pluginName,
                provider,
                templateNodeKey,
                targetAgentKey: normalizeNonEmptyString(item.targetAgentKey) ?? undefined,
                instanceName: normalizeNonEmptyString(item.instanceName) ?? undefined
            }
            resolutions.push({
                dependency,
                toolset: await this.resolveTemplateBuiltinToolset(workspaceId, dependency)
            })
        }
        return resolutions
    }

    private async resolveTemplateBuiltinToolset(
        workspaceId: string,
        dependency: TemplateToolsetResolution['dependency']
    ) {
        const toolsets = (
            await this.toolsetRepo.find({
                where: {
                    workspaceId,
                    type: dependency.provider,
                    category: XpertToolsetCategoryEnum.BUILTIN
                },
                relations: ['tools'],
                order: {
                    updatedAt: 'DESC'
                }
            })
        )
            .filter(
                (toolset) =>
                    toolset.type === dependency.provider &&
                    (toolset.category ?? XpertToolsetCategoryEnum.BUILTIN) === XpertToolsetCategoryEnum.BUILTIN
            )
            .sort(compareToolsetsByUpdatedAtDesc)

        if (dependency.instanceName) {
            const namedToolsets = toolsets.filter((toolset) => toolset.name === dependency.instanceName)
            if (!namedToolsets.length) {
                throw new BadRequestException(
                    `Required template toolset '${dependency.instanceName}' (${dependency.provider}) is not configured in this workspace.`
                )
            }
            return namedToolsets[0]
        }

        if (!toolsets.length) {
            throw new BadRequestException(
                `Required template toolset '${dependency.provider}' is not configured in this workspace.`
            )
        }

        if (toolsets.length > 1) {
            throw new BadRequestException(
                `Multiple '${dependency.provider}' toolsets are configured in this workspace. Set instanceName in the template dependency.`
            )
        }

        return toolsets[0]
    }

    private async attachTemplateToolsetsToXpert(xpertId: string | undefined, resolutions: TemplateToolsetResolution[]) {
        if (!xpertId) {
            throw new BadRequestException('Xpert id is required for template toolset dependencies')
        }

        const latestXpert = await this.xpertService.getTeam(xpertId)
        const draft = this.ensureDraft(latestXpert)
        for (const resolution of resolutions) {
            this.applyTemplateToolsetResolution(draft, resolution)
        }

        await this.xpertService.updateDraft(xpertId, {
            team: draft.team,
            nodes: draft.nodes,
            connections: draft.connections
        })
    }

    private ensureDraft(xpert: IXpert): TXpertTeamDraft {
        const draft = xpert.draft
        if (!draft?.team) {
            throw new BadRequestException('Xpert draft is required before installing plugin resources')
        }
        return {
            ...draft,
            team: {
                ...draft.team,
                id: draft.team.id ?? xpert.id,
                workspaceId: draft.team.workspaceId ?? xpert.workspaceId
            },
            nodes: [...(draft.nodes ?? [])],
            connections: [...(draft.connections ?? [])]
        }
    }

    private applyTemplateToolsetResolution(draft: TXpertTeamDraft, resolution: TemplateToolsetResolution) {
        const templateNodeKey = resolution.dependency.templateNodeKey
        const toolsetId = resolution.toolset.id
        if (!toolsetId) {
            throw new BadRequestException(`Resolved template toolset '${resolution.dependency.provider}' has no id`)
        }

        const targetAgentKey =
            resolution.dependency.targetAgentKey ?? this.resolveTemplateToolsetTargetAgentKey(draft, templateNodeKey)
        if (!this.templateDraftHasAgent(draft, targetAgentKey)) {
            throw new BadRequestException(`Template toolset target agent '${targetAgentKey}' was not found`)
        }
        const placeholderNode = draft.nodes.find((node) => node.type === 'toolset' && node.key === templateNodeKey)
        const runtimeNode = draft.nodes.find((node) => node.type === 'toolset' && node.key === toolsetId)
        const position = placeholderNode?.position ?? runtimeNode?.position ?? { x: 280, y: 260 }
        const size = placeholderNode?.size ?? runtimeNode?.size
        const insertIndex = Math.max(
            0,
            draft.nodes.findIndex((node) => node.key === templateNodeKey || node.key === toolsetId)
        )
        const toolsetNode: TXpertTeamNode<'toolset'> = {
            key: toolsetId,
            type: 'toolset',
            position,
            ...(size ? { size } : {}),
            entity: this.sanitizeTemplateToolset(resolution.toolset)
        }

        draft.nodes = draft.nodes.filter(
            (node) => !(node.type === 'toolset' && (node.key === templateNodeKey || node.key === toolsetId))
        )
        draft.nodes.splice(insertIndex, 0, toolsetNode)
        draft.connections = this.rewriteTemplateToolsetConnections(draft.connections ?? [], templateNodeKey, toolsetId)
        this.ensureConnection(draft, targetAgentKey, toolsetId, 'toolset')
        this.rewriteTemplateToolsetAgentRefs(draft, templateNodeKey, toolsetId, targetAgentKey)
        this.rewriteTemplateToolsetTeamRefs(draft, templateNodeKey, resolution.toolset, position)
    }

    private resolveTemplateToolsetTargetAgentKey(draft: TXpertTeamDraft, templateNodeKey: string) {
        const connectedAgentKey = draft.connections?.find(
            (connection) => connection.type === 'toolset' && connection.to === templateNodeKey
        )?.from
        if (connectedAgentKey) {
            return connectedAgentKey
        }

        const agentWithToolset = draft.nodes.find(
            (node) =>
                node.type === 'agent' &&
                Array.isArray(node.entity?.toolsetIds) &&
                node.entity.toolsetIds.includes(templateNodeKey)
        )
        if (agentWithToolset?.type === 'agent') {
            return agentWithToolset.key
        }

        const primaryAgentKey = normalizeNonEmptyString(draft.team.agent?.key)
        if (primaryAgentKey) {
            return primaryAgentKey
        }

        const agentNode = draft.nodes.find((node) => node.type === 'agent')
        if (agentNode?.type === 'agent') {
            return agentNode.key
        }

        throw new BadRequestException('Template toolset dependency requires a target agent')
    }

    private templateDraftHasAgent(draft: TXpertTeamDraft, agentKey: string) {
        return (
            draft.team.agent?.key === agentKey ||
            draft.nodes.some((node) => node.type === 'agent' && node.key === agentKey)
        )
    }

    private rewriteTemplateToolsetConnections(
        connections: TXpertTeamConnection[],
        templateNodeKey: string,
        toolsetId: string
    ) {
        const seen = new Set<string>()
        return connections
            .map((connection) => {
                const from = connection.from === templateNodeKey ? toolsetId : connection.from
                const to = connection.to === templateNodeKey ? toolsetId : connection.to
                return {
                    ...connection,
                    from,
                    to,
                    key: `${from}/${to}`
                }
            })
            .filter((connection) => {
                const key = `${connection.type}:${connection.from}:${connection.to}`
                if (seen.has(key)) {
                    return false
                }
                seen.add(key)
                return true
            })
    }

    private rewriteTemplateToolsetAgentRefs(
        draft: TXpertTeamDraft,
        templateNodeKey: string,
        toolsetId: string,
        targetAgentKey: string
    ) {
        draft.nodes = draft.nodes.map((node) => {
            if (node.type !== 'agent') {
                return node
            }
            return {
                ...node,
                entity: this.rewriteAgentToolsetIds(
                    node.entity,
                    templateNodeKey,
                    toolsetId,
                    node.key === targetAgentKey
                )
            }
        })

        if (draft.team.agent) {
            draft.team.agent = this.rewriteAgentToolsetIds(
                draft.team.agent,
                templateNodeKey,
                toolsetId,
                draft.team.agent.key === targetAgentKey
            )
        }
    }

    private rewriteAgentToolsetIds<T extends { toolsetIds?: string[] }>(
        agent: T,
        templateNodeKey: string,
        toolsetId: string,
        shouldAttach: boolean
    ): T {
        const nextIds = uniqueStrings(
            (agent.toolsetIds ?? []).filter((id) => id !== templateNodeKey && id !== toolsetId)
        )
        if (shouldAttach) {
            nextIds.push(toolsetId)
        }
        return {
            ...agent,
            toolsetIds: uniqueStrings(nextIds)
        }
    }

    private rewriteTemplateToolsetTeamRefs(
        draft: TXpertTeamDraft,
        templateNodeKey: string,
        toolset: IXpertToolset,
        position: TXpertTeamNode['position']
    ) {
        const toolsetId = toolset.id
        const toolsetOptions = isObjectValue(draft.team.options?.toolset)
            ? ({ ...(draft.team.options.toolset as Record<string, unknown>) } as Record<string, unknown>)
            : {}
        toolsetOptions[toolsetId] = toolsetOptions[toolsetId] ?? toolsetOptions[templateNodeKey] ?? { position }
        delete toolsetOptions[templateNodeKey]

        draft.team = {
            ...draft.team,
            toolsets: [
                ...(draft.team.toolsets ?? []).filter((item) => item.id !== templateNodeKey && item.id !== toolsetId),
                this.sanitizeTemplateToolset(toolset)
            ],
            options: {
                ...(draft.team.options ?? {}),
                toolset: toolsetOptions
            }
        }
    }

    private sanitizeTemplateToolset(toolset: IXpertToolset): IXpertToolset {
        const sanitized: Partial<IXpertToolset> = {
            id: toolset.id,
            name: toolset.name,
            type: toolset.type,
            category: toolset.category ?? XpertToolsetCategoryEnum.BUILTIN,
            description: toolset.description,
            avatar: toolset.avatar,
            options: toolset.options,
            privacyPolicy: toolset.privacyPolicy,
            customDisclaimer: toolset.customDisclaimer,
            tags: toolset.tags,
            tools: toolset.tools?.map((tool) => {
                const nextTool: Partial<IXpertTool> = { ...tool }
                delete (nextTool as { toolset?: unknown }).toolset
                delete (nextTool as { toolsetId?: unknown }).toolsetId
                return nextTool as IXpertTool
            })
        }
        return sanitized as IXpertToolset
    }

    private ensureConnection(draft: TXpertTeamDraft, from: string, to: string, type: TXpertTeamConnection['type']) {
        const key = `${from}/${to}`
        if (
            draft.connections.some(
                (connection) => connection.key === key || (connection.from === from && connection.to === to)
            )
        ) {
            return
        }
        draft.connections.push({
            key,
            from,
            to,
            type
        })
    }

    private async rollbackTemplateXpert(xpert: IXpert) {
        if (!xpert.id) {
            return
        }
        try {
            await this.xpertService.delete(xpert.id)
        } catch (error) {
            this.#logger.warn(`Failed to rollback template xpert '${xpert.id}': ${getErrorMessage(error)}`)
        }
    }
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeNonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function uniqueStrings(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)))
}

function compareToolsetsByUpdatedAtDesc(left: IXpertToolset, right: IXpertToolset) {
    return readDateTime(right.updatedAt) - readDateTime(left.updatedAt)
}

function readDateTime(value: unknown) {
    if (!value) {
        return 0
    }

    const time = new Date(value as string).getTime()
    return Number.isFinite(time) ? time : 0
}
