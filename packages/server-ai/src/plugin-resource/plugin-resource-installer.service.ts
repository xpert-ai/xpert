import {
    IWFNMiddleware,
    I18nObject,
    IconDefinition,
    IXpert,
    IXpertAgent,
    IXpertTool,
    JSONValue,
    MCPServerType,
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_MCP_TOOL_APPROVAL_MODE,
    PLUGIN_RESOURCE_INSTALLATION_STATUS,
    PLUGIN_RESOURCE_RUNTIME_TYPE,
    PluginComponentType,
    PluginResourceComponentSelector,
    PluginResourceRuntimeType,
    SkillMetadata,
    TMCPServer,
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
    PluginBundleComponentRegistration
} from '@xpert-ai/server-core'
import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { In, Repository } from 'typeorm'
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
    component: PluginBundleComponentRegistration
    rootDir: string
    targetAgentKey?: string
    policyOverrides?: XpertPluginMcpServerPolicy
    events?: string[]
    auth?: 'on_install' | 'on_first_use'
}

type ParsedMcpServer = {
    server: TMCPServer
    policy?: XpertPluginMcpServerPolicy
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
        const components = readPluginResourceComponents(normalizedPluginName, rootDir)
        const selected = selectors?.length
            ? this.filterSelectedComponents(components, selectors, normalizedPluginName)
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
