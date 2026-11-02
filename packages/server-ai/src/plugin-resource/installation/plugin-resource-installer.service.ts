import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    IXpert,
    JSONValue,
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_MCP_TOOL_APPROVAL_MODE,
    PLUGIN_RESOURCE_INSTALLATION_STATUS,
    PLUGIN_RESOURCE_RUNTIME_TYPE,
    PluginComponentType,
    PluginResourceRuntimeType,
    TXpertTeamDraft,
    XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { RequestContext, XpertToolProviderRegistry } from '@xpert-ai/plugin-sdk'
import {
    LOADED_PLUGINS,
    LoadedPluginRecord,
    normalizePluginName,
    readPluginBundleManifest
} from '@xpert-ai/server-core'
import { t } from 'i18next'
import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { IsNull, Repository } from 'typeorm'
import { McpCapabilityCatalogService } from '../../mcp-publication/mcp-capability-catalog.service'
import { SkillPackage } from '../../skill-package/skill-package.entity'
import { SkillPackageService } from '../../skill-package/skill-package.service'
import { SKILLS_MIDDLEWARE_NAME } from '../../skill-package/types'
import { XpertTool } from '../../xpert-tool/xpert-tool.entity'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { XpertToolsetService } from '../../xpert-toolset/xpert-toolset.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { XpertService } from '../../xpert/xpert.service'
import {
    isPluginResourceInstallableForTarget,
    listRuntimeToolProviderComponents,
    PluginResourceInstallTarget,
    readPluginResourceComponents,
    resolveLoadedPluginResourceRoot
} from '../catalog/plugin-resource-components'
import { PLUGIN_HOOKS_MIDDLEWARE_NAME } from '../hooks/plugin-hooks.middleware'
import {
    mergePluginMcpPolicies,
    ParsedPluginMcpServer,
    parsePluginMcpCapabilityDeclarations,
    parsePluginMcpServerConfig
} from '../mcp/plugin-mcp-server-contract'
import { PluginResourceInstallation } from '../plugin-resource-installation.entity'
import { buildBlockedAppConfig, resolvePluginAppResourceInstallationStatus } from './plugin-resource-app-status'
import {
    createMiddlewareNode,
    ensureDraft,
    ensurePluginHooksMiddlewareNode,
    ensureSkillsMiddlewareNode,
    ensureToolsetNode,
    findMiddlewareNode,
    getPrimaryAgentKey
} from './plugin-resource-draft'
import { applyPluginResourceOrganizationScope } from './plugin-resource-installation-scope'
import type {
    PluginResourceInstallComponent,
    PluginResourceInstallResult,
    RegisteredRuntimeToolProviderInstallation,
    RuntimeComponent
} from './plugin-resource-installer.types'
import {
    buildPluginManagedMcpToolsetEntity,
    buildSkillMetadataOverrides,
    componentIdentity,
    expandPluginRuntimeComponents,
    isObjectValue,
    isPluginNativeToolset,
    preserveManagedMcpConfig,
    readStringField,
    safeMessage,
    safePathSegment,
    selectPluginResourceComponents
} from './plugin-resource-installer.utils'

@Injectable()
export class PluginResourceInstallerService {
    private readonly logger = new Logger(PluginResourceInstallerService.name)

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
        private readonly toolProviderRegistry: XpertToolProviderRegistry,
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

    /**
     * Installs only a Provider proven to come from the runtime registry. Manifest
     * metadata is deliberately excluded from this trust boundary.
     */
    async installRegisteredRuntimeToolProviderToOrganization(input: {
        pluginName: string
        componentKey: string
        provider: string
        sourceScopeKey: string
    }): Promise<RegisteredRuntimeToolProviderInstallation> {
        const pluginName = normalizePluginName(input.pluginName)
        const registration = listRuntimeToolProviderComponents(
            pluginName,
            this.toolProviderRegistry,
            input.sourceScopeKey
        ).find(
            ({ component, source }) =>
                source.kind === 'plugin' &&
                normalizePluginName(source.pluginName) === pluginName &&
                source.scopeKey === input.sourceScopeKey &&
                component.componentType === PLUGIN_COMPONENT_TYPE.TOOLSET &&
                component.componentKey === input.componentKey
        )
        if (!registration) {
            throw new BadRequestException(
                `Plugin component '${input.componentKey}' is not registered by '${pluginName}' in the active runtime scope.`
            )
        }
        const config = registration.component.config
        const provider = isObjectValue(config) ? readStringField(config, 'provider') : undefined
        if (provider !== input.provider) {
            throw new BadRequestException(
                `Runtime MCP provider '${provider ?? ''}' does not match registered provider '${input.provider}'.`
            )
        }

        const rootDir = resolveLoadedPluginResourceRoot(pluginName, this.loadedPlugins)
        const runtimeComponent: RuntimeComponent = {
            pluginName,
            pluginVersion: registration.pluginVersion,
            component: registration.component,
            rootDir
        }
        const previousInstallation = await this.findInstallation(
            null,
            null,
            null,
            pluginName,
            PLUGIN_COMPONENT_TYPE.TOOLSET,
            input.componentKey
        )
        const previousToolset = await this.findNativeToolset(runtimeComponent)
        const rollbackState = {
            previousInstallation: previousInstallation
                ? this.installationRepo.create({ ...previousInstallation })
                : null,
            previousToolset: previousToolset ? this.toolsetRepo.create({ ...previousToolset }) : null
        }
        try {
            const installation = await this.installRuntimeComponent(runtimeComponent, null, null, null, false)
            return {
                installation,
                ...rollbackState
            }
        } catch (error) {
            await this.rollbackInterruptedRuntimeProviderInstall(runtimeComponent, rollbackState)
            throw error
        }
    }

    async rollbackRegisteredRuntimeToolProviderInstallation(prepared: RegisteredRuntimeToolProviderInstallation) {
        if (prepared.previousInstallation) {
            await this.installationRepo.save(prepared.previousInstallation)
        } else if (prepared.installation.id) {
            await this.installationRepo.delete(prepared.installation.id)
        }

        if (prepared.previousToolset) {
            await this.toolsetRepo.save(prepared.previousToolset)
        } else if (prepared.installation.runtimeId) {
            await this.toolsetRepo.delete(prepared.installation.runtimeId)
        }
    }

    private async rollbackInterruptedRuntimeProviderInstall(
        runtimeComponent: RuntimeComponent,
        rollbackState: Omit<RegisteredRuntimeToolProviderInstallation, 'installation'>
    ) {
        try {
            const currentInstallation = await this.findInstallation(
                null,
                null,
                null,
                runtimeComponent.pluginName,
                PLUGIN_COMPONENT_TYPE.TOOLSET,
                runtimeComponent.component.componentKey
            )
            if (rollbackState.previousInstallation) {
                await this.installationRepo.save(rollbackState.previousInstallation)
            } else if (currentInstallation?.id) {
                await this.installationRepo.delete(currentInstallation.id)
            }
        } catch (error) {
            this.logger.error(`Failed to roll back an interrupted runtime Provider installation: ${safeMessage(error)}`)
        }

        try {
            const currentToolset = await this.findNativeToolset(runtimeComponent)
            if (rollbackState.previousToolset) {
                await this.toolsetRepo.save(rollbackState.previousToolset)
            } else if (currentToolset?.id) {
                await this.toolsetRepo.delete(currentToolset.id)
            }
        } catch (error) {
            this.logger.error(`Failed to roll back an interrupted runtime Provider Toolset: ${safeMessage(error)}`)
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
        const draft = ensureDraft(latestXpert)
        const installations: PluginResourceInstallation[] = []
        const pendingAuth: PluginResourceInstallation[] = []

        for (const runtimeComponent of runtimeComponents) {
            const targetAgentKey =
                runtimeComponent.targetAgentKey ?? defaultAgentKey ?? getPrimaryAgentKey(latestXpert, draft)
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
        const manifestComponents = readPluginResourceComponents(normalizedPluginName, rootDir)
        const runtimeComponents = listRuntimeToolProviderComponents(
            normalizedPluginName,
            this.toolProviderRegistry
        ).map(({ component }) => component)
        const runtimeKeys = new Set(runtimeComponents.map((component) => componentIdentity(component)))
        const components = [
            ...manifestComponents.filter((component) => !runtimeKeys.has(componentIdentity(component))),
            ...runtimeComponents
        ]
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

    /** Internal service entry for validated, administrator-installed portable components. */
    async installRuntimeComponent(
        runtimeComponent: RuntimeComponent,
        workspaceId: string | null,
        xpertId: string | null,
        agentKey: string | null = null,
        replaceNativeCapabilityCatalog = true
    ) {
        const runtimeType = this.resolveRuntimeType(runtimeComponent.component.componentType)
        const runtimeId = await this.ensureRuntime(
            runtimeComponent,
            workspaceId,
            xpertId,
            runtimeType,
            replaceNativeCapabilityCatalog
        )
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
                tenantId: RequestContext.getScope().tenantId,
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
        next.config = preserveManagedMcpConfig(config, installation?.config)
        next.enabled = true

        return this.installationRepo.save(next)
    }

    private async ensureRuntime(
        runtimeComponent: RuntimeComponent,
        workspaceId: string | null,
        xpertId: string | null,
        runtimeType: PluginResourceRuntimeType,
        replaceNativeCapabilityCatalog: boolean
    ) {
        if (runtimeComponent.component.componentType === PLUGIN_COMPONENT_TYPE.TOOLSET) {
            const toolset = await this.ensureNativeToolset(runtimeComponent, replaceNativeCapabilityCatalog)
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

    /** Bind existing, hash-matched resources to an in-memory task graph. Never installs or edits an Assistant. */
    async bindExistingRuntimeComponents(draft: TXpertTeamDraft, owner: IXpert, components: RuntimeComponent[]) {
        const installations: PluginResourceInstallation[] = []
        for (const component of components) {
            const target = component.targetAgentKey ?? draft.team.agent?.key
            if (
                !draft.nodes.some((node) => node.type === 'agent' && node.key === target) &&
                !(draft.team.agent?.key === target && draft.team.agent.options?.hidden)
            )
                throw new BadRequestException(t('server-ai:Error.TemplateRequirementsUnmet'))
            const installation = await this.findInstallation(
                owner.workspaceId,
                null,
                null,
                component.pluginName,
                component.component.componentType,
                component.component.componentKey
            )
            if (
                !installation?.enabled ||
                installation.definitionHash !== component.component.definitionHash ||
                installation.status !== PLUGIN_RESOURCE_INSTALLATION_STATUS.READY
            )
                throw new BadRequestException(
                    t('server-ai:Error.TemplateSubagentDependencyUnavailable', {
                        dependency: `${component.pluginName}/${component.component.componentKey}`,
                        status: installation?.enabled ? installation.status : 'unavailable'
                    })
                )
            const provider =
                component.component.componentType === 'skill'
                    ? SKILLS_MIDDLEWARE_NAME
                    : component.component.componentType === 'hook'
                      ? PLUGIN_HOOKS_MIDDLEWARE_NAME
                      : undefined
            if (provider && !findMiddlewareNode(draft, target, provider)) {
                // Reconstruction must generate identical node keys for checkpoint recovery.
                const key = `Middleware_${createHash('sha256')
                    .update(JSON.stringify([target, provider]))
                    .digest('hex')
                    .slice(0, 24)}`
                createMiddlewareNode(
                    draft,
                    target,
                    provider,
                    provider === SKILLS_MIDDLEWARE_NAME ? 'Skills Middleware' : 'Plugin Hooks',
                    -280,
                    key
                )
            }
            this.attachRuntimeComponent(draft, installation, component, target)
            installations.push(installation)
        }
        return installations
    }

    private attachRuntimeComponent(
        draft: TXpertTeamDraft,
        installation: PluginResourceInstallation,
        runtimeComponent: RuntimeComponent,
        agentKey: string
    ) {
        if (installation.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE && installation.runtimeId) {
            return ensureSkillsMiddlewareNode(draft, agentKey, installation.runtimeId)
        }

        if (installation.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.TOOLSET && installation.runtimeId) {
            ensureToolsetNode(draft, agentKey, installation.runtimeId, runtimeComponent)
            this.applyMcpApprovalPolicy(draft, runtimeComponent)
            return installation.runtimeId
        }

        if (installation.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.HOOK_PROFILE) {
            return ensurePluginHooksMiddlewareNode(draft, agentKey, runtimeComponent)
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
            await this.toolsetService.updateToolset(toolset.id, entity)
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

    private async findNativeToolset(runtimeComponent: RuntimeComponent) {
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
        const { tenantId, organizationId } = RequestContext.getScope()
        if (!tenantId) throw new BadRequestException('A tenant scope is required to manage plugin resources.')
        const candidates = await this.toolsetRepo.find({
            where: {
                tenantId,
                organizationId: organizationId ?? IsNull(),
                workspaceId: IsNull(),
                category: XpertToolsetCategoryEnum.BUILTIN,
                type: provider
            }
        })
        return (
            candidates.find((toolset) =>
                isPluginNativeToolset(toolset, runtimeComponent.pluginName, runtimeComponent.component.componentKey)
            ) ?? null
        )
    }

    private async ensureNativeToolset(runtimeComponent: RuntimeComponent, replaceCapabilityCatalog: boolean) {
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
        const current = await this.findNativeToolset(runtimeComponent)
        const name = readStringField(config, 'name') ?? `${runtimeComponent.component.componentKey} MCP Capabilities`
        const description =
            readStringField(config, 'description') ?? `Host-native MCP capabilities from ${runtimeComponent.pluginName}`
        // Bootstrap may refresh only an existing, scope-checked plugin-owned toolset.
        // Creating a new installation still uses the authenticated management path.
        if (!RequestContext.currentUserId()) {
            if (!current)
                throw new BadRequestException(
                    'The managed MCP toolset must be installed before background synchronization.'
                )
            const toolset = await this.toolsetRepo.save({
                ...current,
                name,
                description,
                options: {
                    ...current.options,
                    pluginManaged: true,
                    pluginName: runtimeComponent.pluginName,
                    componentKey: runtimeComponent.component.componentKey,
                    definitionHash: runtimeComponent.component.definitionHash
                }
            })
            if (replaceCapabilityCatalog) await this.capabilityCatalog.discoverAndReplaceMcpToolset(toolset.id)
            return toolset
        }
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
        if (replaceCapabilityCatalog) {
            await this.capabilityCatalog.discoverAndReplaceMcpToolset(toolset.id)
        }
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
            .andWhere(
                runtimeComponent.runtimeSource === 'agent-plugin'
                    ? "toolset.options ->> 'runtimeSource' = 'agent-plugin'"
                    : "toolset.options ->> 'pluginManaged' = 'true'"
            )
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

export type {
    PluginResourceInstallComponent,
    PluginResourceInstallResult,
    RegisteredRuntimeToolProviderInstallation,
    RuntimeComponent
} from './plugin-resource-installer.types'
export {
    buildPluginManagedMcpToolsetEntity,
    expandPluginRuntimeComponents,
    selectPluginResourceComponents
} from './plugin-resource-installer.utils'
