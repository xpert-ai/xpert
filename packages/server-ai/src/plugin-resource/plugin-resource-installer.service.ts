import {
    IWFNMiddleware,
    IPluginResourceComponentState,
    IXpert,
    IXpertAgent,
    IXpertTool,
    IXpertToolset,
    JSONValue,
    LanguagesEnum,
    MCPServerType,
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_MCP_TOOL_APPROVAL_MODE,
    PLUGIN_RESOURCE_INSTALLATION_STATUS,
    PLUGIN_RESOURCE_RUNTIME_TYPE,
    PluginComponentType,
    PluginResourceComponentSelector,
    PluginResourceRuntimeType,
    TAvatar,
    TCopilotModel,
    TMCPServer,
    TXpertTeamConnection,
    TXpertTeamDraft,
    TXpertTeamNode,
    WorkflowNodeTypeEnum,
    XpertTemplatePluginDependencies,
    XpertTemplatePluginToolsetDependency,
    XpertPluginMcpServerPolicy,
    XpertToolsetCategoryEnum,
    genXpertMiddlewareKey
} from '@xpert-ai/contracts'
import { getErrorMessage, yaml } from '@xpert-ai/server-common'
import {
    collectPluginBundleComponents,
    LOADED_PLUGINS,
    LoadedPluginRecord,
    normalizePluginName,
    PluginBundleComponentRegistration,
    readPluginBundleManifest,
    resolveLoadedPluginBundleRoot
} from '@xpert-ai/server-core'
import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { In, Repository } from 'typeorm'
import { SkillPackage } from '../skill-package/skill-package.entity'
import { SkillPackageService } from '../skill-package/skill-package.service'
import { SKILLS_MIDDLEWARE_NAME } from '../skill-package/types'
import { XpertImportCommand } from '../xpert/commands/import.command'
import { XpertDraftDslDTO } from '../xpert/dto'
import { XpertService } from '../xpert/xpert.service'
import { XpertWorkspaceAccessService } from '../xpert-workspace'
import { XpertTemplateService } from '../xpert-template/xpert-template.service'
import { XpertTool } from '../xpert-tool/xpert-tool.entity'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { XpertToolsetService } from '../xpert-toolset/xpert-toolset.service'
import { PLUGIN_HOOKS_MIDDLEWARE_NAME } from './plugin-hooks.middleware'
import { buildBlockedAppConfig, resolvePluginAppResourceInstallationStatus } from './plugin-resource-app-status'
import { PluginResourceInstallation } from './plugin-resource-installation.entity'

export type PluginResourceInstallComponent = PluginResourceComponentSelector & {
    targetAgentKey?: string
    policyOverrides?: XpertPluginMcpServerPolicy
    events?: string[]
    auth?: 'on_install' | 'on_first_use'
}

export type PluginResourceInstallResult = {
    installations: PluginResourceInstallation[]
    xpert?: IXpert
    pendingAuth: PluginResourceInstallation[]
}

type RuntimeComponent = {
    pluginName: string
    component: PluginBundleComponentRegistration
    rootDir: string
    targetAgentKey?: string
    policyOverrides?: XpertPluginMcpServerPolicy
    events?: string[]
    auth?: 'on_install' | 'on_first_use'
}

type PluginResourceInstallTarget = 'workspace' | 'xpert'

export type PluginResourceComponentStateInput = {
    target?: PluginResourceInstallTarget
    workspaceId?: string
    xpertId?: string
    agentKey?: string
}

type ParsedMcpServer = {
    server: TMCPServer
    policy?: XpertPluginMcpServerPolicy
}

type TemplateInstallBasic = {
    name?: string
    title?: string
    description?: string
    avatar?: TAvatar
    copilotModel?: TCopilotModel
}

type TemplateToolsetResolution = {
    dependency: Required<Pick<XpertTemplatePluginToolsetDependency, 'provider' | 'templateNodeKey'>> &
        Pick<XpertTemplatePluginToolsetDependency, 'targetAgentKey' | 'instanceName' | 'pluginName'>
    toolset: IXpertToolset
}

@Injectable()
export class PluginResourceInstallerService {
    readonly #logger = new Logger(PluginResourceInstallerService.name)

    constructor(
        @InjectRepository(PluginResourceInstallation)
        private readonly installationRepo: Repository<PluginResourceInstallation>,
        @InjectRepository(SkillPackage)
        private readonly skillPackageRepo: Repository<SkillPackage>,
        @InjectRepository(XpertToolset)
        private readonly toolsetRepo: Repository<XpertToolset>,
        @InjectRepository(XpertTool)
        private readonly toolRepo: Repository<XpertTool>,
        private readonly workspaceAccess: XpertWorkspaceAccessService,
        private readonly skillPackageService: SkillPackageService,
        private readonly toolsetService: XpertToolsetService,
        private readonly xpertService: XpertService,
        private readonly xpertTemplateService: XpertTemplateService,
        private readonly commandBus: CommandBus,
        @Optional()
        @Inject(LOADED_PLUGINS)
        private readonly loadedPlugins: LoadedPluginRecord[] = []
    ) {}

    async installToWorkspace(
        pluginName: string,
        workspaceId: string,
        components?: PluginResourceInstallComponent[]
    ): Promise<PluginResourceInstallResult> {
        await this.workspaceAccess.assertCanWrite(workspaceId)
        const runtimeComponents = await this.resolveRuntimeComponents(pluginName, components, 'workspace')
        const installations: PluginResourceInstallation[] = []
        const pendingAuth: PluginResourceInstallation[] = []

        for (const runtimeComponent of runtimeComponents) {
            const installation = await this.installRuntimeComponent(runtimeComponent, workspaceId, null)
            installations.push(installation)
            if (installation.status === PLUGIN_RESOURCE_INSTALLATION_STATUS.PENDING_AUTH) {
                pendingAuth.push(installation)
            }
        }

        return {
            installations,
            pendingAuth
        }
    }

    async installToXpert(
        pluginName: string,
        xpertId: string,
        components?: PluginResourceInstallComponent[],
        agentKey?: string
    ): Promise<PluginResourceInstallResult> {
        const xpert = await this.xpertService.getTeam(xpertId)
        if (!xpert?.workspaceId) {
            throw new BadRequestException('Xpert workspaceId is required')
        }
        await this.workspaceAccess.assertCanWrite(xpert.workspaceId)

        const runtimeComponents = await this.resolveRuntimeComponents(pluginName, components, 'xpert')
        return this.installComponentsForXpert(xpert, runtimeComponents, agentKey)
    }

    async installTemplate(
        templateId: string,
        workspaceId: string,
        basic?: TemplateInstallBasic,
        language: LanguagesEnum = LanguagesEnum.English
    ): Promise<PluginResourceInstallResult> {
        await this.workspaceAccess.assertCanWrite(workspaceId)
        const template = await this.xpertTemplateService.getTemplateDetail(templateId, language)
        const parsed = yaml.parse(template.export_data) as unknown
        const draft = this.normalizeDraft(parsed, workspaceId, basic)
        const xpert = await this.commandBus.execute<XpertImportCommand, IXpert>(
            new XpertImportCommand(draft, {
                normalizeCopilotModels: true,
                templateId,
                sourceTemplateId: template.id
            })
        )

        try {
            const dependencies = template.dependencies
            const pluginName = template.pluginName
            const components = await this.resolveTemplateDependencyComponents(pluginName, dependencies)
            const result = await this.installComponentsForXpert(xpert, components)
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

    async listComponentStates(
        pluginName: string,
        input: PluginResourceComponentStateInput
    ): Promise<IPluginResourceComponentState[]> {
        const normalizedPluginName = normalizePluginName(pluginName)
        const xpert = input.xpertId ? await this.xpertService.getTeam(input.xpertId) : null
        const workspaceId = xpert?.workspaceId ?? input.workspaceId
        if (!workspaceId) {
            throw new BadRequestException('workspaceId is required')
        }
        if (input.workspaceId && xpert?.workspaceId && input.workspaceId !== xpert.workspaceId) {
            throw new BadRequestException('workspaceId does not match Xpert workspace')
        }
        await this.workspaceAccess.assertCanRead(workspaceId)

        const target = input.target ?? (input.xpertId ? 'xpert' : 'workspace')
        const rootDir = this.resolveLoadedPluginRoot(normalizedPluginName)
        const components = this.readPluginComponents(normalizedPluginName, rootDir).filter((component) =>
            this.isInstallableForTarget(component.componentType, target)
        )
        if (!components.length) {
            return []
        }

        const installations = await this.findInstallationsForTarget(
            workspaceId,
            target === 'xpert' ? (input.xpertId ?? null) : null,
            normalizedPluginName,
            target === 'xpert' ? input.agentKey : undefined
        )
        const installationByComponent = new Map<string, PluginResourceInstallation>()
        for (const installation of installations) {
            const key = this.componentStateKey(installation)
            if (!installationByComponent.has(key)) {
                installationByComponent.set(key, installation)
            }
        }

        const skillPackagesBySharedId =
            target === 'workspace'
                ? await this.findPluginSkillPackages(workspaceId, normalizedPluginName, components)
                : new Map<string, SkillPackage>()

        return components.map((component) => {
            const installation = installationByComponent.get(this.componentStateKey(component)) ?? null
            const fallbackSkillPackage =
                component.componentType === PLUGIN_COMPONENT_TYPE.SKILL
                    ? (skillPackagesBySharedId.get(
                          this.pluginSkillSharedId(normalizedPluginName, component.componentKey)
                      ) ?? null)
                    : null
            const installed = !!installation || !!fallbackSkillPackage
            const runtimeType =
                installation?.runtimeType ?? (fallbackSkillPackage ? PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE : null)
            const runtimeId = installation?.runtimeId ?? fallbackSkillPackage?.id ?? null
            const status =
                installation?.status ?? (fallbackSkillPackage ? PLUGIN_RESOURCE_INSTALLATION_STATUS.READY : null)

            return {
                componentType: component.componentType,
                componentKey: component.componentKey,
                installed,
                staleDefinition: !!installation && installation.definitionHash !== component.definitionHash,
                runtimeType,
                runtimeId,
                status,
                installation
            }
        })
    }

    private async installComponentsForXpert(
        xpert: IXpert,
        runtimeComponents: RuntimeComponent[],
        defaultAgentKey?: string
    ): Promise<PluginResourceInstallResult> {
        if (!xpert.id || !xpert.workspaceId) {
            throw new BadRequestException('Xpert id and workspaceId are required')
        }

        const latestXpert = await this.xpertService.getTeam(xpert.id)
        const draft = this.ensureDraft(latestXpert)
        const installations: PluginResourceInstallation[] = []
        const pendingAuth: PluginResourceInstallation[] = []

        for (const runtimeComponent of runtimeComponents) {
            const targetAgentKey =
                runtimeComponent.targetAgentKey ?? defaultAgentKey ?? this.getPrimaryAgentKey(latestXpert, draft)
            const installation = await this.installRuntimeComponent(
                runtimeComponent,
                xpert.workspaceId,
                xpert.id,
                targetAgentKey
            )
            installations.push(installation)
            if (installation.status === PLUGIN_RESOURCE_INSTALLATION_STATUS.PENDING_AUTH) {
                pendingAuth.push(installation)
            }

            const runtimeNodeKey = this.attachRuntimeComponent(draft, installation, runtimeComponent, targetAgentKey)
            if (installation.runtimeNodeKey !== runtimeNodeKey || !installation.enabled) {
                installation.runtimeNodeKey = runtimeNodeKey
                installation.enabled = true
                await this.installationRepo.save(installation)
            }
        }

        await this.xpertService.updateDraft(xpert.id, {
            team: draft.team,
            nodes: draft.nodes,
            connections: draft.connections
        })

        return {
            installations,
            pendingAuth,
            xpert: latestXpert
        }
    }

    private async resolveRuntimeComponents(
        pluginName: string,
        selectors?: PluginResourceInstallComponent[],
        target?: PluginResourceInstallTarget
    ): Promise<RuntimeComponent[]> {
        const normalizedPluginName = normalizePluginName(pluginName)
        const rootDir = this.resolveLoadedPluginRoot(normalizedPluginName)
        const components = this.readPluginComponents(normalizedPluginName, rootDir)
        const selected = selectors?.length
            ? this.filterSelectedComponents(components, selectors, normalizedPluginName)
            : components
        const installable = selected.filter((component) => this.isInstallableForTarget(component.componentType, target))
        if (selectors?.length && installable.length !== selected.length) {
            throw new BadRequestException(`Selected plugin resources cannot be installed to ${target ?? 'this target'}`)
        }
        if (!installable.length) {
            throw new NotFoundException(
                target
                    ? `Plugin '${pluginName}' has no ${target} installable components`
                    : `Plugin '${pluginName}' has no installable components`
            )
        }

        return installable.map((component) => {
            const selector = selectors?.find(
                (item) =>
                    (!item.pluginName || normalizePluginName(item.pluginName) === normalizedPluginName) &&
                    (!item.componentType || item.componentType === component.componentType) &&
                    item.componentKey === component.componentKey
            )
            return {
                pluginName: normalizedPluginName,
                component,
                rootDir,
                targetAgentKey: selector?.targetAgentKey,
                policyOverrides: selector?.policyOverrides,
                events: selector?.events,
                auth: selector?.auth
            }
        })
    }

    private isInstallableForTarget(componentType: PluginComponentType, target?: PluginResourceInstallTarget) {
        if (!target) {
            return componentType !== PLUGIN_COMPONENT_TYPE.ASSET
        }
        if (target === 'workspace') {
            return (
                componentType === PLUGIN_COMPONENT_TYPE.SKILL ||
                componentType === PLUGIN_COMPONENT_TYPE.MCP_SERVER ||
                componentType === PLUGIN_COMPONENT_TYPE.APP
            )
        }
        return componentType === PLUGIN_COMPONENT_TYPE.HOOK
    }

    private async findInstallationsForTarget(
        workspaceId: string,
        xpertId: string | null,
        pluginName: string,
        agentKey?: string
    ) {
        const query = this.installationRepo
            .createQueryBuilder('installation')
            .where('installation.workspaceId = :workspaceId', { workspaceId })
            .andWhere('installation.pluginName = :pluginName', { pluginName })
            .orderBy('installation.updatedAt', 'DESC')
        if (xpertId) {
            query.andWhere('installation.xpertId = :xpertId', { xpertId })
            if (agentKey) {
                query.andWhere('installation.agentKey = :agentKey', { agentKey })
            }
        } else {
            query.andWhere('installation.xpertId IS NULL')
        }
        return query.getMany()
    }

    private async findPluginSkillPackages(
        workspaceId: string,
        pluginName: string,
        components: Array<Pick<PluginBundleComponentRegistration, 'componentType' | 'componentKey'>>
    ) {
        const sharedSkillIds = components
            .filter((component) => component.componentType === PLUGIN_COMPONENT_TYPE.SKILL)
            .map((component) => this.pluginSkillSharedId(pluginName, component.componentKey))
        if (!sharedSkillIds.length) {
            return new Map<string, SkillPackage>()
        }

        const packages = await this.skillPackageRepo.find({
            where: {
                workspaceId,
                sharedSkillId: In(sharedSkillIds)
            },
            order: {
                updatedAt: 'DESC'
            }
        })
        const grouped = new Map<string, SkillPackage>()
        for (const skillPackage of packages) {
            if (skillPackage.sharedSkillId && !grouped.has(skillPackage.sharedSkillId)) {
                grouped.set(skillPackage.sharedSkillId, skillPackage)
            }
        }
        return grouped
    }

    private pluginSkillSharedId(pluginName: string, componentKey: string) {
        return `plugin:${pluginName}:skill:${componentKey}`
    }

    private componentStateKey(component: Pick<IPluginResourceComponentState, 'componentType' | 'componentKey'>) {
        return `${component.componentType}:${component.componentKey}`
    }

    private async resolveTemplateDependencyComponents(
        defaultPluginName: string | undefined,
        dependencies?: XpertTemplatePluginDependencies
    ) {
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
                ? await this.resolveRuntimeComponents(pluginName, undefined)
                : []
        }

        const groups = await Promise.all(
            Array.from(new Set(components.map((item) => item.pluginName ?? pluginName))).map((name) =>
                this.resolveRuntimeComponents(
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

    private async installRuntimeComponent(
        runtimeComponent: RuntimeComponent,
        workspaceId: string,
        xpertId: string | null,
        agentKey: string | null = null
    ) {
        const runtimeType = this.resolveRuntimeType(runtimeComponent.component.componentType)
        const runtimeId = await this.ensureRuntime(runtimeComponent, workspaceId, xpertId, runtimeType)
        const status = this.resolveInstallationStatus(runtimeComponent)
        const config = this.buildInstallationConfig(runtimeComponent)
        const installation = await this.findInstallation(
            workspaceId,
            xpertId,
            agentKey,
            runtimeComponent.pluginName,
            runtimeComponent.component.componentType,
            runtimeComponent.component.componentKey
        )

        const next =
            installation ??
            this.installationRepo.create({
                tenantId: RequestContext.currentTenantId(),
                organizationId: RequestContext.getOrganizationId() ?? undefined,
                workspaceId,
                xpertId,
                agentKey,
                pluginName: runtimeComponent.pluginName,
                componentType: runtimeComponent.component.componentType,
                componentKey: runtimeComponent.component.componentKey
            })
        next.runtimeType = runtimeType
        next.runtimeId = runtimeId
        next.definitionHash = runtimeComponent.component.definitionHash
        next.status = status
        next.config = config
        next.enabled = true

        return this.installationRepo.save(next)
    }

    private async ensureRuntime(
        runtimeComponent: RuntimeComponent,
        workspaceId: string,
        xpertId: string | null,
        runtimeType: PluginResourceRuntimeType
    ) {
        if (runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE) {
            const skillRoot = this.resolveSkillRoot(runtimeComponent)
            const sharedSkillId = `plugin:${runtimeComponent.pluginName}:skill:${runtimeComponent.component.componentKey}`
            await this.skillPackageService.syncPluginSkillBundle(
                workspaceId,
                {
                    pluginName: runtimeComponent.pluginName,
                    componentKey: runtimeComponent.component.componentKey,
                    bundleRootPath: skillRoot
                },
                { skipAccessCheck: true }
            )
            const skillPackage = await this.skillPackageRepo.findOne({
                where: {
                    workspaceId,
                    sharedSkillId
                }
            })
            return skillPackage?.id ?? null
        }

        if (runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.TOOLSET) {
            const toolset = await this.ensureMcpToolset(runtimeComponent, workspaceId, xpertId)
            return toolset.id ?? null
        }

        if (runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.HOOK_PROFILE) {
            return `hook:${runtimeComponent.pluginName}:${runtimeComponent.component.componentKey}`
        }

        return `app:${runtimeComponent.pluginName}:${runtimeComponent.component.componentKey}`
    }

    private attachRuntimeComponent(
        draft: TXpertTeamDraft,
        installation: PluginResourceInstallation,
        runtimeComponent: RuntimeComponent,
        agentKey: string
    ) {
        if (installation.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE && installation.runtimeId) {
            return this.ensureSkillsMiddlewareNode(draft, agentKey, installation.runtimeId)
        }

        if (installation.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.TOOLSET && installation.runtimeId) {
            this.ensureToolsetNode(draft, agentKey, installation.runtimeId, runtimeComponent)
            this.applyMcpApprovalPolicy(draft, runtimeComponent)
            return installation.runtimeId
        }

        if (installation.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.HOOK_PROFILE) {
            return this.ensurePluginHooksMiddlewareNode(draft, agentKey, runtimeComponent)
        }

        if (installation.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.APP_CONNECTOR) {
            return null
        }

        return null
    }

    private async ensureMcpToolset(runtimeComponent: RuntimeComponent, workspaceId: string, xpertId: string | null) {
        await this.ensureRuntimePaths(runtimeComponent, workspaceId)
        const parsed = this.parseMcpServer(runtimeComponent)
        const policy = this.mergeMcpPolicies(parsed.policy, runtimeComponent.policyOverrides)
        const toolset = await this.findPluginManagedToolset(workspaceId, xpertId, runtimeComponent)
        const enabledTools = policy.enabledTools ?? []
        const tools: IXpertTool[] = enabledTools.map((name) => ({
            name,
            disabled: false,
            enabled: true,
            options: {
                approvalMode: policy.tools?.[name]?.approvalMode ?? policy.defaultToolsApprovalMode
            }
        }))
        const entity: Partial<XpertToolset> = {
            workspaceId,
            name: `${runtimeComponent.component.componentKey} MCP`,
            type: runtimeComponent.component.componentKey,
            category: XpertToolsetCategoryEnum.MCP,
            description: `Plugin-managed MCP server from ${runtimeComponent.pluginName}`,
            schema: JSON.stringify({
                mcpServers: {
                    [runtimeComponent.component.componentKey]: parsed.server
                }
            }),
            options: {
                disableToolDefault: enabledTools.length > 0,
                needSandbox: true,
                pluginManaged: true,
                pluginName: runtimeComponent.pluginName,
                componentKey: runtimeComponent.component.componentKey,
                ...(xpertId ? { xpertId } : {}),
                definitionHash: runtimeComponent.component.definitionHash,
                ...(policy.runtime ? { mcpRuntime: policy.runtime } : {}),
                policy
            },
            tools
        }

        if (toolset?.id) {
            await this.toolRepo.delete({ toolsetId: toolset.id })
            await this.toolsetService.update(toolset.id, entity)
            return this.toolsetRepo.findOneOrFail({ where: { id: toolset.id }, relations: ['tools'] })
        }

        return this.toolsetService.create(entity)
    }

    private ensureSkillsMiddlewareNode(draft: TXpertTeamDraft, agentKey: string, skillPackageId: string) {
        const node = this.findMiddlewareNode(draft, agentKey, SKILLS_MIDDLEWARE_NAME)
        const target =
            node ?? this.createMiddlewareNode(draft, agentKey, SKILLS_MIDDLEWARE_NAME, 'Skills Middleware', -280)
        const entity = target.entity as IWFNMiddleware
        const options = isObjectValue(entity.options) ? entity.options : {}
        const configuredSkills = Array.isArray(Reflect.get(options, 'skills'))
            ? (Reflect.get(options, 'skills') as unknown[]).filter((item): item is string => typeof item === 'string')
            : []
        const nextSkills = configuredSkills.includes(skillPackageId)
            ? configuredSkills
            : [...configuredSkills, skillPackageId]
        entity.options = {
            ...options,
            skills: nextSkills
        }
        return target.key
    }

    private ensurePluginHooksMiddlewareNode(
        draft: TXpertTeamDraft,
        agentKey: string,
        runtimeComponent: RuntimeComponent
    ) {
        const node =
            this.findMiddlewareNode(draft, agentKey, PLUGIN_HOOKS_MIDDLEWARE_NAME) ??
            this.createMiddlewareNode(draft, agentKey, PLUGIN_HOOKS_MIDDLEWARE_NAME, 'Plugin Hooks', -120)
        const entity = node.entity as IWFNMiddleware
        const options = isObjectValue(entity.options) ? entity.options : {}
        const hooks = Array.isArray(Reflect.get(options, 'hooks'))
            ? (Reflect.get(options, 'hooks') as unknown[]).filter(isHookRef)
            : []
        const nextHook = {
            pluginName: runtimeComponent.pluginName,
            componentKey: runtimeComponent.component.componentKey,
            events: runtimeComponent.events ?? []
        }
        const exists = hooks.some(
            (hook) => hook.pluginName === nextHook.pluginName && hook.componentKey === nextHook.componentKey
        )
        entity.options = {
            ...options,
            hooks: exists ? hooks : [...hooks, nextHook]
        }
        return node.key
    }

    private ensureToolsetNode(
        draft: TXpertTeamDraft,
        agentKey: string,
        toolsetId: string,
        runtimeComponent: RuntimeComponent
    ) {
        const nodeExists = draft.nodes.some((node) => node.type === 'toolset' && node.key === toolsetId)
        if (!nodeExists) {
            draft.nodes.push({
                key: toolsetId,
                type: 'toolset',
                position: { x: 280, y: 260 },
                entity: {
                    id: toolsetId,
                    name: `${runtimeComponent.component.componentKey} MCP`,
                    type: runtimeComponent.component.componentKey,
                    category: XpertToolsetCategoryEnum.MCP
                }
            })
        }

        this.ensureConnection(draft, agentKey, toolsetId, 'toolset')
        const agent = this.findAgentInDraft(draft, agentKey)
        if (agent) {
            const toolsetIds = agent.toolsetIds ?? []
            agent.toolsetIds = toolsetIds.includes(toolsetId) ? toolsetIds : [...toolsetIds, toolsetId]
        }
    }

    private createMiddlewareNode(
        draft: TXpertTeamDraft,
        agentKey: string,
        provider: string,
        title: string,
        xOffset: number
    ) {
        const key = genXpertMiddlewareKey()
        const entity: IWFNMiddleware = {
            id: key,
            key,
            title,
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            provider,
            options: {}
        }
        const node: TXpertTeamNode<'workflow'> = {
            key,
            type: 'workflow',
            position: { x: xOffset, y: 260 },
            entity
        }
        draft.nodes.push(node)
        this.ensureConnection(draft, agentKey, key, 'workflow')
        return node
    }

    private findMiddlewareNode(draft: TXpertTeamDraft, agentKey: string, provider: string) {
        const connectedKeys = new Set(
            draft.connections
                .filter((connection) => connection.from === agentKey && connection.type === 'workflow')
                .map((item) => item.to)
        )
        return draft.nodes.find((node) => {
            if (node.type !== 'workflow' || !connectedKeys.has(node.key)) {
                return false
            }
            const entity = node.entity as IWFNMiddleware
            return entity.type === WorkflowNodeTypeEnum.MIDDLEWARE && entity.provider === provider
        }) as TXpertTeamNode<'workflow'> | undefined
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

    private applyMcpApprovalPolicy(draft: TXpertTeamDraft, runtimeComponent: RuntimeComponent) {
        const policy = this.mergeMcpPolicies(
            this.readMcpPolicy(runtimeComponent.component.config),
            runtimeComponent.policyOverrides
        )
        const promptTools = (policy.enabledTools ?? []).filter((toolName) => {
            const toolPolicy = policy.tools?.[toolName]?.approvalMode ?? policy.defaultToolsApprovalMode
            return toolPolicy === PLUGIN_MCP_TOOL_APPROVAL_MODE.PROMPT
        })
        if (!promptTools.length) {
            return
        }

        const current = draft.team.agentConfig?.interruptBefore ?? []
        draft.team.agentConfig = {
            ...(draft.team.agentConfig ?? {}),
            interruptBefore: Array.from(new Set([...current, ...promptTools]))
        }
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

    private normalizeDraft(value: unknown, workspaceId: string, basic?: TemplateInstallBasic): XpertDraftDslDTO {
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

    private getPrimaryAgentKey(xpert: IXpert, draft: TXpertTeamDraft) {
        const key = draft.team.agent?.key ?? xpert.agent?.key
        if (key) {
            return key
        }
        const agentNode = draft.nodes.find((node) => node.type === 'agent')
        if (agentNode?.type === 'agent') {
            return agentNode.key
        }
        throw new BadRequestException('Primary agent key is required')
    }

    private findAgentInDraft(draft: TXpertTeamDraft, agentKey: string): IXpertAgent | null {
        const node = draft.nodes.find((item) => item.type === 'agent' && item.key === agentKey)
        if (node?.type === 'agent') {
            return node.entity
        }
        if (draft.team.agent?.key === agentKey) {
            return draft.team.agent
        }
        return null
    }

    private readPluginComponents(pluginName: string, rootDir: string) {
        const manifestResult = readPluginBundleManifest(rootDir)
        const components = manifestResult ? collectPluginBundleComponents(rootDir, manifestResult.manifest) : []
        if (!components.length) {
            throw new NotFoundException(`Plugin '${pluginName}' has no installable components`)
        }
        return components
    }

    private filterSelectedComponents(
        components: PluginBundleComponentRegistration[],
        selectors: PluginResourceInstallComponent[],
        defaultPluginName: string
    ) {
        const selected = components.filter((component) =>
            selectors.some(
                (selector) =>
                    normalizePluginName(selector.pluginName ?? defaultPluginName) === defaultPluginName &&
                    selector.componentKey === component.componentKey &&
                    (!selector.componentType || selector.componentType === component.componentType)
            )
        )
        if (!selected.length) {
            throw new NotFoundException('No matching plugin components were found')
        }
        return selected
    }

    private resolveLoadedPluginRoot(pluginName: string) {
        const record = this.loadedPlugins.find((item) => {
            const names = [item.name, item.packageName].filter((value): value is string => !!value)
            return names.some((name) => normalizePluginName(name) === pluginName)
        })
        const root = record ? resolveLoadedPluginBundleRoot(record) : null
        if (!root) {
            throw new NotFoundException(`Loaded plugin '${pluginName}' was not found`)
        }
        return root
    }

    private resolveSkillRoot(runtimeComponent: RuntimeComponent) {
        const sourcePath = runtimeComponent.component.sourcePath
        if (!sourcePath) {
            throw new BadRequestException(
                `Skill component '${runtimeComponent.component.componentKey}' is missing sourcePath`
            )
        }
        const skillFile = this.resolvePluginPath(runtimeComponent.rootDir, sourcePath)
        return dirname(skillFile)
    }

    private async ensureRuntimePaths(runtimeComponent: RuntimeComponent, workspaceId: string): Promise<void> {
        const pluginData = resolve(
            process.cwd(),
            '.xpertai-plugin-data',
            safePathSegment(RequestContext.currentTenantId() ?? 'tenant'),
            safePathSegment(workspaceId),
            safePathSegment(runtimeComponent.pluginName),
            safePathSegment(runtimeComponent.component.componentKey)
        )
        await mkdir(pluginData, { recursive: true })
    }

    private parseMcpServer(runtimeComponent: RuntimeComponent): ParsedMcpServer {
        if (!isObjectValue(runtimeComponent.component.config)) {
            throw new BadRequestException(
                `MCP component '${runtimeComponent.component.componentKey}' has invalid config`
            )
        }
        const command = readStringField(runtimeComponent.component.config, 'command')
        const url = readStringField(runtimeComponent.component.config, 'url')
        const explicitType = readStringField(runtimeComponent.component.config, 'type')
        const serverType = this.normalizeMcpServerType(explicitType ?? (command ? 'stdio' : url ? 'http' : undefined))
        if (!serverType) {
            throw new BadRequestException(
                `MCP component '${runtimeComponent.component.componentKey}' has invalid transport`
            )
        }
        const policy = this.readMcpPolicy(runtimeComponent.component.config)

        const server: TMCPServer = {
            type: serverType,
            ...(command ? { command } : {}),
            ...(url ? { url } : {}),
            ...this.readStringArrayProperty(runtimeComponent.component.config, 'args'),
            ...this.readStringMapProperty(runtimeComponent.component.config, 'env'),
            ...this.readStringMapProperty(runtimeComponent.component.config, 'headers'),
            ...(readStringField(runtimeComponent.component.config, 'encoding')
                ? { encoding: readStringField(runtimeComponent.component.config, 'encoding') }
                : {}),
            ...(readStringField(runtimeComponent.component.config, 'encodingErrorHandler')
                ? { encodingErrorHandler: readStringField(runtimeComponent.component.config, 'encodingErrorHandler') }
                : {}),
            ...(policy.runtime ? { runtime: policy.runtime } : {})
        }

        return {
            server,
            policy
        }
    }

    private readStringArrayProperty(source: object, key: string) {
        const value = Reflect.get(source, key)
        if (!Array.isArray(value)) {
            return {}
        }
        const args = value
            .map((item) => (typeof item === 'string' ? item : null))
            .filter((item): item is string => item !== null)
        return args.length ? { [key]: args } : {}
    }

    private readStringMapProperty(source: object, key: 'env' | 'headers') {
        const value = Reflect.get(source, key)
        if (!isObjectValue(value)) {
            return {}
        }
        const entries: Array<[string, string]> = []
        for (const [entryKey, entryValue] of Object.entries(value)) {
            if (typeof entryValue === 'string') {
                entries.push([entryKey, entryValue])
            }
        }
        return entries.length ? { [key]: Object.fromEntries(entries) } : {}
    }

    private normalizeMcpServerType(value: string | undefined): MCPServerType | null {
        if (value === MCPServerType.STDIO) {
            return MCPServerType.STDIO
        }
        if (value === MCPServerType.SSE) {
            return MCPServerType.SSE
        }
        if (value === MCPServerType.HTTP) {
            return MCPServerType.HTTP
        }
        if (value === MCPServerType.CODE) {
            return MCPServerType.CODE
        }
        return null
    }

    private readMcpPolicy(value: JSONValue | null | undefined): XpertPluginMcpServerPolicy {
        if (!isObjectValue(value)) {
            return {}
        }
        const policyValue = Reflect.get(value, 'policy')
        if (!isObjectValue(policyValue)) {
            return {}
        }
        const enabledTools = Array.isArray(Reflect.get(policyValue, 'enabledTools'))
            ? (Reflect.get(policyValue, 'enabledTools') as unknown[]).filter(
                  (item): item is string => typeof item === 'string'
              )
            : undefined
        const defaultToolsApprovalMode = readApprovalMode(Reflect.get(policyValue, 'defaultToolsApprovalMode'))
        const toolsValue = Reflect.get(policyValue, 'tools')
        const runtime = readRuntimePolicy(Reflect.get(policyValue, 'runtime'))
        const tools: XpertPluginMcpServerPolicy['tools'] = {}
        if (isObjectValue(toolsValue)) {
            for (const [toolName, toolPolicy] of Object.entries(toolsValue)) {
                if (isObjectValue(toolPolicy)) {
                    const approvalMode = readApprovalMode(Reflect.get(toolPolicy, 'approvalMode'))
                    if (approvalMode) {
                        tools[toolName] = { approvalMode }
                    }
                }
            }
        }
        return removeUndefinedPolicy({
            enabled:
                typeof Reflect.get(policyValue, 'enabled') === 'boolean'
                    ? Reflect.get(policyValue, 'enabled')
                    : undefined,
            defaultToolsApprovalMode,
            enabledTools,
            runtime,
            tools: Object.keys(tools).length ? tools : undefined
        })
    }

    private mergeMcpPolicies(base?: XpertPluginMcpServerPolicy, override?: XpertPluginMcpServerPolicy) {
        const mergedTools = {
            ...(base?.tools ?? {}),
            ...(override?.tools ?? {})
        }
        return removeUndefinedPolicy({
            enabled: override?.enabled ?? base?.enabled,
            defaultToolsApprovalMode: override?.defaultToolsApprovalMode ?? base?.defaultToolsApprovalMode,
            enabledTools: override?.enabledTools ?? base?.enabledTools,
            runtime: override?.runtime ?? base?.runtime,
            tools: Object.keys(mergedTools).length ? mergedTools : undefined
        })
    }

    private buildInstallationConfig(runtimeComponent: RuntimeComponent): JSONValue | null {
        const config = runtimeComponent.component.config
        if (config === undefined) {
            return null
        }
        if (
            runtimeComponent.component.componentType === PLUGIN_COMPONENT_TYPE.APP &&
            resolvePluginAppResourceInstallationStatus(config, runtimeComponent.auth) ===
                PLUGIN_RESOURCE_INSTALLATION_STATUS.BLOCKED
        ) {
            return buildBlockedAppConfig(config)
        }
        return config
    }

    private resolveInstallationStatus(runtimeComponent: RuntimeComponent) {
        if (runtimeComponent.component.componentType === PLUGIN_COMPONENT_TYPE.APP) {
            return resolvePluginAppResourceInstallationStatus(runtimeComponent.component.config, runtimeComponent.auth)
        }
        return PLUGIN_RESOURCE_INSTALLATION_STATUS.READY
    }

    private resolveRuntimeType(componentType: PluginComponentType): PluginResourceRuntimeType {
        if (componentType === PLUGIN_COMPONENT_TYPE.SKILL) {
            return PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE
        }
        if (componentType === PLUGIN_COMPONENT_TYPE.MCP_SERVER) {
            return PLUGIN_RESOURCE_RUNTIME_TYPE.TOOLSET
        }
        if (componentType === PLUGIN_COMPONENT_TYPE.HOOK) {
            return PLUGIN_RESOURCE_RUNTIME_TYPE.HOOK_PROFILE
        }
        if (componentType === PLUGIN_COMPONENT_TYPE.APP) {
            return PLUGIN_RESOURCE_RUNTIME_TYPE.APP_CONNECTOR
        }
        throw new BadRequestException(`Unsupported plugin component type '${componentType}'`)
    }

    private async findInstallation(
        workspaceId: string,
        xpertId: string | null,
        agentKey: string | null,
        pluginName: string,
        componentType: PluginComponentType,
        componentKey: string
    ) {
        const query = this.installationRepo
            .createQueryBuilder('installation')
            .where('installation.workspaceId = :workspaceId', { workspaceId })
            .andWhere('installation.pluginName = :pluginName', { pluginName })
            .andWhere('installation.componentType = :componentType', { componentType })
            .andWhere('installation.componentKey = :componentKey', { componentKey })
        if (xpertId) {
            query.andWhere('installation.xpertId = :xpertId', { xpertId })
            if (agentKey) {
                query.andWhere('installation.agentKey = :agentKey', { agentKey })
            } else {
                query.andWhere('installation.agentKey IS NULL')
            }
        } else {
            query.andWhere('installation.xpertId IS NULL')
            query.andWhere('installation.agentKey IS NULL')
        }
        return query.getOne()
    }

    private async findPluginManagedToolset(
        workspaceId: string,
        xpertId: string | null,
        runtimeComponent: RuntimeComponent
    ) {
        const query = this.toolsetRepo
            .createQueryBuilder('toolset')
            .where('toolset.workspaceId = :workspaceId', { workspaceId })
            .andWhere("toolset.options ->> 'pluginManaged' = 'true'")
            .andWhere("toolset.options ->> 'pluginName' = :pluginName", { pluginName: runtimeComponent.pluginName })
            .andWhere("toolset.options ->> 'componentKey' = :componentKey", {
                componentKey: runtimeComponent.component.componentKey
            })
        if (xpertId) {
            query.andWhere("toolset.options ->> 'xpertId' = :xpertId", { xpertId })
        }
        return query.getOne()
    }

    private resolvePluginPath(rootDir: string, sourcePath: string) {
        const resolved = resolve(rootDir, sourcePath)
        const relativePath = relative(rootDir, resolved)
        if (isAbsolute(relativePath) || relativePath.startsWith('..')) {
            throw new BadRequestException(`Plugin component path is outside plugin root: ${sourcePath}`)
        }
        return resolved
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

function readStringField(value: object, key: string): string | undefined {
    const field = Reflect.get(value, key)
    return typeof field === 'string' && field.trim() ? field.trim() : undefined
}

function readApprovalMode(value: unknown) {
    if (
        value === PLUGIN_MCP_TOOL_APPROVAL_MODE.PROMPT ||
        value === PLUGIN_MCP_TOOL_APPROVAL_MODE.APPROVE ||
        value === PLUGIN_MCP_TOOL_APPROVAL_MODE.DENY
    ) {
        return value
    }
    return undefined
}

function readPositiveNumberField(value: object, key: string): number | undefined {
    const field = Reflect.get(value, key)
    return typeof field === 'number' && Number.isFinite(field) && field > 0 ? field : undefined
}

function readStringArrayField(value: object, key: string): string[] | undefined {
    const field = Reflect.get(value, key)
    if (!Array.isArray(field)) {
        return undefined
    }
    const items = field
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item): item is string => Boolean(item))
    return items.length ? items : undefined
}

function readRuntimePolicy(value: unknown): XpertPluginMcpServerPolicy['runtime'] | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const runtime = {
        provider: readStringField(value, 'provider'),
        startupTimeoutMs: readPositiveNumberField(value, 'startupTimeoutMs'),
        idleTimeoutMs: readPositiveNumberField(value, 'idleTimeoutMs'),
        maxLifetimeMs: readPositiveNumberField(value, 'maxLifetimeMs'),
        allowedCommands: readStringArrayField(value, 'allowedCommands')
    }
    return Object.values(runtime).some((item) => item !== undefined) ? runtime : undefined
}

function removeUndefinedPolicy(policy: XpertPluginMcpServerPolicy): XpertPluginMcpServerPolicy {
    return {
        ...(typeof policy.enabled === 'boolean' ? { enabled: policy.enabled } : {}),
        ...(policy.defaultToolsApprovalMode ? { defaultToolsApprovalMode: policy.defaultToolsApprovalMode } : {}),
        ...(policy.enabledTools?.length ? { enabledTools: policy.enabledTools } : {}),
        ...(policy.runtime ? { runtime: policy.runtime } : {}),
        ...(policy.tools && Object.keys(policy.tools).length ? { tools: policy.tools } : {})
    }
}

function safePathSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
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

function isHookRef(value: unknown): value is { pluginName: string; componentKey: string; events?: string[] } {
    if (!isObjectValue(value)) {
        return false
    }
    const pluginName = Reflect.get(value, 'pluginName')
    const componentKey = Reflect.get(value, 'componentKey')
    const events = Reflect.get(value, 'events')
    return (
        typeof pluginName === 'string' &&
        !!pluginName.trim() &&
        typeof componentKey === 'string' &&
        !!componentKey.trim() &&
        (typeof events === 'undefined' || (Array.isArray(events) && events.every((event) => typeof event === 'string')))
    )
}
