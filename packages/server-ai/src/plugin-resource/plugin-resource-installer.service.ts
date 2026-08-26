import {
    IWFNMiddleware,
    I18nObject,
    IconDefinition,
    IXpert,
    IXpertAgent,
    IXpertTool,
    JSONValue,
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_MCP_TOOL_APPROVAL_MODE,
    PLUGIN_RESOURCE_ERROR_CODE,
    PLUGIN_RESOURCE_INSTALLATION_STATUS,
    PLUGIN_RESOURCE_RUNTIME_TYPE,
    PluginComponentType,
    PluginResourceComponentSelector,
    PluginResourceRuntimeType,
    SkillMetadata,
    TXpertTeamConnection,
    TXpertTeamDraft,
    TXpertTeamNode,
    WorkflowNodeTypeEnum,
    XpertPluginMcpServerPolicy,
    XpertToolsetCategoryEnum,
    genXpertMiddlewareKey
} from '@xpert-ai/contracts'
import {
    LOADED_PLUGINS,
    LoadedPluginRecord,
    normalizePluginName,
    PluginBundleComponentRegistration,
    readPluginBundleManifest
} from '@xpert-ai/server-core'
import { BadRequestException, HttpStatus, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import { t } from 'i18next'
import { IsNull, Repository } from 'typeorm'
import { SkillPackage } from '../skill-package/skill-package.entity'
import { SkillPackageService } from '../skill-package/skill-package.service'
import { SKILLS_MIDDLEWARE_NAME } from '../skill-package/types'
import { XpertService } from '../xpert/xpert.service'
import { XpertWorkspaceAccessService } from '../xpert-workspace'
import { XpertTool } from '../xpert-tool/xpert-tool.entity'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { XpertToolsetService } from '../xpert-toolset/xpert-toolset.service'
import { PLUGIN_HOOKS_MIDDLEWARE_NAME } from './plugin-hooks.middleware'
import { buildBlockedAppConfig, resolvePluginAppResourceInstallationStatus } from './plugin-resource-app-status'
import {
    isPluginResourceInstallableForTarget,
    PluginResourceInstallTarget,
    readPluginResourceComponents,
    resolveLoadedPluginResourceRoot
} from './plugin-resource-components'
import { PluginResourceInstallation } from './plugin-resource-installation.entity'
import { applyPluginResourceOrganizationScope } from './plugin-resource-installation-scope'
import {
    mergePluginMcpPolicies,
    parsePluginMcpCapabilityDeclarations,
    parsePluginMcpServerConfig,
    ParsedPluginMcpServer
} from './plugin-mcp-server-contract'
import { McpCapabilityCatalogService } from '../mcp-publication/mcp-capability-catalog.service'

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

export type RuntimeComponent = {
    pluginName: string
    pluginVersion?: string
    component: PluginBundleComponentRegistration
    rootDir: string
    targetAgentKey?: string
    policyOverrides?: XpertPluginMcpServerPolicy
    events?: string[]
    auth?: 'on_install' | 'on_first_use'
}

export function selectPluginResourceComponents(
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
        throw new NotFoundException({
            statusCode: HttpStatus.NOT_FOUND,
            errorCode: PLUGIN_RESOURCE_ERROR_CODE.NO_MATCHING_COMPONENTS,
            message: t('server-ai:Error.NoMatchingPluginComponents', {
                defaultValue: 'No matching plugin components were found.'
            })
        })
    }
    return selected
}

/**
 * Restores per-Agent selector cardinality after component discovery has
 * de-duplicated portable plugin resources by component identity.
 */
export function expandPluginRuntimeComponents(
    components: PluginBundleComponentRegistration[],
    selectors: PluginResourceInstallComponent[],
    normalizedPluginName: string,
    rootDir: string,
    pluginVersion?: string
): RuntimeComponent[] {
    return selectors.flatMap((selector) => {
        if (selector.pluginName && normalizePluginName(selector.pluginName) !== normalizedPluginName) {
            return []
        }
        return components
            .filter(
                (component) =>
                    selector.componentKey === component.componentKey &&
                    (!selector.componentType || selector.componentType === component.componentType)
            )
            .map((component) => ({
                pluginName: normalizedPluginName,
                pluginVersion,
                component,
                rootDir,
                targetAgentKey: selector.targetAgentKey,
                policyOverrides: selector.policyOverrides,
                events: selector.events,
                auth: selector.auth
            }))
    })
}

export function buildPluginManagedMcpToolsetEntity(
    runtimeComponent: RuntimeComponent,
    workspaceId: string,
    xpertId: string | null,
    parsed: ParsedPluginMcpServer
): Partial<XpertToolset> {
    const policy = mergePluginMcpPolicies(parsed.policy, runtimeComponent.policyOverrides)
    const enabledTools = policy.enabledTools ?? []
    const tools: IXpertTool[] = enabledTools.map((name) => ({
        name,
        disabled: false,
        enabled: true,
        options: {
            approvalMode: policy.tools?.[name]?.approvalMode ?? policy.defaultToolsApprovalMode
        }
    }))
    return {
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
            disableToolDefault: policy.enabledTools !== undefined,
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
}

@Injectable()
export class PluginResourceInstallerService {
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
        private readonly capabilityCatalog: McpCapabilityCatalogService,
        private readonly xpertService: XpertService,
        @Optional()
        @Inject(LOADED_PLUGINS)
        private readonly loadedPlugins: LoadedPluginRecord[] = []
    ) {}

    async installToWorkspace(
        pluginName: string,
        workspaceId: string,
        components?: PluginResourceInstallComponent[]
    ): Promise<PluginResourceInstallResult> {
        await this.workspaceAccess.assertCanAuthor(workspaceId)
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

    async installToOrganization(
        pluginName: string,
        components?: PluginResourceInstallComponent[]
    ): Promise<PluginResourceInstallResult> {
        const runtimeComponents = await this.resolveRuntimeComponents(pluginName, components, 'organization')
        const installations: PluginResourceInstallation[] = []
        for (const runtimeComponent of runtimeComponents) {
            installations.push(await this.installRuntimeComponent(runtimeComponent, null, null))
        }
        return { installations, pendingAuth: [] }
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
        await this.workspaceAccess.assertCanAuthor(xpert.workspaceId)

        const runtimeComponents = await this.resolveRuntimeComponents(pluginName, components, 'xpert')
        return this.installComponentsForXpert(xpert, runtimeComponents, agentKey)
    }

    async installComponentsForXpert(
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

    async resolveRuntimeComponents(
        pluginName: string,
        selectors?: PluginResourceInstallComponent[],
        target?: PluginResourceInstallTarget
    ): Promise<RuntimeComponent[]> {
        const normalizedPluginName = normalizePluginName(pluginName)
        const rootDir = resolveLoadedPluginResourceRoot(normalizedPluginName, this.loadedPlugins)
        const pluginVersion = readPluginBundleManifest(rootDir)?.manifest.version
        const components = readPluginResourceComponents(normalizedPluginName, rootDir)
        const selected = selectors?.length
            ? selectPluginResourceComponents(components, selectors, normalizedPluginName)
            : components
        const installable = selected.filter((component) =>
            isPluginResourceInstallableForTarget(component.componentType, target)
        )
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

        if (!selectors?.length) {
            return installable.map((component) => ({
                pluginName: normalizedPluginName,
                pluginVersion,
                component,
                rootDir
            }))
        }

        // A template may attach the same portable resource to several Agents.
        // Component discovery intentionally returns unique plugin components, so
        // expand them back through every selector here instead of keeping only
        // the first targetAgentKey. Each expanded entry creates an Agent-scoped
        // installation and updates that Agent's middleware independently.
        return expandPluginRuntimeComponents(installable, selectors, normalizedPluginName, rootDir, pluginVersion)
    }

    private async installRuntimeComponent(
        runtimeComponent: RuntimeComponent,
        workspaceId: string | null,
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
                ...(workspaceId ? { workspaceId } : {}),
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
        workspaceId: string | null,
        xpertId: string | null,
        runtimeType: PluginResourceRuntimeType
    ) {
        if (runtimeComponent.component.componentType === PLUGIN_COMPONENT_TYPE.TOOLSET) {
            const toolset = await this.ensureNativeToolset(runtimeComponent)
            return toolset.id ?? null
        }
        if (!workspaceId) {
            throw new BadRequestException(
                `Plugin component '${runtimeComponent.component.componentKey}' requires a workspace installation target`
            )
        }
        if (runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE) {
            const skillRoot = this.resolveSkillRoot(runtimeComponent)
            const sharedSkillId = `plugin:${runtimeComponent.pluginName}:skill:${runtimeComponent.component.componentKey}`
            await this.skillPackageService.syncPluginSkillBundle(
                workspaceId,
                {
                    pluginName: runtimeComponent.pluginName,
                    componentKey: runtimeComponent.component.componentKey,
                    bundleRootPath: skillRoot,
                    metadata: buildSkillMetadataOverrides(runtimeComponent.component.metadata)
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
        const capabilities = await this.loadMcpCapabilities(runtimeComponent, parsed)
        const toolset = await this.findPluginManagedToolset(workspaceId, xpertId, runtimeComponent)
        const entity = buildPluginManagedMcpToolsetEntity(runtimeComponent, workspaceId, xpertId, parsed)

        let persisted: XpertToolset
        if (toolset?.id) {
            await this.toolRepo.delete({ toolsetId: toolset.id })
            await this.toolsetService.update(toolset.id, entity)
            persisted = await this.toolsetRepo.findOneOrFail({ where: { id: toolset.id }, relations: ['tools'] })
        } else {
            persisted = await this.toolsetService.create(entity)
        }
        if (!persisted.id || !persisted.tenantId) {
            throw new Error('Persisted plugin-managed toolset is missing its identity scope')
        }
        await this.capabilityCatalog.replaceToolsetCapabilities({
            tenantId: persisted.tenantId,
            organizationId: persisted.organizationId,
            toolsetId: persisted.id,
            pluginName: runtimeComponent.pluginName,
            pluginVersion: runtimeComponent.pluginVersion,
            capabilities
        })
        return persisted
    }

    private async loadMcpCapabilities(runtimeComponent: RuntimeComponent, parsed: ParsedPluginMcpServer) {
        if (!parsed.capabilitySource) {
            return parsed.capabilities
        }
        const capabilityFile = this.resolvePluginPath(runtimeComponent.rootDir, parsed.capabilitySource)
        const [pluginRoot, resolvedFile] = await Promise.all([
            realpath(runtimeComponent.rootDir),
            realpath(capabilityFile)
        ])
        const relativePath = relative(pluginRoot, resolvedFile)
        if (isAbsolute(relativePath) || relativePath.startsWith('..')) {
            throw new BadRequestException(
                `Plugin MCP capability file is outside plugin root: ${parsed.capabilitySource}`
            )
        }
        let value: unknown
        try {
            value = JSON.parse(await readFile(resolvedFile, 'utf8'))
        } catch (error) {
            throw new BadRequestException(
                `Unable to read MCP capability file '${parsed.capabilitySource}': ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
        }
        try {
            return parsePluginMcpCapabilityDeclarations(value, runtimeComponent.component.componentKey)
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : String(error))
        }
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
        const policy = mergePluginMcpPolicies(
            this.parseMcpServer(runtimeComponent).policy,
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

    private parseMcpServer(runtimeComponent: RuntimeComponent): ParsedPluginMcpServer {
        try {
            return parsePluginMcpServerConfig(
                runtimeComponent.component.config,
                runtimeComponent.component.componentKey
            )
        } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : String(error))
        }
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
        if (componentType === PLUGIN_COMPONENT_TYPE.TOOLSET) {
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
        workspaceId: string | null,
        xpertId: string | null,
        agentKey: string | null,
        pluginName: string,
        componentType: PluginComponentType,
        componentKey: string
    ) {
        const query = this.installationRepo
            .createQueryBuilder('installation')
            .where('installation.pluginName = :pluginName', { pluginName })
            .andWhere('installation.componentType = :componentType', { componentType })
            .andWhere('installation.componentKey = :componentKey', { componentKey })
        if (workspaceId) {
            query.andWhere('installation.workspaceId = :workspaceId', { workspaceId })
        } else {
            query.andWhere('installation.workspaceId IS NULL')
            applyPluginResourceOrganizationScope(query, 'installation')
        }
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

    private async ensureNativeToolset(runtimeComponent: RuntimeComponent) {
        const config = runtimeComponent.component.config
        if (!isObjectValue(config)) {
            throw new BadRequestException(
                `Native toolset component '${runtimeComponent.component.componentKey}' has invalid config`
            )
        }
        const provider = readStringField(config, 'provider')
        if (!provider) {
            throw new BadRequestException(
                `Native toolset component '${runtimeComponent.component.componentKey}' requires provider`
            )
        }
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId() ?? null
        const candidates = await this.toolsetRepo.find({
            where: {
                tenantId,
                organizationId: organizationId ?? IsNull(),
                workspaceId: IsNull(),
                category: XpertToolsetCategoryEnum.BUILTIN,
                type: provider
            }
        })
        const current = candidates.find((toolset) =>
            isPluginNativeToolset(toolset, runtimeComponent.pluginName, runtimeComponent.component.componentKey)
        )
        const name = readStringField(config, 'name') ?? `${runtimeComponent.component.componentKey} MCP Capabilities`
        const description =
            readStringField(config, 'description') ?? `Host-native MCP capabilities from ${runtimeComponent.pluginName}`
        const toolset = await this.toolsetService.createBuiltinToolset(provider, {
            ...(current?.id ? { id: current.id } : {}),
            name,
            description,
            credentials: {},
            options: {
                pluginManaged: true,
                pluginName: runtimeComponent.pluginName,
                componentKey: runtimeComponent.component.componentKey,
                definitionHash: runtimeComponent.component.definitionHash
            }
        })
        if (!toolset.id) {
            throw new Error('Persisted native plugin toolset is missing its identity')
        }
        await this.capabilityCatalog.discoverAndReplaceMcpToolset(toolset.id)
        return toolset
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
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(value: object, key: string): string | undefined {
    const field = Reflect.get(value, key)
    return typeof field === 'string' && field.trim() ? field.trim() : undefined
}

function isPluginNativeToolset(toolset: XpertToolset, pluginName: string, componentKey: string) {
    const options = toolset.options
    if (!isObjectValue(options)) {
        return false
    }
    return (
        Reflect.get(options, 'pluginManaged') === true &&
        Reflect.get(options, 'pluginName') === pluginName &&
        Reflect.get(options, 'componentKey') === componentKey
    )
}

function buildSkillMetadataOverrides(value: unknown): Partial<SkillMetadata> | null {
    if (!isObjectValue(value)) {
        return null
    }

    const metadata: Partial<SkillMetadata> = {}
    const displayName = readI18nObjectField(value, 'displayName')
    const description = readI18nObjectField(value, 'description')
    const icon = readIconDefinitionField(value, 'icon')
    const color = readStringField(value, 'color')

    if (displayName) {
        metadata.displayName = displayName
    }
    if (description) {
        metadata.description = description
    }
    if (icon) {
        metadata.icon = icon
    }
    if (color) {
        metadata.color = color
    }

    return Object.keys(metadata).length ? metadata : null
}

function readI18nObjectField(value: object, key: string): I18nObject | undefined {
    const field = Reflect.get(value, key)
    if (typeof field === 'string' && field.trim()) {
        return toI18nObject(field.trim())
    }
    if (!isObjectValue(field)) {
        return undefined
    }

    const enUS = readStringField(field, 'en_US')
    const zhHans = readStringField(field, 'zh_Hans')
    const fallback = enUS ?? zhHans
    return fallback
        ? {
              en_US: fallback,
              ...(zhHans ? { zh_Hans: zhHans } : {})
          }
        : undefined
}

function toI18nObject(value: string): I18nObject {
    return {
        en_US: value,
        zh_Hans: value
    }
}

function readIconDefinitionField(value: object, key: string): IconDefinition | undefined {
    const field = Reflect.get(value, key)
    if (!isObjectValue(field)) {
        return undefined
    }
    const type = readStringField(field, 'type')
    const iconValue = readStringField(field, 'value')
    if (!type || !iconValue) {
        return undefined
    }

    return field as IconDefinition
}

function safePathSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
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
