import {
    AiModelTypeEnum,
    IPluginApplicationInstallation,
    KnowledgeGraphStatus,
    KnowledgebasePermission,
    KnowledgebaseTypeEnum,
    LanguagesEnum,
    ModelFeature,
    PLUGIN_APPLICATION_INSTALLATION_STATUS,
    PLUGIN_APPLICATION_SCOPE,
    PluginApplicationDetail,
    PluginApplicationInitializeInput,
    PluginApplicationModelOption,
    PluginApplicationPreflight,
    PluginApplicationStatusSummary,
    PluginMarketplaceContribution,
    PluginTemplateApplicationSummary,
    RolesEnum,
    resolveI18nText
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { LOADED_PLUGINS, LoadedPluginRecord, RequestContext, normalizePluginName } from '@xpert-ai/server-core'
import { GLOBAL_ORGANIZATION_SCOPE, SYSTEM_GLOBAL_SCOPE, resolveTenantGlobalScopeKey } from '@xpert-ai/plugin-sdk'
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
    Optional
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, LessThan, Repository } from 'typeorm'
import { CopilotWithProviderDto } from '../copilot/dto'
import { FindCopilotModelsQuery } from '../copilot/queries'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase/knowledgebase.service'
import { Xpert } from '../xpert/xpert.entity'
import { XpertService } from '../xpert/xpert.service'
import { PluginTemplateInstallCommand } from './commands/install-template.command'
import { PluginApplicationInstallation } from './plugin-application-installation.entity'
import { PluginResourceInstallResult } from './plugin-resource-installer.service'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { XpertWorkspaceService } from '../xpert-workspace/workspace.service'
import { resolvePluginApplicationConfigAssets } from './plugin-application-assets'

/** Trusted App definition paired with the exact plugin template/version to install. */
type ResolvedApplication = {
    application: PluginTemplateApplicationSummary
    pluginVersion: string | null
    templateId: string
    templateVersion: string | null
}

/** Server-authorized model option plus the persisted Knowledge model binding. */
type ResolvedModel = {
    option: PluginApplicationModelOption
    config: {
        copilotId: string
        model: string
        modelType: AiModelTypeEnum
    }
}

/** Result of acquiring (or observing) the per-scope installation row. */
type InstallationClaim = {
    installation: PluginApplicationInstallation
    claimed: boolean
}

const ORGANIZATION_INITIALIZER_ROLES = new Set<RolesEnum>([RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN, RolesEnum.TRIAL])

/**
 * Executes the generic, host-owned lifecycle for trusted plugin applications.
 *
 * Invariants:
 * - application definitions are resolved only from already loaded plugins;
 * - tenant and organization scope always come from RequestContext;
 * - one installation row is the concurrency claim for one App and scope;
 * - created resource IDs are persisted before the next initialization stage.
 */
@Injectable()
export class PluginApplicationService {
    constructor(
        @InjectRepository(PluginApplicationInstallation)
        private readonly installationRepo: Repository<PluginApplicationInstallation>,
        @InjectRepository(XpertWorkspace)
        private readonly workspaceRepo: Repository<XpertWorkspace>,
        @InjectRepository(Knowledgebase)
        private readonly knowledgebaseRepo: Repository<Knowledgebase>,
        @InjectRepository(Xpert)
        private readonly xpertRepo: Repository<Xpert>,
        private readonly workspaceService: XpertWorkspaceService,
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly xpertService: XpertService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        @Optional()
        @Inject(LOADED_PLUGINS)
        private readonly loadedPlugins: LoadedPluginRecord[] = []
    ) {}

    /** Returns trusted presentation metadata plus scoped health and initialization preflight. */
    async getDetail(pluginName: string, appName: string): Promise<PluginApplicationDetail> {
        const resolved = this.resolveApplication(pluginName, appName)
        return {
            application: resolved.application,
            status: await this.getStatusForApplication(resolved.application),
            preflight: await this.getPreflightForApplication(resolved.application)
        }
    }

    /** Returns card-sized installation state for every App exposed by effective loaded plugins. */
    async getStatuses(): Promise<PluginApplicationStatusSummary[]> {
        return Promise.all(
            this.loadedApplications().map(({ application }) => this.getStatusForApplication(application))
        )
    }

    /**
     * Initializes or repairs an application in the current organization.
     * A healthy existing installation is returned before model validation so
     * an idempotent retry does not depend on models that may later be disabled.
     */
    async initialize(input: PluginApplicationInitializeInput): Promise<PluginApplicationStatusSummary> {
        const resolved = this.resolveApplication(input.pluginName, input.appName)
        const application = resolved.application
        const operationId = input.operationId?.trim()
        if (!operationId) {
            throw new BadRequestException('operationId is required')
        }

        const access = this.initializationAccess(application)
        if (access === 'unsupported') {
            throw new BadRequestException('scope_not_supported')
        }
        if (access === 'organization_required') {
            throw new BadRequestException('organization_scope_required')
        }
        if (access === 'role_required') {
            throw new ForbiddenException('role_required')
        }

        const existing = await this.findCurrentInstallation(application)
        if (existing?.status === PLUGIN_APPLICATION_INSTALLATION_STATUS.READY) {
            const healthy = await this.refreshHealth(existing)
            if (healthy.status === PLUGIN_APPLICATION_INSTALLATION_STATUS.READY) {
                return this.toStatus(healthy)
            }
        }

        const preflight = await this.getPreflightForApplication(application)
        if (!preflight.supported) {
            throw new BadRequestException(preflight.reason ?? 'scope_not_supported')
        }
        if (!preflight.canInitialize) {
            if (preflight.reason === 'role_required') {
                throw new ForbiddenException(preflight.reason)
            }
            throw new BadRequestException(preflight.reason ?? 'application_preflight_failed')
        }

        const requirements = application.config.modelRequirements ?? {}
        const embeddingModel = requirements.embedding
            ? await this.resolveRequiredModel(input.embeddingModelId, AiModelTypeEnum.TEXT_EMBEDDING)
            : null
        const visionModel = requirements.vision
            ? await this.resolveRequiredModel(input.visionModelId, AiModelTypeEnum.LLM, ModelFeature.VISION)
            : null
        const claim = await this.claimInstallation(resolved, operationId)
        const installation = claim.installation

        if (installation.status === PLUGIN_APPLICATION_INSTALLATION_STATUS.READY) {
            if (!installation.templateVersion && resolved.templateVersion) {
                installation.templateVersion = resolved.templateVersion
                await this.installationRepo.save(installation)
            }
            return this.toStatus(await this.refreshHealth(installation))
        }
        if (!claim.claimed) {
            return this.toStatus(installation)
        }

        let createdWorkspaceId: string | null = null
        const createdKnowledgebaseIds: string[] = []
        let createdXpertId: string | null = null
        /** Preserve pre-existing repair state; rollback must remove only resources created by this attempt. */
        const previousResourceState = {
            workspaceId: installation.workspaceId,
            knowledgebaseIds: installation.knowledgebaseIds
                ? [...installation.knowledgebaseIds]
                : installation.knowledgebaseIds,
            xpertId: installation.xpertId,
            resourceRefs: installation.resourceRefs ? { ...installation.resourceRefs } : installation.resourceRefs
        }
        try {
            const workspace = installation.workspaceId
                ? await this.workspaceRepo.findOne({ where: { id: installation.workspaceId } })
                : null
            const ensuredWorkspace =
                workspace ??
                (await this.workspaceService.create({
                    name: this.localized(
                        application.config.workspace.name,
                        `${this.localized(application.displayName, 'Application')} Workspace`
                    ),
                    description: this.localized(application.config.workspace.description, ''),
                    status: 'active',
                    ownerId: RequestContext.currentUserId(),
                    settings: {
                        access: { visibility: 'organization-shared' },
                        system: {
                            kind: 'plugin-app',
                            pluginName: application.pluginName,
                            appName: application.appName
                        }
                    }
                }))
            const workspaceId = this.requireResourceId(ensuredWorkspace.id, 'workspace')
            if (!workspace) {
                createdWorkspaceId = workspaceId
            }
            installation.workspaceId = workspaceId
            await this.installationRepo.save(installation)

            const knowledgebases: Knowledgebase[] = []
            for (const [index, knowledgebaseConfig] of (application.config.knowledgebases ?? []).entries()) {
                let knowledgebase = installation.knowledgebaseIds?.[index]
                    ? await this.knowledgebaseRepo.findOne({ where: { id: installation.knowledgebaseIds[index] } })
                    : null
                if (!knowledgebase) {
                    knowledgebase = await this.knowledgebaseService.create({
                        name: await this.uniqueKnowledgebaseName(
                            this.localized(knowledgebaseConfig.name, 'Application Knowledge')
                        ),
                        description: this.localized(knowledgebaseConfig.description, ''),
                        workspaceId,
                        type: KnowledgebaseTypeEnum.Standard,
                        permission: KnowledgebasePermission.Organization,
                        applicationTags: knowledgebaseConfig.applicationTags ?? [],
                        ...(embeddingModel ? { copilotModel: embeddingModel.config } : {}),
                        ...(visionModel ? { visionModel: visionModel.config } : {}),
                        graphRag: knowledgebaseConfig.graphRag ?? { enabled: false },
                        ...(!knowledgebaseConfig.graphRag?.enabled
                            ? { graphStatus: KnowledgeGraphStatus.DISABLED }
                            : {})
                    })
                    createdKnowledgebaseIds.push(this.requireResourceId(knowledgebase.id, 'knowledgebase'))
                }
                knowledgebases.push(knowledgebase)
                /** Persist each resource before creating the next one so stale retries can resume by ID. */
                installation.knowledgebaseIds = knowledgebases.map(({ id }) => id)
                await this.installationRepo.save(installation)
            }

            /** Repair missing resources without duplicating a healthy Assistant from the previous attempt. */
            const existingXpert = installation.xpertId
                ? await this.xpertRepo.findOne({
                      where: {
                          id: installation.xpertId,
                          latest: true,
                          tenantId: installation.tenantId,
                          organizationId: installation.organizationId
                      }
                  })
                : null
            let xpertId = existingXpert?.id
            let xpertSlug = existingXpert?.slug ?? null
            if (!xpertId) {
                const assistantName = await this.uniqueAssistantName(application.appName, installation.organizationId)
                const result = await this.commandBus.execute<PluginTemplateInstallCommand, PluginResourceInstallResult>(
                    new PluginTemplateInstallCommand(
                        resolved.templateId,
                        workspaceId,
                        this.requestLanguage(),
                        {
                            name: assistantName,
                            title: this.localized(application.displayName, 'Application')
                        },
                        true
                    )
                )
                if (!result?.xpert?.id) {
                    throw new Error('App Assistant template installation returned no Xpert')
                }
                xpertId = result.xpert.id
                xpertSlug = result.xpert.slug ?? null
                createdXpertId = xpertId
            }

            installation.xpertId = xpertId
            installation.status = PLUGIN_APPLICATION_INSTALLATION_STATUS.READY
            installation.errorCode = null
            installation.errorMessage = null
            installation.resourceRefs = {
                workspace: workspaceId,
                assistant: xpertId,
                ...Object.fromEntries(
                    (application.config.knowledgebases ?? []).flatMap((config, index) =>
                        knowledgebases[index]?.id ? [[`knowledgebase:${config.key}`, knowledgebases[index].id]] : []
                    )
                )
            }
            await this.installationRepo.save(installation)
            return this.toStatus(installation, xpertSlug)
        } catch (error) {
            await this.compensate(createdWorkspaceId, createdKnowledgebaseIds, createdXpertId)
            installation.workspaceId = previousResourceState.workspaceId
            installation.knowledgebaseIds = previousResourceState.knowledgebaseIds
            installation.xpertId = previousResourceState.xpertId
            installation.resourceRefs = previousResourceState.resourceRefs
            installation.status = PLUGIN_APPLICATION_INSTALLATION_STATUS.FAILED
            installation.errorCode = 'initialization_failed'
            installation.errorMessage = getErrorMessage(error)
            await this.installationRepo.save(installation)
            throw error
        }
    }

    /** Resolves an App only from the process-local trusted plugin registry. */
    private resolveApplication(pluginNameInput: string, appNameInput: string): ResolvedApplication {
        const pluginName = normalizePluginName(pluginNameInput)
        const appName = appNameInput?.trim()
        const resolved = this.loadedApplications().find(
            ({ application }) => application.pluginName === pluginName && application.appName === appName
        )
        if (!resolved) {
            throw new NotFoundException('Loaded plugin App configuration was not found')
        }
        return resolved
    }

    /**
     * Materializes application contributions from loaded plugin metadata.
     * Duplicate declarations within one plugin are collapsed by stable App ID;
     * no marketplace response or localized text participates in resolution.
     */
    private loadedApplications(): ResolvedApplication[] {
        const applications = new Map<string, ResolvedApplication>()
        for (const plugin of this.effectiveLoadedPlugins()) {
            const meta = plugin.instance?.meta
            const pluginName = normalizePluginName(plugin.packageName ?? plugin.name ?? meta?.name ?? '')
            if (!meta || !pluginName) continue
            const metadataEntries = Object.values(meta.targetAppMeta ?? {}) as Array<{
                marketplace?: { contents?: PluginMarketplaceContribution[] }
            }>
            const contributions = metadataEntries.flatMap((metadata) =>
                Array.isArray(metadata?.marketplace?.contents) ? metadata.marketplace.contents : []
            )
            for (const app of contributions) {
                if (app.type !== 'app' || !app.name?.trim() || !app.appConfig) continue
                const id = `${pluginName}:${app.name}`
                if (applications.has(id)) continue
                const appConfig = resolvePluginApplicationConfigAssets(plugin, app.appConfig)
                applications.set(id, {
                    application: {
                        id,
                        pluginName,
                        appName: app.name,
                        displayName: app.displayName ?? app.name,
                        description: app.description,
                        icon: app.icon ?? meta.icon,
                        color: app.color,
                        scope: appConfig.scope,
                        assistantTemplateKey: appConfig.assistantTemplateKey,
                        config: appConfig
                    },
                    pluginVersion: meta.version ?? null,
                    templateId: `${pluginName}:${app.appConfig.assistantTemplateKey}`,
                    templateVersion: meta.version ?? null
                })
            }
        }
        return [...applications.values()]
    }

    /**
     * Selects the latest loaded record visible to the current request scope.
     * Process-global plugin registration must not make another tenant or
     * organization's application contribution discoverable or executable.
     */
    private effectiveLoadedPlugins(): LoadedPluginRecord[] {
        const organizationId = RequestContext.getOrganizationId() ?? GLOBAL_ORGANIZATION_SCOPE
        const tenantId = RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
        const organizationScopeKey =
            organizationId === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : organizationId
        const tenantScopeKey = resolveTenantGlobalScopeKey(tenantId)
        const seen = new Set<string>()

        return [...this.loadedPlugins]
            .filter((plugin) => {
                const scopeKey = plugin.scopeKey ?? plugin.organizationId
                return (
                    scopeKey === organizationScopeKey ||
                    (organizationId !== GLOBAL_ORGANIZATION_SCOPE && scopeKey === tenantScopeKey) ||
                    scopeKey === SYSTEM_GLOBAL_SCOPE
                )
            })
            .reverse()
            .filter((plugin) => {
                const key = normalizePluginName(plugin.packageName ?? plugin.name ?? plugin.instance?.meta?.name ?? '')
                if (!key || seen.has(key)) {
                    return false
                }
                seen.add(key)
                return true
            })
            .reverse()
    }

    /** Computes role, scope, and organization-visible model prerequisites. */
    private async getPreflightForApplication(
        application: PluginTemplateApplicationSummary
    ): Promise<PluginApplicationPreflight> {
        const organizationId = RequestContext.getOrganizationId()
        const modelRequirements = application.config.modelRequirements ?? {}
        const role = RequestContext.currentUser()?.role?.name as RolesEnum | undefined
        const supported = application.scope === PLUGIN_APPLICATION_SCOPE.ORGANIZATION
        let reason: PluginApplicationPreflight['reason']
        if (!supported) reason = 'scope_not_supported'
        else if (!organizationId) reason = 'organization_scope_required'
        else if (!role || !ORGANIZATION_INITIALIZER_ROLES.has(role)) reason = 'role_required'

        /** Do not enumerate organization model IDs for callers who cannot initialize the App. */
        if (reason) {
            return {
                supported,
                scope: application.scope,
                canInitialize: false,
                reason,
                embeddingModels: [],
                visionModels: [],
                primaryModelAvailable: !modelRequirements.primary,
                modelRequirements
            }
        }

        const [embeddingModels, visionModels, primaryModels] = await Promise.all([
            modelRequirements.embedding ? this.modelOptions(AiModelTypeEnum.TEXT_EMBEDDING) : Promise.resolve([]),
            modelRequirements.vision
                ? this.modelOptions(AiModelTypeEnum.LLM, ModelFeature.VISION)
                : Promise.resolve([]),
            modelRequirements.primary ? this.modelOptions(AiModelTypeEnum.LLM) : Promise.resolve([])
        ])
        const primaryModelAvailable = !modelRequirements.primary || primaryModels.length > 0
        if (modelRequirements.primary && !primaryModelAvailable) reason = 'primary_model_required'
        else if (modelRequirements.embedding && !embeddingModels.length) reason = 'embedding_model_required'
        else if (modelRequirements.vision && !visionModels.length) reason = 'vision_model_required'
        return {
            supported,
            scope: application.scope,
            canInitialize: !reason,
            ...(reason ? { reason } : {}),
            embeddingModels,
            visionModels,
            primaryModelAvailable,
            modelRequirements
        }
    }

    private async getStatusForApplication(
        application: PluginTemplateApplicationSummary
    ): Promise<PluginApplicationStatusSummary> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !organizationId || application.scope !== PLUGIN_APPLICATION_SCOPE.ORGANIZATION) {
            return {
                appId: application.id,
                status: 'not_installed',
                initializationAccess: this.initializationAccess(application)
            }
        }
        const installation = await this.findCurrentInstallation(application)
        return installation
            ? this.toStatus(await this.refreshHealth(installation))
            : {
                  appId: application.id,
                  status: 'not_installed',
                  initializationAccess: this.initializationAccess(application)
              }
    }

    /**
     * Atomically claims the single installation row for this App and scope.
     * Failed/degraded rows are repairable, and an initializing row becomes
     * reclaimable after five minutes so a crashed process cannot deadlock it.
     */
    private async claimInstallation(resolved: ResolvedApplication, operationId: string): Promise<InstallationClaim> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !organizationId) {
            throw new BadRequestException('organization_scope_required')
        }
        let installation = await this.findCurrentInstallation(resolved.application)
        let claimed = false
        if (!installation) {
            try {
                installation = await this.installationRepo.save(
                    this.installationRepo.create({
                        tenantId,
                        organizationId,
                        createdById: RequestContext.currentUserId(),
                        updatedById: RequestContext.currentUserId(),
                        pluginName: resolved.application.pluginName,
                        appName: resolved.application.appName,
                        declaredScope: resolved.application.scope,
                        scopeKey: organizationId,
                        status: PLUGIN_APPLICATION_INSTALLATION_STATUS.INITIALIZING,
                        pluginVersion: resolved.pluginVersion,
                        templateId: resolved.templateId,
                        templateVersion: resolved.templateVersion,
                        operationId
                    })
                )
                claimed = true
            } catch {
                installation = await this.installationRepo.findOne({
                    where: {
                        tenantId,
                        organizationId,
                        pluginName: resolved.application.pluginName,
                        appName: resolved.application.appName,
                        scopeKey: organizationId
                    }
                })
            }
        }
        if (!installation) {
            throw new ConflictException('application_installation_conflict')
        }
        if (
            installation.status === PLUGIN_APPLICATION_INSTALLATION_STATUS.FAILED ||
            installation.status === PLUGIN_APPLICATION_INSTALLATION_STATUS.DEGRADED
        ) {
            const result = await this.installationRepo.update(
                {
                    id: installation.id,
                    status: In([
                        PLUGIN_APPLICATION_INSTALLATION_STATUS.FAILED,
                        PLUGIN_APPLICATION_INSTALLATION_STATUS.DEGRADED
                    ])
                },
                {
                    status: PLUGIN_APPLICATION_INSTALLATION_STATUS.INITIALIZING,
                    operationId,
                    pluginVersion: resolved.pluginVersion,
                    templateId: resolved.templateId,
                    templateVersion: resolved.templateVersion,
                    errorCode: null,
                    errorMessage: null
                }
            )
            claimed = result.affected === 1
        } else if (
            installation.status === PLUGIN_APPLICATION_INSTALLATION_STATUS.INITIALIZING &&
            installation.updatedAt &&
            new Date(installation.updatedAt).getTime() < Date.now() - 5 * 60_000
        ) {
            const result = await this.installationRepo.update(
                {
                    id: installation.id,
                    status: PLUGIN_APPLICATION_INSTALLATION_STATUS.INITIALIZING,
                    updatedAt: LessThan(new Date(Date.now() - 5 * 60_000))
                },
                { operationId, errorCode: null, errorMessage: null }
            )
            claimed = result.affected === 1
        }
        if (!claimed) {
            const current = await this.installationRepo.findOne({ where: { id: installation.id } })
            return { installation: current ?? installation, claimed: false }
        }
        const current = await this.installationRepo.findOne({ where: { id: installation.id } })
        return { installation: current ?? installation, claimed: true }
    }

    /**
     * Verifies every managed resource using persisted scoped IDs.
     * Missing plugin definitions or resources transition a ready installation
     * to `degraded`; health checks never rediscover resources by name.
     */
    private async refreshHealth(installation: PluginApplicationInstallation): Promise<PluginApplicationInstallation> {
        if (installation.status !== PLUGIN_APPLICATION_INSTALLATION_STATUS.READY) {
            return installation
        }
        let expectedKnowledgebaseCount = installation.knowledgebaseIds?.length ?? 0
        try {
            expectedKnowledgebaseCount =
                this.resolveApplication(installation.pluginName, installation.appName).application.config.knowledgebases
                    ?.length ?? 0
        } catch {
            installation.status = PLUGIN_APPLICATION_INSTALLATION_STATUS.DEGRADED
            installation.errorCode = 'application_definition_missing'
            installation.errorMessage = 'The trusted plugin App definition is no longer available.'
            return this.installationRepo.save(installation)
        }
        const [workspaceExists, xpertExists, knowledgebaseExists] = await Promise.all([
            installation.workspaceId
                ? this.workspaceRepo.exists({
                      where: {
                          id: installation.workspaceId,
                          tenantId: installation.tenantId,
                          organizationId: installation.organizationId
                      }
                  })
                : Promise.resolve(false),
            installation.xpertId
                ? this.xpertRepo.exists({
                      where: {
                          id: installation.xpertId,
                          latest: true,
                          tenantId: installation.tenantId,
                          organizationId: installation.organizationId
                      }
                  })
                : Promise.resolve(false),
            expectedKnowledgebaseCount === 0
                ? Promise.resolve(true)
                : Promise.all(
                      (installation.knowledgebaseIds ?? []).map((id) =>
                          this.knowledgebaseRepo.exists({
                              where: {
                                  id,
                                  tenantId: installation.tenantId,
                                  organizationId: installation.organizationId
                              }
                          })
                      )
                  ).then(
                      (results) => results.length === expectedKnowledgebaseCount && results.every((exists) => exists)
                  )
        ])
        if (!workspaceExists || !xpertExists || !knowledgebaseExists) {
            installation.status = PLUGIN_APPLICATION_INSTALLATION_STATUS.DEGRADED
            installation.errorCode = 'resource_missing'
            installation.errorMessage = 'One or more initialized App resources are missing.'
            return this.installationRepo.save(installation)
        }
        return installation
    }

    private async toStatus(
        installation: IPluginApplicationInstallation,
        resolvedSlug?: string | null
    ): Promise<PluginApplicationStatusSummary> {
        const xpert =
            resolvedSlug === undefined && installation.xpertId
                ? await this.xpertRepo.findOne({ where: { id: installation.xpertId, latest: true } })
                : null
        return {
            appId: `${installation.pluginName}:${installation.appName}`,
            status: installation.status,
            initializationAccess: this.initializationAccess({ scope: installation.declaredScope }),
            installationId: installation.id,
            workspaceId: installation.workspaceId,
            xpertId: installation.xpertId,
            assistantSlug: resolvedSlug === undefined ? (xpert?.slug ?? null) : resolvedSlug,
            errorCode: installation.errorCode,
            errorMessage: installation.errorMessage
        }
    }

    private initializationAccess(application: Pick<PluginTemplateApplicationSummary, 'scope'>) {
        if (application.scope !== PLUGIN_APPLICATION_SCOPE.ORGANIZATION) return 'unsupported' as const
        if (!RequestContext.getOrganizationId()) return 'organization_required' as const
        const role = RequestContext.currentUser()?.role?.name as RolesEnum | undefined
        return role && ORGANIZATION_INITIALIZER_ROLES.has(role) ? ('allowed' as const) : ('role_required' as const)
    }

    /** Returns only models visible through the current request's governed model query. */
    private async modelOptions(
        modelType: AiModelTypeEnum,
        requiredFeature?: ModelFeature
    ): Promise<PluginApplicationModelOption[]> {
        const copilots = await this.queryBus.execute<FindCopilotModelsQuery, CopilotWithProviderDto[]>(
            new FindCopilotModelsQuery(modelType)
        )
        return copilots.flatMap((copilot) =>
            copilot.providerWithModels.models
                .filter((model) => !requiredFeature || model.features?.includes(requiredFeature))
                .map((model) => ({
                    id: this.modelOptionId(copilot.id, model.model),
                    copilotId: copilot.id,
                    model: model.model,
                    label: model.label,
                    modelType: model.model_type
                }))
        )
    }

    private async resolveRequiredModel(
        id: string | undefined,
        modelType: AiModelTypeEnum,
        requiredFeature?: ModelFeature
    ): Promise<ResolvedModel> {
        const option = id ? (await this.modelOptions(modelType, requiredFeature)).find((item) => item.id === id) : null
        if (!option) {
            throw new BadRequestException(requiredFeature ? 'invalid_vision_model' : 'invalid_embedding_model')
        }
        return {
            option,
            config: { copilotId: option.copilotId, model: option.model, modelType }
        }
    }

    private modelOptionId(copilotId: string, model: string) {
        return `${copilotId}/${encodeURIComponent(model)}`
    }

    private localized(value: unknown, fallback: string) {
        return resolveI18nText(value, RequestContext.getLanguageCode()) ?? fallback
    }

    private requireResourceId(id: string | undefined, resource: string): string {
        if (!id) {
            throw new Error(`Created ${resource} did not return an id`)
        }
        return id
    }

    private requestLanguage(): LanguagesEnum {
        const language = RequestContext.getLanguageCode()
        return language?.toLowerCase().startsWith('zh') ? LanguagesEnum.SimplifiedChinese : LanguagesEnum.English
    }

    private async uniqueKnowledgebaseName(baseName: string) {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const existing = await this.knowledgebaseRepo.findOne({ where: { tenantId, organizationId, name: baseName } })
        return existing ? `${baseName} (${organizationId?.slice(0, 8) ?? 'organization'})` : baseName
    }

    private async uniqueAssistantName(appName: string, organizationId?: string | null) {
        const normalizedAppName = appName
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/^-+|-+$/g, '')
        const organizationSuffix = organizationId?.replace(/-/g, '').slice(0, 8) ?? 'organization'
        const baseName = `${normalizedAppName || 'app'}-studio-${organizationSuffix}`
        if (await this.xpertService.validateName(baseName)) {
            return baseName
        }
        for (let suffix = 2; suffix <= 100; suffix++) {
            const candidate = `${baseName}-${suffix}`
            if (await this.xpertService.validateName(candidate)) {
                return candidate
            }
        }
        throw new ConflictException('application_assistant_name_conflict')
    }

    /**
     * Best-effort rollback for resources created by the current attempt only.
     * Deleting a newly created workspace normally cascades to its Knowledge
     * bases; if that delete fails, each created Knowledge base is retried.
     */
    private async compensate(workspaceId: string | null, knowledgebaseIds: string[], xpertId: string | null) {
        if (xpertId) {
            await this.xpertService.delete(xpertId).catch(() => undefined)
        }
        if (workspaceId) {
            const workspaceDeleted = await this.workspaceService
                .delete(workspaceId)
                .then(() => true)
                .catch(() => false)
            if (workspaceDeleted) {
                return
            }
        }
        for (const knowledgebaseId of knowledgebaseIds) {
            await this.knowledgebaseService.delete(knowledgebaseId).catch(() => undefined)
        }
    }

    /** Finds the one installation bound to the current tenant and organization. */
    private async findCurrentInstallation(
        application: Pick<PluginTemplateApplicationSummary, 'pluginName' | 'appName'>
    ): Promise<PluginApplicationInstallation | null> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !organizationId) {
            return null
        }
        return this.installationRepo.findOne({
            where: {
                tenantId,
                organizationId,
                pluginName: application.pluginName,
                appName: application.appName,
                scopeKey: organizationId
            }
        })
    }
}
