import {
    MCP_PROTOCOL_VERSION,
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_LEVEL,
    PLUGIN_RESOURCE_INSTALLATION_STATUS,
    type IPluginMcpServerActivationResult,
    type IPluginMcpServerConnectionInfo,
    type IPluginMcpServerCredentialResult,
    type JSONValue,
    type PluginLevel
} from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    OnApplicationBootstrap,
    OnModuleDestroy,
    OnModuleInit
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    GLOBAL_ORGANIZATION_SCOPE,
    StrategyBus,
    derivePluginArtifactNamespace,
    getDefaultTenantId,
    XPERT_TOOL_PROVIDER,
    XpertToolProviderRegistry,
    describeXpertToolProvider
} from '@xpert-ai/plugin-sdk'
import type { StrategySource } from '@xpert-ai/plugin-sdk'
import {
    LOADED_PLUGINS,
    LoadedPluginRecord,
    RequestContext,
    normalizePluginName,
    readPluginBundleManifest,
    resolveLoadedPluginBundleRoot
} from '@xpert-ai/server-core'
import type { Subscription } from 'rxjs'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import { McpApiKeyService } from '../mcp-publication/mcp-api-key.service'
import { McpCapabilityCatalogService } from '../mcp-publication/mcp-capability-catalog.service'
import { McpCapabilityCatalog } from '../mcp-publication/entities/mcp-capability-catalog.entity'
import { McpPublication } from '../mcp-publication/entities/mcp-publication.entity'
import { McpPublicationAccessService } from '../mcp-publication/mcp-publication-access.service'
import { McpCapabilityBindingInput } from '../mcp-publication/mcp-publication.dto'
import {
    mcpCapabilityProviderInstructions,
    mcpPublicationInstructions
} from '../mcp-publication/mcp-publication-runtime.service'
import { McpPublicationService } from '../mcp-publication/mcp-publication.service'
import { mcpPublicationPublicUrl } from '../mcp-publication/mcp-publication-url'
import { PluginResourceInstallation } from './plugin-resource-installation.entity'
import { applyPluginResourceOrganizationScope } from './plugin-resource-installation-scope'
import {
    PluginResourceInstallerService,
    RegisteredRuntimeToolProviderInstallation
} from './plugin-resource-installer.service'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'

type RuntimeProviderOwnership = {
    source: Extract<StrategySource, { kind: 'plugin' }>
    level: PluginLevel
    artifactNamespace: string
    provider: string
    componentKey: string
    tenantId: string
    organizationId: string | null
    slug: string
}

type ProviderManagementScope = Pick<RuntimeProviderOwnership, 'tenantId' | 'organizationId'>

type ManagedPublicationSnapshot = {
    publicationId: string
    created: boolean
    state: Pick<McpPublication, 'slug' | 'status' | 'reviewStatus' | 'reviewReason' | 'reviewedAt' | 'reviewedById'>
    bindings: McpCapabilityBindingInput[]
    catalog: McpCapabilityCatalog[]
}

type ProviderActivationRollback = {
    prepared: RegisteredRuntimeToolProviderInstallation
    publication?: ManagedPublicationSnapshot
    capabilitiesCommitted: boolean
}

/**
 * Runtime MCP definitions are trusted only after registry provenance checks.
 * Tenant/system plugins own one tenant Publication with organization access grants;
 * organization plugins own one Publication per organization. Activation preserves
 * the last valid catalog and endpoint until every managed resource can be committed.
 */
@Injectable()
export class PluginMcpServerService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(PluginMcpServerService.name)
    private subscription?: Subscription

    constructor(
        @InjectRepository(PluginResourceInstallation)
        private readonly installationRepo: Repository<PluginResourceInstallation>,
        private readonly installer: PluginResourceInstallerService,
        private readonly catalog: McpCapabilityCatalogService,
        private readonly publications: McpPublicationService,
        private readonly apiKeys: McpApiKeyService,
        private readonly publicationAccess: McpPublicationAccessService,
        private readonly configService: ConfigService,
        private readonly strategyBus: StrategyBus,
        private readonly toolProviders: XpertToolProviderRegistry,
        @Inject(LOADED_PLUGINS)
        private readonly loadedPlugins: LoadedPluginRecord[]
    ) {}

    onModuleInit() {
        this.subscription = this.strategyBus.events$.subscribe((event) => {
            if (event.type === 'REMOVE') {
                if (event.cause !== 'refresh') {
                    try {
                        const lifecycleScope = this.resolveLifecycleScope(event.pluginName, event.orgId)
                        queueMicrotask(
                            () => void this.disableInstalledServersForScope(event.pluginName, lifecycleScope)
                        )
                    } catch (error) {
                        this.logger.error(
                            `Failed to resolve MCP lifecycle scope for plugin '${event.pluginName}': ${safeErrorMessage(error)}`
                        )
                    }
                }
                return
            }
            if (event.strategyType !== XPERT_TOOL_PROVIDER) return
            const source = this.toolProviders.getSource(event.entry.instance)
            if (source.kind !== 'plugin') return
            let componentKey: string
            try {
                componentKey = describeXpertToolProvider(event.entry.instance as object).options.componentKey
            } catch {
                return
            }
            queueMicrotask(() => void this.synchronizeEnabled(source.pluginName, componentKey, source.scopeKey))
        })
    }

    onApplicationBootstrap() {
        // Decorated business Providers are expanded by their coordinator during
        // module initialization. Reconcile only after every module has finished
        // that phase so an already-enabled Publication receives the final split.
        this.synchronizeRegisteredProviders()
    }

    onModuleDestroy() {
        this.subscription?.unsubscribe()
    }

    /** Reconciles Providers registered during plugin bootstrap before the lifecycle subscription was attached. */
    private synchronizeRegisteredProviders() {
        const scheduled = new Set<string>()
        for (const registration of this.toolProviders.listAllRegistrations()) {
            const source = registration.source
            if (source.kind !== 'plugin') continue
            let componentKey: string
            try {
                componentKey = describeXpertToolProvider(registration.strategy as object).options.componentKey
            } catch {
                continue
            }
            const key = `${source.pluginName}:${componentKey}:${source.scopeKey}`
            if (scheduled.has(key)) continue
            scheduled.add(key)
            queueMicrotask(
                () => void this.synchronizeRegisteredProvider(source.pluginName, componentKey, source.scopeKey)
            )
        }
    }

    private async synchronizeRegisteredProvider(pluginName: string, componentKey: string, sourceScopeKey: string) {
        try {
            const query = this.installationRepo
                .createQueryBuilder('installation')
                .where('installation.pluginName = :pluginName', { pluginName: normalizePluginName(pluginName) })
                .andWhere('installation.componentType = :componentType', {
                    componentType: PLUGIN_COMPONENT_TYPE.TOOLSET
                })
                .andWhere('installation.componentKey = :componentKey', { componentKey })
                .andWhere('installation.workspaceId IS NULL')
                .andWhere('installation.xpertId IS NULL')
                .andWhere('installation.agentKey IS NULL')
            const installations = await query.getMany()
            for (const installation of installations) {
                if (!installation.tenantId) continue
                await this.synchronizeEnabled(pluginName, componentKey, sourceScopeKey, {
                    tenantId: installation.tenantId,
                    organizationId: installation.organizationId ?? null
                })
            }
        } catch (error) {
            this.logger.error(
                `Failed to enumerate managed MCP Servers for '${componentKey}' from plugin '${pluginName}': ${safeErrorMessage(error)}`
            )
        }
    }

    async enable(pluginName: string, componentKey: string): Promise<IPluginMcpServerActivationResult> {
        const ownership = this.resolveProviderOwnership(pluginName, componentKey)
        const requestingOrganizationId = RequestContext.getOrganizationId()
        const activated = await this.runInProviderScope(ownership, () => this.activateProvider(ownership))
        const accessOrganizationId =
            ownership.level === PLUGIN_LEVEL.ORGANIZATION ? ownership.organizationId : requestingOrganizationId
        let accessWasEnabled = false
        try {
            accessWasEnabled =
                ownership.level !== PLUGIN_LEVEL.ORGANIZATION && accessOrganizationId
                    ? await this.publicationAccess.isEnabled(
                          activated.publication.id,
                          activated.publication.tenantId,
                          accessOrganizationId
                      )
                    : false
            const connectionInfo = await this.runInProviderScope(ownership, () =>
                this.connectionInfoFor(activated.publication.id)
            )
            if (ownership.level !== PLUGIN_LEVEL.ORGANIZATION && accessOrganizationId) {
                await this.publicationAccess.enable(activated.publication, accessOrganizationId)
            }
            const activeKeys = accessOrganizationId
                ? await this.apiKeys.listForOrganization(activated.publication, accessOrganizationId)
                : await this.runInProviderScope(ownership, () => this.apiKeys.list(activated.publication.id))
            const clientScopes = activated.clientScopes
            const reusableKey = activeKeys.find(
                (key) =>
                    !key.revokedAt &&
                    (!key.expiresAt || new Date(key.expiresAt).getTime() > Date.now()) &&
                    hasMcpClientScopes(key.scopes, clientScopes)
            )
            const createdApiKey = reusableKey
                ? undefined
                : accessOrganizationId
                  ? await this.apiKeys.createRevealableForOrganization(activated.publication, accessOrganizationId, {
                        name: `${activated.name} MCP client`,
                        scopes: clientScopes
                    })
                  : await this.runInProviderScope(ownership, () =>
                        this.apiKeys.createRevealable(activated.publication.id, {
                            name: `${activated.name} MCP client`,
                            scopes: clientScopes
                        })
                    )
            await this.retireLegacyOrganizationPublicationSafely(ownership, requestingOrganizationId)
            return {
                installation: activated.installation,
                publication: activated.publication,
                connectionInfo,
                ...(createdApiKey ? { createdApiKey } : {})
            }
        } catch (error) {
            if (ownership.level !== PLUGIN_LEVEL.ORGANIZATION && accessOrganizationId && !accessWasEnabled) {
                await this.publicationAccess
                    .disable(activated.publication, accessOrganizationId)
                    .catch((rollbackError) => this.logRollbackFailure('organization access', rollbackError))
            }
            if (activated.restoreOnConsumerSetupFailure) {
                await this.runInProviderScope(ownership, () => this.rollbackActivation(activated.rollback))
            }
            throw error
        }
    }

    private async activateProvider(ownership: RuntimeProviderOwnership) {
        let rollback: ProviderActivationRollback | null = null
        try {
            const prepared = await this.installer.installRegisteredRuntimeToolProviderToOrganization({
                pluginName: ownership.source.pluginName,
                componentKey: ownership.componentKey,
                provider: ownership.provider,
                sourceScopeKey: ownership.source.scopeKey
            })
            const installation = prepared.installation
            if (!installation.runtimeId) {
                throw new BadRequestException(
                    `Plugin component '${ownership.componentKey}' did not create a native Toolset.`
                )
            }
            rollback = {
                prepared,
                capabilitiesCommitted: false
            }
            const catalogSnapshot = await this.catalog.getToolsetCapabilitySnapshot(installation.runtimeId)
            const capabilities = await this.catalog.discoverMcpToolsetCapabilities(installation.runtimeId)
            const publicationResolution = await this.resolvePublication(installation, ownership)
            const publication = publicationResolution.publication
            const publicationSnapshot: ManagedPublicationSnapshot = {
                publicationId: publication.id,
                created: publicationResolution.created,
                state: {
                    slug: publicationResolution.previousSlug,
                    status: publication.status,
                    reviewStatus: publication.reviewStatus,
                    reviewReason: publication.reviewReason,
                    reviewedAt: publication.reviewedAt,
                    reviewedById: publication.reviewedById
                },
                bindings: [],
                catalog: catalogSnapshot
            }
            rollback.publication = publicationSnapshot
            const managed = await this.publications.getManaged(publication.id, ['capabilities'])
            publicationSnapshot.bindings = (managed.capabilities ?? []).map(toCapabilityBindingInput)
            const previous = new Map(
                (managed.capabilities ?? []).map((binding) => [
                    `${binding.capabilityType}:${binding.capabilityKey}`,
                    binding
                ])
            )
            await this.publications.replaceCapabilitiesWithCatalog(
                publication.id,
                capabilities,
                capabilities.map((capability) => {
                    const current = previous.get(`${capability.capabilityType}:${capability.capabilityKey}`)
                    return {
                        toolsetId: capability.toolsetId,
                        capabilityType: capability.capabilityType,
                        capabilityKey: capability.capabilityKey,
                        publicName: current?.publicName ?? capability.capabilityKey,
                        enabled: current?.enabled ?? true,
                        policy: current?.policy ?? null
                    }
                })
            )
            rollback.capabilitiesCommitted = true
            const enabledPublication =
                publication.status === 'active' ? publication : await this.publications.enable(publication.id)
            installation.enabled = true
            installation.status = PLUGIN_RESOURCE_INSTALLATION_STATUS.READY
            installation.config = mergeInstallationConfig(installation.config, {
                publicationId: publication.id,
                protocolVersion: MCP_PROTOCOL_VERSION,
                artifactNamespace: ownership.artifactNamespace,
                provider: ownership.provider,
                pluginLevel: ownership.level,
                publicationScope: ownership.level === PLUGIN_LEVEL.ORGANIZATION ? 'organization' : 'tenant',
                syncError: null,
                syncFailedAt: null
            })
            const savedInstallation = await this.installationRepo.save(installation)
            return {
                installation: savedInstallation,
                publication: enabledPublication,
                name: readConfigString(installation.config, 'name') ?? ownership.componentKey,
                clientScopes: managedMcpClientScopes(capabilities),
                rollback,
                restoreOnConsumerSetupFailure:
                    !prepared.previousInstallation?.enabled || publicationSnapshot.state.status !== 'active'
            }
        } catch (error) {
            if (rollback) {
                await this.rollbackActivation(rollback)
                if (rollback.prepared.previousInstallation) {
                    const previousInstallation = rollback.prepared.previousInstallation
                    previousInstallation.config = mergeInstallationConfig(previousInstallation.config, {
                        syncError: safeErrorMessage(error),
                        syncFailedAt: new Date().toISOString()
                    })
                    await this.installationRepo
                        .save(previousInstallation)
                        .catch((rollbackError) => this.logRollbackFailure('installation sync status', rollbackError))
                }
            }
            throw error
        }
    }

    private async rollbackActivation(rollback: ProviderActivationRollback) {
        const publication = rollback.publication
        if (publication) {
            const toolsetId = rollback.prepared.installation.runtimeId
            if (rollback.capabilitiesCommitted && toolsetId) {
                await this.catalog
                    .restoreToolsetCapabilitySnapshot(toolsetId, publication.catalog)
                    .catch((error) => this.logRollbackFailure('capability catalog', error))
                if (!publication.created) {
                    await this.publications
                        .replaceCapabilities(publication.publicationId, publication.bindings)
                        .catch((error) => this.logRollbackFailure('Publication capabilities', error))
                }
            }
            if (publication.created) {
                await this.publications
                    .discardManaged(publication.publicationId)
                    .catch((error) => this.logRollbackFailure('created Publication', error))
            } else {
                await this.publications
                    .restoreManagedState(publication.publicationId, publication.state)
                    .catch((error) => this.logRollbackFailure('Publication state', error))
            }
        }
        await this.installer
            .rollbackRegisteredRuntimeToolProviderInstallation(rollback.prepared)
            .catch((error) => this.logRollbackFailure('runtime Toolset installation', error))
    }

    async disable(pluginName: string, componentKey: string) {
        const ownership = this.resolveProviderOwnership(pluginName, componentKey)
        const requestingOrganizationId = RequestContext.getOrganizationId()
        const resolved = await this.runInProviderScope(ownership, () =>
            this.requireProviderPublication(pluginName, componentKey)
        )
        if (ownership.level !== PLUGIN_LEVEL.ORGANIZATION && requestingOrganizationId) {
            await this.publicationAccess.disable(resolved.publication, requestingOrganizationId)
            return resolved.installation
        }
        return this.runInProviderScope(ownership, async () => {
            await this.publications.disable(resolved.publication.id)
            resolved.installation.enabled = false
            return this.installationRepo.save(resolved.installation)
        })
    }

    async connectionInfo(pluginName: string, componentKey: string) {
        const ownership = this.resolveProviderOwnership(pluginName, componentKey)
        const requestingOrganizationId = RequestContext.getOrganizationId()
        const resolved = await this.runInProviderScope(ownership, () =>
            this.requireProviderPublication(pluginName, componentKey)
        )
        if (ownership.level !== PLUGIN_LEVEL.ORGANIZATION && requestingOrganizationId) {
            await this.publicationAccess.assertEnabled(resolved.publication, requestingOrganizationId)
        }
        if (resolved.publication.status !== 'active') {
            throw new NotFoundException(`MCP Server '${componentKey}' has not been enabled.`)
        }
        return this.runInProviderScope(ownership, () => this.connectionInfoFor(resolved.publication.id))
    }

    async credential(pluginName: string, componentKey: string): Promise<IPluginMcpServerCredentialResult> {
        const ownership = this.resolveProviderOwnership(pluginName, componentKey)
        const requestingOrganizationId = RequestContext.getOrganizationId() ?? null
        const resolved = await this.runInProviderScope(ownership, () =>
            this.requireProviderPublication(pluginName, componentKey)
        )
        if (ownership.level !== PLUGIN_LEVEL.ORGANIZATION && requestingOrganizationId) {
            await this.publicationAccess.assertEnabled(resolved.publication, requestingOrganizationId)
        }
        if (resolved.publication.status !== 'active') {
            throw new NotFoundException(`MCP Server '${componentKey}' has not been enabled.`)
        }
        const organizationId =
            ownership.level === PLUGIN_LEVEL.ORGANIZATION ? ownership.organizationId : requestingOrganizationId
        const connectionInfo = await this.runInProviderScope(ownership, () =>
            this.connectionInfoFor(resolved.publication.id)
        )
        const clientScopes = await this.runInProviderScope(ownership, async () => {
            const publication = await this.publications.getManaged(resolved.publication.id, ['capabilities'])
            return managedMcpClientScopes(await this.publications.resolveRuntimeCapabilities(publication))
        })
        const credential = await this.apiKeys.getOrCreateRevealableCredential(resolved.publication, organizationId, {
            name: `${readConfigString(resolved.installation.config, 'name') ?? componentKey} MCP client`,
            scopes: clientScopes
        })
        return {
            connectionInfo,
            apiKey: credential.apiKey,
            secret: credential.secret
        }
    }

    async synchronizeEnabled(
        pluginName: string,
        componentKey: string,
        sourceScopeKey?: string,
        managementScope?: ProviderManagementScope
    ) {
        try {
            const ownership = this.resolveProviderOwnership(pluginName, componentKey, sourceScopeKey, managementScope)
            const installation = await this.runInProviderScope(ownership, () =>
                this.findInstallation(pluginName, componentKey)
            )
            const publicationId = readConfigString(installation?.config, 'publicationId')
            if (!installation || !publicationId) return
            if (!installation.enabled) {
                const publication = await this.runInProviderScope(ownership, () =>
                    this.publications.getManaged(publicationId)
                )
                // Tenant Publications may remain active while organizations toggle
                // independent access grants. Historical rows can therefore have a
                // false installation flag even though their shared endpoint must be
                // reconciled. A truly disabled Publication stays disabled.
                if (publication.status !== 'active') return
            }
            await this.runInProviderScope(ownership, () => this.activateProvider(ownership))
        } catch (error) {
            this.logger.error(
                `Failed to synchronize managed MCP Server '${componentKey}' from plugin '${pluginName}': ${safeErrorMessage(error)}`
            )
        }
    }

    async disableInstalledServers(pluginName: string, sourceScopeKey?: string) {
        try {
            const lifecycleScope = this.resolveLifecycleScope(pluginName, sourceScopeKey)
            await this.disableInstalledServersForScope(pluginName, lifecycleScope)
        } catch (error) {
            this.logger.error(
                `Failed to disable managed MCP Servers from plugin '${pluginName}': ${safeErrorMessage(error)}`
            )
        }
    }

    private async disableInstalledServersForScope(pluginName: string, lifecycleScope: RuntimeProviderOwnership) {
        const normalizedPluginName = normalizePluginName(pluginName)
        const query = this.installationRepo
            .createQueryBuilder('installation')
            .where('installation.pluginName = :pluginName', { pluginName: normalizedPluginName })
            .andWhere('installation.componentType = :componentType', {
                componentType: PLUGIN_COMPONENT_TYPE.TOOLSET
            })
            .andWhere('installation.workspaceId IS NULL')
            .andWhere('installation.xpertId IS NULL')
            .andWhere('installation.agentKey IS NULL')
            .andWhere('installation.tenantId = :tenantId', { tenantId: lifecycleScope.tenantId })
        if (lifecycleScope.level === PLUGIN_LEVEL.ORGANIZATION) {
            query.andWhere('installation.organizationId = :organizationId', {
                organizationId: lifecycleScope.organizationId
            })
        }
        const installations = await query.getMany()
        for (const installation of installations) {
            const publicationId = readConfigString(installation.config, 'publicationId')
            const installationScope = {
                ...lifecycleScope,
                organizationId: installation.organizationId ?? null
            }
            if (publicationId) {
                await this.runInProviderScope(installationScope, () => this.publications.disable(publicationId))
            }
            installation.enabled = false
            await this.installationRepo.save(installation)
        }
    }

    private async resolvePublication(
        installation: PluginResourceInstallation,
        ownership: RuntimeProviderOwnership
    ): Promise<{ publication: McpPublication; created: boolean; previousSlug: string }> {
        const publicationId = readConfigString(installation.config, 'publicationId')
        const componentKey = installation.componentKey
        const slug = ownership.slug
        if (publicationId) {
            const publication = await this.publications.getManaged(publicationId)
            const previousSlug = publication.slug
            return {
                publication:
                    publication.slug === slug
                        ? publication
                        : await this.publications.synchronizeManagedSlug(publication.id, slug),
                created: false,
                previousSlug
            }
        }
        const existing = await this.publications.findManagedBySlug(slug)
        if (existing) return { publication: existing, created: false, previousSlug: existing.slug }
        const publication = await this.publications.create({
            name: readConfigString(installation.config, 'name') ?? componentKey,
            slug,
            authMethods: ['api_key'],
            instructions: readConfigString(installation.config, 'instructions')
        })
        return { publication, created: true, previousSlug: publication.slug }
    }

    private async connectionInfoFor(publicationId: string): Promise<IPluginMcpServerConnectionInfo> {
        const publication = await this.publications.getManaged(publicationId, ['capabilities'])
        const capabilities = await this.publications.resolveRuntimeCapabilities(publication)
        return {
            protocolVersion: publication.protocolVersion,
            transport: 'streamable-http',
            endpoint: mcpPublicationPublicUrl(this.configService, `/api/mcp/p/${encodeURIComponent(publication.slug)}`),
            authorization: 'Bearer',
            serverInstructions: mcpPublicationInstructions(
                publication.instructions,
                mcpCapabilityProviderInstructions(capabilities)
            )
        }
    }

    private async requireInstallation(pluginName: string, componentKey: string) {
        const installation = await this.findInstallation(pluginName, componentKey)
        if (!installation) throw new NotFoundException(`MCP Server '${componentKey}' is not installed.`)
        return installation
    }

    private async requireProviderPublication(pluginName: string, componentKey: string) {
        const installation = await this.requireInstallation(pluginName, componentKey)
        const publicationId = readConfigString(installation.config, 'publicationId')
        if (!publicationId) throw new NotFoundException(`MCP Server '${componentKey}' has not been enabled.`)
        return {
            installation,
            publication: await this.publications.getManaged(publicationId)
        }
    }

    private async findInstallation(pluginName: string, componentKey: string) {
        const query = this.installationRepo
            .createQueryBuilder('installation')
            .where('installation.pluginName = :pluginName', { pluginName })
            .andWhere('installation.componentType = :componentType', {
                componentType: PLUGIN_COMPONENT_TYPE.TOOLSET
            })
            .andWhere('installation.componentKey = :componentKey', { componentKey })
            .andWhere('installation.workspaceId IS NULL')
            .andWhere('installation.xpertId IS NULL')
            .andWhere('installation.agentKey IS NULL')
        applyPluginResourceOrganizationScope(query, 'installation')
        return query.getOne()
    }

    private resolveProviderOwnership(
        pluginName: string,
        componentKey: string,
        sourceScopeKey?: string,
        managementScope?: ProviderManagementScope
    ): RuntimeProviderOwnership {
        const normalizedPluginName = normalizePluginName(pluginName)
        const registration = this.toolProviders
            .listRegistrations(sourceScopeKey ?? RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE)
            .find(({ strategy, source }) => {
                if (source.kind !== 'plugin' || normalizePluginName(source.pluginName) !== normalizedPluginName) {
                    return false
                }
                return describeXpertToolProvider(strategy as object).options.componentKey === componentKey
            })
        if (!registration || registration.source.kind !== 'plugin') {
            throw new BadRequestException(
                `Plugin component '${componentKey}' is not a registered runtime MCP provider from '${normalizedPluginName}'.`
            )
        }
        const descriptor = describeXpertToolProvider(registration.strategy as object)
        if (!descriptor.tools.some((tool) => !!tool.options.mcp)) {
            throw new BadRequestException(`Plugin component '${componentKey}' does not expose MCP Tools.`)
        }
        const loaded = this.findLoadedPlugin(normalizedPluginName, registration.source.scopeKey)
        const level = normalizePluginLevel(loaded.level ?? loaded.instance?.meta?.level)
        const tenantId =
            managementScope?.tenantId ?? loaded.tenantId ?? RequestContext.currentTenantId() ?? getDefaultTenantId()
        if (!tenantId) {
            throw new BadRequestException('A tenant scope is required to manage plugin MCP services.')
        }
        const organizationId =
            level === PLUGIN_LEVEL.ORGANIZATION
                ? (managementScope?.organizationId ?? loaded.organizationId ?? registration.source.scopeKey)
                : null
        if (level === PLUGIN_LEVEL.ORGANIZATION && isGlobalScopeKey(organizationId)) {
            throw new BadRequestException(`Organization plugin '${normalizedPluginName}' has no organization scope.`)
        }
        const artifactNamespace = resolveLoadedArtifactNamespace(loaded, normalizedPluginName)
        return {
            source: registration.source,
            level,
            artifactNamespace,
            provider: descriptor.options.provider,
            componentKey,
            tenantId,
            organizationId,
            slug: deriveManagedSlug(artifactNamespace, descriptor.options.provider, tenantId, organizationId)
        }
    }

    private resolveLifecycleScope(pluginName: string, sourceScopeKey?: string): RuntimeProviderOwnership {
        const normalizedPluginName = normalizePluginName(pluginName)
        const loaded = this.findLoadedPlugin(normalizedPluginName, sourceScopeKey)
        const level = normalizePluginLevel(loaded.level ?? loaded.instance?.meta?.level)
        const tenantId = loaded.tenantId ?? RequestContext.currentTenantId() ?? getDefaultTenantId()
        if (!tenantId) throw new BadRequestException('A tenant scope is required to manage plugin MCP services.')
        const organizationId =
            level === PLUGIN_LEVEL.ORGANIZATION ? (loaded.organizationId ?? sourceScopeKey ?? null) : null
        if (level === PLUGIN_LEVEL.ORGANIZATION && isGlobalScopeKey(organizationId)) {
            throw new BadRequestException(`Organization plugin '${normalizedPluginName}' has no organization scope.`)
        }
        return {
            source: {
                kind: 'plugin',
                pluginName: normalizedPluginName,
                pluginVersion: loaded.instance?.meta?.version,
                scopeKey: loaded.scopeKey ?? loaded.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
            },
            level,
            artifactNamespace: resolveLoadedArtifactNamespace(loaded, normalizedPluginName),
            provider: '',
            componentKey: '',
            tenantId,
            organizationId,
            slug: ''
        }
    }

    private findLoadedPlugin(pluginName: string, scopeKey?: string) {
        const candidates = this.loadedPlugins.filter((plugin) =>
            [plugin.name, plugin.packageName, plugin.instance?.meta?.name]
                .filter((value): value is string => typeof value === 'string')
                .some((value) => normalizePluginName(value) === pluginName)
        )
        const loaded =
            candidates.find((plugin) => (plugin.scopeKey ?? plugin.organizationId) === scopeKey) ?? candidates[0]
        if (!loaded) throw new NotFoundException(`Loaded plugin '${pluginName}' was not found.`)
        return loaded
    }

    private runInProviderScope<T>(ownership: RuntimeProviderOwnership, task: () => Promise<T>) {
        const current = RequestContext.getScope()
        if (current.tenantId === ownership.tenantId && (current.organizationId ?? null) === ownership.organizationId) {
            return task()
        }
        const request = RequestContext.currentRequest()
        const language = RequestContext.getLanguageCode()
        const requestId = readHeader(request?.headers, 'x-request-id')
        const context = captureRequestContext({
            user: RequestContext.currentUser(),
            tenantId: ownership.tenantId,
            organizationId: ownership.organizationId,
            language,
            headers: {
                ['x-scope-level']: ownership.organizationId ? 'organization' : 'tenant',
                ...(requestId ? { ['x-request-id']: requestId } : {})
            }
        })
        return runWithCapturedRequestContext(context, task)
    }

    private async retireLegacyOrganizationPublication(
        ownership: RuntimeProviderOwnership,
        requestingOrganizationId: string | null | undefined
    ) {
        if (ownership.level === PLUGIN_LEVEL.ORGANIZATION || !requestingOrganizationId) return
        const legacyInstallation = await this.findInstallation(ownership.source.pluginName, ownership.componentKey)
        const publicationId = readConfigString(legacyInstallation?.config, 'publicationId')
        const publicationScope = readConfigString(legacyInstallation?.config, 'publicationScope')
        if (!legacyInstallation || !publicationId || publicationScope === 'tenant') return
        try {
            await this.publications.disable(publicationId)
        } catch (error) {
            if (!(error instanceof NotFoundException)) throw error
            this.logger.warn(
                `Legacy organization MCP Publication '${publicationId}' no longer exists; continuing scope migration.`
            )
        }
        legacyInstallation.enabled = false
        await this.installationRepo.save(legacyInstallation)
    }

    private async retireLegacyOrganizationPublicationSafely(
        ownership: RuntimeProviderOwnership,
        requestingOrganizationId: string | null | undefined
    ) {
        try {
            await this.retireLegacyOrganizationPublication(ownership, requestingOrganizationId)
        } catch (error) {
            this.logger.warn(
                `Failed to retire a legacy organization MCP Publication for '${ownership.componentKey}': ${safeErrorMessage(error)}`
            )
        }
    }

    private logRollbackFailure(target: string, error: unknown) {
        this.logger.error(`Failed to restore ${target} after MCP activation error: ${safeErrorMessage(error)}`)
    }
}

function readConfigString(value: unknown, key: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const field = Reflect.get(value, key)
    return typeof field === 'string' && field ? field : undefined
}

function mergeInstallationConfig(value: JSONValue | null | undefined, fields: Record<string, JSONValue>): JSONValue {
    const base = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : []
    return { ...Object.fromEntries(base), ...fields }
}

function deriveManagedSlug(
    artifactNamespace: string,
    provider: string,
    tenantId: string,
    organizationId: string | null
) {
    const base = `${artifactNamespace}-${provider}`.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const scopeKind = organizationId ? 'o' : 't'
    const scopeHash = createHash('sha256')
        .update(`${tenantId}\0${organizationId ?? 'tenant'}`)
        .digest('hex')
        .slice(0, 12)
    return `${base.slice(0, 176)}-${scopeKind}-${scopeHash}`
}

function normalizeArtifactNamespace(value: unknown) {
    return typeof value === 'string' && /^[a-z0-9_]+$/.test(value) ? value : null
}

function resolveLoadedArtifactNamespace(loaded: LoadedPluginRecord, pluginName: string) {
    const metadataNamespace = normalizeArtifactNamespace(loaded.instance?.meta?.artifactNamespace)
    if (metadataNamespace) return metadataNamespace
    const bundleRoot = resolveLoadedPluginBundleRoot(loaded)
    const manifestNamespace = bundleRoot
        ? normalizeArtifactNamespace(readPluginBundleManifest(bundleRoot)?.manifest.artifactNamespace)
        : null
    return manifestNamespace ?? derivePluginArtifactNamespace(loaded.packageName ?? pluginName)
}

function normalizePluginLevel(value: unknown): PluginLevel {
    if (value === PLUGIN_LEVEL.SYSTEM || value === PLUGIN_LEVEL.TENANT) return value
    return PLUGIN_LEVEL.ORGANIZATION
}

function isGlobalScopeKey(value: string | null) {
    return !value || value === GLOBAL_ORGANIZATION_SCOPE || value.endsWith(':global')
}

function readHeader(headers: unknown, key: string) {
    if (!headers || typeof headers !== 'object') return undefined
    const value = Reflect.get(headers, key)
    if (typeof value === 'string') return value
    return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : undefined
}

function safeErrorMessage(error: unknown) {
    return (error instanceof Error ? error.message : String(error)).slice(0, 500)
}

function managedMcpClientScopes(capabilities: readonly { capabilityType: string }[]) {
    const scopes = ['tools:list', 'tools:call']
    // MCP App HTML is fetched through the same authenticated MCP Publication.
    // Add Resource permissions only when this Provider actually publishes an App.
    if (capabilities.some(({ capabilityType }) => capabilityType === 'app')) {
        scopes.push('resources:list', 'resources:read')
    }
    return scopes
}

function hasMcpClientScopes(scopes: readonly string[], required: readonly string[]) {
    return scopes.length === required.length && required.every((scope) => scopes.includes(scope))
}

function toCapabilityBindingInput(
    binding: Pick<
        McpCapabilityBindingInput,
        'toolsetId' | 'capabilityType' | 'capabilityKey' | 'publicName' | 'enabled' | 'policy'
    >
): McpCapabilityBindingInput {
    return {
        toolsetId: binding.toolsetId,
        capabilityType: binding.capabilityType,
        capabilityKey: binding.capabilityKey,
        publicName: binding.publicName,
        enabled: binding.enabled,
        policy: binding.policy
    }
}
