import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { t } from 'i18next'
import { Repository, IsNull } from 'typeorm'
import { Integration, canConsumeIntegration } from '@xpert-ai/server-core'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext, AnalyticsProviderRegistry, analyticsBindingSchema } from '@xpert-ai/plugin-sdk'
import type { AnalyticsSourceRef, ApplicationSetupField, PluginTemplateApplicationSummary } from '@xpert-ai/contracts'
import { AnalyticsDefinitionService } from '../../analytics/analytics-definition.service'
import { ApplicationAccessService } from '../application/application-access.service'
import { ApplicationInitializationLocks } from '../application/application-initialization-locks'
import { ApplicationModelReaderService } from './application-model-reader.service'
import { OrganizationSettingsService } from './organization-settings.service'
import { modelPreviewSchema, type ModelSetupInput } from './application-model-setup.schema'

@Injectable()
export class ApplicationModelSetupService {
    constructor(
        @InjectRepository(Integration) private readonly integrations: Repository<Integration>,
        private readonly providers: AnalyticsProviderRegistry,
        private readonly definitions: AnalyticsDefinitionService,
        private readonly settings: OrganizationSettingsService,
        private readonly access: ApplicationAccessService,
        private readonly locks: ApplicationInitializationLocks,
        private readonly readers: ApplicationModelReaderService
    ) {}

    async run(app: PluginTemplateApplicationSummary, input: ModelSetupInput) {
        await this.access.assertCanInitialize(app)
        RequestContext.hasPermission(AIPermissionsEnum.XPERT_EDIT, true)
        const actor = await this.definitions.authorize()
        const setup = app.config.analyticsSetup
        const unavailable = () => new BadRequestException(t('server-ai:Error.ApplicationModelSetupUnavailable'))
        if (app.scope !== 'organization' || setup?.kind !== 'connection-model') throw unavailable()
        const provider = this.providers
            .list(actor.organizationId)
            .find((item) => item.descriptor.id === setup.providerId)?.modelSetup
        const fields =
            app.config.organizationSetup?.filter(
                (field): field is Extract<ApplicationSetupField, { kind: 'analytics' }> => field.kind === 'analytics'
            ) ?? []
        if (
            !provider ||
            !fields.length ||
            fields.length !== Object.keys(setup.recipes).length ||
            fields.some((f) => f.providerId !== setup.providerId || !Object.hasOwn(setup.recipes, f.key))
        )
            throw unavailable()
        const scope = { tenantId: actor.tenantId, provider: provider.integrationProvider }
        const candidates = await this.integrations.find({
            where: [
                { ...scope, organizationId: actor.organizationId },
                { ...scope, organizationId: IsNull() }
            ],
            select: ['id', 'name', 'tenantId', 'organizationId', 'sharing'],
            order: { id: 'ASC' }
        })
        const choices = candidates
            .filter((c) => canConsumeIntegration(c, actor, 'configuration'))
            .map((c) => ({ id: c.id, label: c.name }))
        if (input.step === 'connections') return { choices }
        if (!choices.some((c) => c.id === input.integrationId)) throw unavailable()
        const timeout = 90000
        const integrationId = input.integrationId
        let connectionFingerprint: string | undefined
        const readConnectionOptions = async (): Promise<unknown> => {
            const integration = await this.integrations.findOne({
                where: [
                    { ...scope, id: integrationId, organizationId: actor.organizationId },
                    { ...scope, id: integrationId, organizationId: IsNull() }
                ],
                select: ['id', 'tenantId', 'organizationId', 'sharing', 'options']
            })
            if (!integration || !canConsumeIntegration(integration, actor, 'configuration')) throw unavailable()
            const fingerprint = createHash('sha256')
                .update(JSON.stringify(integration.options ?? null))
                .digest('hex')
            if (connectionFingerprint && connectionFingerprint !== fingerprint) throw unavailable()
            connectionFingerprint = fingerprint
            return integration.options
        }
        const context = {
            actor,
            includeProvisioned: Boolean(provider.bootstrap && setup.bootstrap),
            integrationId,
            readConnectionOptions,
            signal: AbortSignal.timeout(timeout),
            deadlineAt: Date.now() + timeout
        }
        if (input.step === 'models') {
            try {
                return { choices: await provider.models(context) }
            } catch {
                throw new BadRequestException(t('server-ai:Error.ApplicationModelCatalogFailed'))
            }
        }
        if (
            input.step === 'bootstrap-workspaces' ||
            input.step === 'bootstrap-sources' ||
            input.step === 'bootstrap-plan' ||
            input.step === 'bootstrap-apply'
        ) {
            const blueprint = setup.bootstrap
            const capability = provider.bootstrap
            if (!blueprint || !capability) throw unavailable()
            if (input.step === 'bootstrap-workspaces')
                return {
                    choices: await this.readers.workspaces(actor, await capability.workspaces(context)),
                    actorId: actor.userId
                }
            await this.readers.authorize(actor, input.workspaceId)
            if (input.step === 'bootstrap-sources')
                return { choices: await capability.sources(context, input.workspaceId) }
            const selection = {
                workspaceId: input.workspaceId,
                dataSourceId: input.dataSourceId,
                mode: input.mode,
                userIds: [...new Set(input.userIds)].sort()
            }
            const run = async () => {
                const form = await this.settings.form(app)
                if (
                    input.revision !== form.settings.revision ||
                    !blueprint.modes.some((m) => m.id === selection.mode) ||
                    !selection.userIds.includes(actor.userId) ||
                    selection.userIds.some((id) => !form.users.some((u) => u.id === id))
                )
                    throw unavailable()
                await readConnectionOptions()
                const plan = await capability.inspect(context, blueprint.bundle, selection)
                const receipt = createHash('sha256')
                    .update(
                        JSON.stringify([
                            actor.tenantId,
                            actor.organizationId,
                            actor.userId,
                            input.pluginName,
                            input.appName,
                            input.revision,
                            integrationId,
                            connectionFingerprint,
                            blueprint,
                            selection,
                            plan
                        ])
                    )
                    .digest('hex')
                if (input.step === 'bootstrap-plan')
                    return {
                        plan: { state: plan.state, modelLabel: plan.modelLabel, differences: plan.differences, receipt }
                    }
                if (plan.state === 'conflict' || receipt !== input.receipt)
                    throw new ConflictException(t('server-ai:Error.ApplicationModelPreviewChanged'))
                const access = this.readers.scoped(actor, integrationId, selection.workspaceId, selection.userIds)
                return { model: await capability.apply(context, blueprint.bundle, selection, plan.fingerprint, access) }
            }
            return input.step === 'bootstrap-plan'
                ? run()
                : this.locks.run(
                      JSON.stringify([
                          actor.tenantId,
                          actor.organizationId,
                          integrationId,
                          selection.workspaceId,
                          selection.dataSourceId,
                          blueprint.key,
                          selection.mode
                      ]),
                      run
                  )
        }
        const { settings } = await this.settings.form(app)
        const changed = () => new ConflictException(t('server-ai:Error.ApplicationModelPreviewChanged'))
        if (input.revision !== settings.revision) throw changed()
        const preview = await provider
            .preview(context, input.modelId, setup.recipes)
            .then((result) => modelPreviewSchema.parse(result))
            .catch(() => {
                throw new BadRequestException(t('server-ai:Error.ApplicationModelPreviewFailed'))
            })
        if (
            preview.queries.length !== fields.length ||
            fields.some((f) => {
                const q = preview.queries.find((q) => q.key === f.key)
                return (
                    !q ||
                    q.binding.providerId !== setup.providerId ||
                    q.sample.length > q.rowCount ||
                    f.requiredNumericFields?.some(
                        (id) =>
                            !q.binding.output.fields.some(
                                (field) =>
                                    field.id === id && ['decimal', 'float64', 'int64'].includes(field.logicalType)
                            ) || q.sample.some((row) => row[id] == null)
                    )
                )
            })
        )
            throw new BadRequestException(t('server-ai:Error.ApplicationModelPreviewFailed'))
        const receipt = createHash('sha256')
            .update(
                JSON.stringify([
                    actor,
                    input.pluginName,
                    input.appName,
                    input.revision,
                    input.integrationId,
                    input.modelId,
                    setup,
                    preview
                ])
            )
            .digest('hex')
        if (input.step === 'preview')
            return {
                receipt,
                queries: preview.queries.map((q) => ({
                    key: q.key,
                    rowCount: q.rowCount,
                    sample: q.sample.map((row) =>
                        Object.fromEntries(q.binding.output.fields.map((field) => [field.id, row[field.id]]))
                    ),
                    fields: q.binding.output.fields.map((f) => ({ id: f.id, label: f.label ?? f.id }))
                }))
            }
        if (input.receipt !== receipt) throw changed()
        const { definition, version } = await this.definitions.ensureOrganizationDefinition({
            name: preview.modelLabel.slice(0, 160),
            providerId: setup.providerId,
            options: preview.options
        })
        const source: AnalyticsSourceRef = { kind: 'definition', definitionId: definition.id, versionId: version.id }
        const queries = Object.fromEntries(
            preview.queries.map((q) => [q.key, analyticsBindingSchema.parse({ ...q.binding, source })])
        )
        return { queries }
    }
}
