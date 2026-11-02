import { PlatformStorageUsageService } from './storage/platform-storage-usage.service'
import { PlatformResourceBinding } from './platform-resource-binding.entity'
import { preparationFailureCode } from './platform-error'
import { platformFailure } from './platform-error'
import { Injectable, Logger } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { DataSource, QueryFailedError } from 'typeorm'
import {
    appPlatformAppOrder,
    AiModelTypeEnum,
    AppPlatformApp,
    PluginTemplateApplicationSummary
} from '@xpert-ai/contracts'
import { PluginApplicationService } from '../application/plugin-application.service'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { AppPlatformDelivery } from './app-platform-delivery.entity'
import { PlatformMaintenanceActorService } from './platform-maintenance-actor.service'
import { PlatformModelsService } from './platform-models.service'
import { platformReady } from './platform-delivery-state'
import { captureRequestContext, runWithCapturedRequestContext } from '../../shared/request-context'
import { runWithServiceOperation } from '../../shared/service-operation'
import { applicationModelOptions } from '../application/application-models'
import { AssistantSharingService } from '../../xpert/sharing/sharing.service'
import { MembershipService } from '../../membership/membership.service'
import { ApplicationInitializationLocks } from '../application/application-initialization-locks'
import { withPlatformKnowledgeLifecycle } from '../../knowledgebase/lifecycle/shared-resource-lifecycle'
import { Knowledgebase } from '../../knowledgebase/persistence/knowledgebase.entity'
import { assertPlatformModelRequirements } from './platform-model-requirements'

// Provisioning uses the normal App template lifecycle under a scoped maintenance account.
// Persisted installation and operation IDs let retries resume without replacing user resources.
@Injectable()
export class PlatformProvisionerService {
    private readonly logger = new Logger(PlatformProvisionerService.name)
    constructor(
        private readonly database: DataSource,
        private readonly actors: PlatformMaintenanceActorService,
        private readonly models: PlatformModelsService,
        private readonly applications: PluginApplicationService,
        private readonly sharing: AssistantSharingService,
        private readonly memberships: MembershipService,
        private readonly locks: ApplicationInitializationLocks,
        private readonly queries: QueryBus,
        private readonly storageUsage: PlatformStorageUsageService
    ) {}

    async provision(id: string, digest: string) {
        return this.locks.run(`platform:${id}`, async () => {
            const repository = this.database.getRepository(AppPlatformDelivery)
            const delivery = await repository.findOneByOrFail({ id })
            if (delivery.configurationDigest !== digest) return
            await this.actors.beneficiary(delivery)
            const membership = await this.memberships.ensureTenantDefaultMembership({
                tenantId: delivery.tenantId,
                userId: delivery.userId
            })
            if (!membership) throw platformFailure('application_trial_unavailable')
            const actor = await this.actors.ensure(delivery)
            const definition = delivery.configuration.definition
            for (const app of appPlatformAppOrder(definition)) {
                const state = delivery.apps.find((candidate) => candidate.key === app.key)
                if (!app.enabled) {
                    state.status = 'disabled'
                    continue
                }
                if (state.status === 'ready') continue
                if (
                    app.dependsOn.some(
                        (key) => delivery.apps.find((candidate) => candidate.key === key)?.status !== 'ready'
                    )
                ) {
                    state.status = 'blocked'
                    state.errorCode = 'application_dependency_not_ready'
                    await repository.save(delivery)
                    continue
                }
                state.status = 'initializing'
                state.attempts++
                delete state.errorCode
                await repository.save(delivery)
                try {
                    const configuration = delivery.configuration.environment.configurations[app.configurationRef]
                    const model = await this.models.resolve(delivery.tenantId, delivery.organizationId, configuration)
                    const access = await this.memberships.findModelAccess({
                        tenantId: delivery.tenantId,
                        organizationId: delivery.organizationId,
                        userId: delivery.userId
                    })
                    if (
                        !access ||
                        model.billingModels.some(
                            (selected) =>
                                !this.memberships.isModelAllowed(
                                    access.membership.plan,
                                    selected.provider,
                                    selected.model,
                                    selected.copilotId
                                )
                        )
                    )
                        throw platformFailure('application_model_binding_unavailable')
                    const toolsetSourceIds = await this.models.toolSources(delivery.tenantId, configuration)
                    const bindings = await this.bindings(delivery, app)
                    const context = captureRequestContext({
                        user: actor,
                        tenantId: delivery.tenantId,
                        organizationId: delivery.organizationId,
                        headers: { 'x-scope-level': 'organization' }
                    })
                    const installOptions = {
                        primaryModel: model.primary,
                        knowledgebaseBindings: bindings,
                        toolsetSourceIds
                    }
                    await runWithCapturedRequestContext(context, () =>
                        runWithServiceOperation(
                            {
                                tenantId: delivery.tenantId,
                                organizationId: delivery.organizationId,
                                actorId: actor.id,
                                subjectId: delivery.userId,
                                application: app.appRef
                            },
                            async () => {
                                const detail = await this.applications.getDetail(
                                    app.appRef.pluginName,
                                    app.appRef.appName,
                                    'organization',
                                    installOptions
                                )
                                assertPlatformModelRequirements(model, detail.application.config.modelRequirements)
                                this.validateBindings(detail.application, bindings)
                                const primaryOptions = await applicationModelOptions(this.queries, AiModelTypeEnum.LLM)
                                if (
                                    !primaryOptions.some(
                                        (option) =>
                                            option.copilotId === model.primary.copilotId &&
                                            option.model === model.primary.model
                                    )
                                )
                                    throw platformFailure('application_primary_model_unavailable')
                                for (const auxiliary of model.auxiliary) {
                                    const options = await applicationModelOptions(this.queries, auxiliary.modelType)
                                    if (
                                        !options.some(
                                            (option) =>
                                                option.copilotId === auxiliary.copilotId &&
                                                option.model === auxiliary.model
                                        )
                                    )
                                        throw platformFailure('application_model_binding_unavailable')
                                }
                                const { primary, auxiliary, billingModels, ...choices } = model
                                const toolsets = detail.preflight.toolsetRequirements.map((requirement) => {
                                    const toolsetId =
                                        requirement.configuredToolsetId ??
                                        requirement.options.find((option) => toolsetSourceIds.includes(option.id))?.id
                                    if (!toolsetId) throw platformFailure('application_tool_binding_unavailable')
                                    return { key: requirement.key, toolsetId }
                                })
                                if (state.updateOperationId) {
                                    const current = await this.database
                                        .getRepository(PluginApplicationInstallation)
                                        .findOneByOrFail({
                                            id: state.installationId,
                                            tenantId: delivery.tenantId,
                                            organizationId: delivery.organizationId,
                                            ...app.appRef
                                        })
                                    await this.applications.updateApplication(
                                        {
                                            ...app.appRef,
                                            installationScope: 'organization',
                                            operationId: state.updateOperationId,
                                            resume: current.updateRelease?.operationId === state.updateOperationId
                                        },
                                        installOptions
                                    )
                                } else {
                                    await this.applications.initialize(
                                        {
                                            ...app.appRef,
                                            installationScope: 'organization',
                                            operationId: `platform-${delivery.id}-${app.key}`,
                                            ...choices,
                                            toolsets
                                        },
                                        installOptions
                                    )
                                }
                                const installation = await this.database
                                    .getRepository(PluginApplicationInstallation)
                                    .findOneByOrFail({
                                        tenantId: delivery.tenantId,
                                        organizationId: delivery.organizationId,
                                        ...app.appRef,
                                        scopeKey: delivery.organizationId
                                    })
                                state.installationId = installation.id
                                if (installation.status !== 'ready')
                                    throw platformFailure('application_installation_not_ready')
                                for (const entry of Object.keys(installation.resourceRefs ?? {}).filter(
                                    (key) => key === 'assistant' || key.startsWith('role:')
                                )) {
                                    const assistantId = installation.resourceRefs?.[entry]
                                    if (!assistantId) throw platformFailure('application_entry_missing')
                                    await this.sharing.grantUsers(assistantId, [delivery.userId])
                                }
                                state.status = 'ready'
                                state.appliedDigest = delivery.configurationDigest
                                delete state.updateOperationId
                            }
                        )
                    )
                } catch (error) {
                    // Provider errors may contain credentials or prompts. Keep user-facing failure codes bounded.
                    state.status = 'failed'
                    state.errorCode = preparationFailureCode(error)
                    this.logger.warn({
                        phase: 'application_preparation',
                        app: app.key,
                        code: state.errorCode,
                        databaseCode: error instanceof QueryFailedError ? error.driverError?.code : undefined,
                        databaseMessage:
                            error instanceof QueryFailedError &&
                            ['42601', '42703', '42883', '42P01'].includes(error.driverError?.code)
                                ? error.driverError.message
                                : undefined,
                        frames:
                            error instanceof Error
                                ? error.stack
                                      ?.split('\n')
                                      .filter((line) => /^\s+at /.test(line))
                                      .slice(0, 4)
                                : []
                    })
                }
                await repository.save(delivery)
            }
            if (platformReady(definition, delivery.apps)) {
                // Prepare the first snapshot before reporting readiness so the first run needs no collector warm-up.
                await this.storageUsage.refresh(delivery)
                delivery.readyAt ??= new Date()
            }
            delivery.retryAfter = new Date(Date.now() + 60_000)
            await repository.save(delivery)
            if (delivery.apps.some((state) => state.status === 'failed' || state.status === 'blocked'))
                throw platformFailure('application_preparation_incomplete')
        })
    }

    private async bindings(delivery: AppPlatformDelivery, app: AppPlatformApp) {
        const result = new Map<string, string>()
        for (const binding of delivery.configuration.definition.bindings.filter((item) => item.to.app === app.key)) {
            const source = delivery.apps.find((item) => item.key === binding.from.app)
            if (!source?.installationId) throw platformFailure('application_binding_not_ready')
            const installation = await this.database.getRepository(PluginApplicationInstallation).findOneByOrFail({
                id: source.installationId,
                tenantId: delivery.tenantId,
                organizationId: delivery.organizationId,
                status: 'ready'
            })
            const definition = this.applications.getDefinition(
                installation.pluginName,
                installation.appName,
                'organization'
            )
            if (!definition.config.resources?.knowledgebases?.exports?.includes(binding.from.resource))
                throw platformFailure('application_resource_not_exported')
            const id = installation.resourceRefs?.[`knowledgebase:${binding.from.resource}`]
            if (!id) throw platformFailure('application_binding_not_ready')
            await withPlatformKnowledgeLifecycle(this.database.manager, delivery.tenantId, async () => {
                const resource = await this.database.getRepository(Knowledgebase).findOneBy({
                    id,
                    tenantId: delivery.tenantId,
                    organizationId: delivery.organizationId
                })
                if (!resource) throw platformFailure('application_binding_not_ready')
                await this.database.getRepository(PlatformResourceBinding).upsert(
                    {
                        tenantId: delivery.tenantId,
                        organizationId: delivery.organizationId,
                        deliveryId: delivery.id,
                        consumerApp: app.key,
                        resourceKey: binding.to.resource,
                        knowledgebaseId: id
                    },
                    ['deliveryId', 'consumerApp', 'resourceKey']
                )
            })
            result.set(binding.to.resource, id)
        }
        return result
    }

    private validateBindings(application: PluginTemplateApplicationSummary, bindings: ReadonlyMap<string, string>) {
        for (const key of bindings.keys()) {
            if (
                !application.config.resources?.knowledgebases?.imports?.includes(key) ||
                !application.config.knowledgebases?.some((item) => item.key === key)
            )
                throw platformFailure('application_resource_binding_unsupported')
        }
    }
}
