import { recoverOrganizationRoleReferences } from './organization-role-references'
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { isEqual } from 'lodash'
import { UserOrganization } from '@xpert-ai/server-core'
import {
    AnalyticsRuntimeCapability,
    RequestContext,
    XPERT_RUNTIME_CAPABILITIES_TOKEN,
    type RuntimeCapabilityRegistry
} from '@xpert-ai/plugin-sdk'
import {
    UserType,
    type OrganizationApplicationSettings,
    type OrganizationApplicationSetupForm,
    type PluginTemplateApplicationSummary
} from '@xpert-ai/contracts'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { ApplicationAccessService } from '../application/application-access.service'
import { applicationInstallationIdentity } from '../application/application-scope'
import { ApplicationInitializationLocks } from '../application/application-initialization-locks'

@Injectable()
export class OrganizationSettingsService {
    constructor(
        @InjectRepository(PluginApplicationInstallation)
        private readonly installations: Repository<PluginApplicationInstallation>,
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
        private readonly access: ApplicationAccessService,
        private readonly locks: ApplicationInitializationLocks
    ) {}

    private async context(app: PluginTemplateApplicationSummary) {
        await this.access.assertCanInitialize(app)
        const identity = applicationInstallationIdentity(app)
        if (app.scope !== 'organization' || !app.config.organizationSetup?.length)
            throw new BadRequestException(
                t('server-ai:Error.OrganizationSetupUnavailable', {
                    defaultValue: 'This application does not support organization setup.'
                })
            )
        return {
            identity,
            fields: app.config.organizationSetup,
            actor: {
                tenantId: identity.tenantId,
                organizationId: identity.organizationId,
                userId: RequestContext.currentUserId()
            }
        }
    }

    async form(app: PluginTemplateApplicationSummary): Promise<OrganizationApplicationSetupForm> {
        const setup = app.config.analyticsSetup
        const form = await this.options(await this.context(app), Boolean(setup?.bootstrap))
        if (setup?.kind !== 'connection-model') return form
        return {
            ...form,
            modelSetup: {
                kind: setup.kind,
                ...(setup.bootstrap
                    ? {
                          bootstrap: { modes: setup.bootstrap.modes, version: setup.bootstrap.version }
                      }
                    : {})
            }
        }
    }

    private async options(
        { identity, fields, actor }: Awaited<ReturnType<OrganizationSettingsService['context']>>,
        includeMembers = false
    ): Promise<OrganizationApplicationSetupForm> {
        const existing = await this.installations.findOne({
            where: identity,
            select: { id: true, organizationSettings: true }
        })
        const memberships =
            includeMembers || fields.some((f) => f.kind === 'members')
                ? await this.installations.manager.getRepository(UserOrganization).find({
                      where: {
                          tenantId: actor.tenantId,
                          organizationId: actor.organizationId,
                          isActive: true,
                          user: { tenantId: actor.tenantId, isActive: true, type: UserType.USER }
                      },
                      relations: { user: true },
                      select: {
                          id: true,
                          user: { id: true, firstName: true, lastName: true, username: true, email: true }
                      },
                      order: { userId: 'ASC' }
                  })
                : []
        const providers = new Set(fields.flatMap((f) => (f.kind === 'analytics' ? [f.providerId] : [])))
        const sources = providers.size
            ? (await this.runtime.require(AnalyticsRuntimeCapability).list(actor))
                  .map((s) => ({
                      ...s,
                      providers: s.providers.filter((p) => providers.has(p.id) && p.sharing?.mode !== 'owner_only')
                  }))
                  .filter((s) => s.source.kind === 'definition' && s.providers.length)
            : []
        return {
            settings: existing?.organizationSettings ?? { revision: 0, members: {}, queries: {} },
            users: memberships.map(({ user }) => ({
                id: user.id,
                label: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email
            })),
            sources
        }
    }

    async validate(
        app: PluginTemplateApplicationSummary,
        input?: OrganizationApplicationSettings,
        { reuseSavedQueries = false } = {}
    ) {
        if (!app.config.organizationSetup?.length && !input) return undefined
        const context = await this.context(app)
        const { actor, fields } = context
        const { settings, users, sources } = await this.options(context)
        if (!input) {
            if (!settings.revision)
                throw new BadRequestException(
                    t('server-ai:Error.OrganizationSetupRequired', {
                        defaultValue: 'Complete the organization settings before enabling this application.'
                    })
                )
            input = settings
        }
        if (input.revision !== settings.revision)
            throw new ConflictException(
                t('server-ai:Error.OrganizationSetupChanged', {
                    defaultValue:
                        'Another administrator changed the settings. Reopen the form to load the latest revision.'
                })
            )
        if (
            Object.keys(input.members).some((k) => !fields.some((f) => f.kind === 'members' && f.key === k)) ||
            Object.keys(input.queries).some((k) => !fields.some((f) => f.kind === 'analytics' && f.key === k))
        )
            throw new BadRequestException(
                t('server-ai:Error.OrganizationSetupUnknownField', {
                    defaultValue: 'The application no longer declares one of these fields. Reload its settings.'
                })
            )
        const allowedUsers = new Set(users.map((u) => u.id))
        for (const field of fields) {
            if (field.kind === 'members') {
                const ids = input.members[field.key] ?? []
                if ((!field.optional && !ids.length) || ids.some((id) => !allowedUsers.has(id)))
                    throw new BadRequestException(
                        t('server-ai:Error.OrganizationSetupMembers', {
                            field: field.key,
                            defaultValue: 'Select active members of this organization for {{field}}.'
                        })
                    )
                continue
            }
            const binding = input.queries[field.key]
            const source = binding?.source
            if (
                !source ||
                source.kind !== 'definition' ||
                binding.providerId !== field.providerId ||
                !sources.some(
                    (s) =>
                        s.source.kind === 'definition' &&
                        s.source.definitionId === source.definitionId &&
                        s.source.versionId === source.versionId &&
                        s.providers.some((p) => p.id === field.providerId)
                )
            )
                throw new BadRequestException(
                    t('server-ai:Error.OrganizationSetupSource', {
                        field: field.key,
                        defaultValue: 'Select a published source shared with this organization for {{field}}.'
                    })
                )
            if (
                reuseSavedQueries &&
                settings.revision > 0 &&
                isEqual(binding, settings.queries[field.key]) &&
                (field.requiredNumericFields ?? []).every((id) =>
                    binding.output.fields.some(
                        (f) => f.id === id && ['int64', 'decimal', 'float64'].includes(f.logicalType)
                    )
                )
            )
                continue
            const dataset = await this.runtime
                .require(AnalyticsRuntimeCapability)
                .query(actor, { binding, controls: {} })
            if (
                !dataset.rows.length ||
                dataset.completeness.truncated ||
                dataset.completeness.scope !== 'full_query_result' ||
                field.requiredNumericFields?.some(
                    (id) =>
                        !dataset.fields.some(
                            (f) => f.id === id && ['int64', 'decimal', 'float64'].includes(f.logicalType)
                        ) || dataset.rows[0][id] == null
                )
            )
                throw new BadRequestException(
                    t('server-ai:Error.OrganizationSetupResult', {
                        field: field.key,
                        defaultValue:
                            'The {{field}} query must return a complete, nonempty result with the required numeric fields.'
                    })
                )
        }
        return { ...input, revision: input === settings ? settings.revision : settings.revision + 1 }
    }

    async complete(
        app: PluginTemplateApplicationSummary,
        input: OrganizationApplicationSettings,
        checkHealth?: (row: PluginApplicationInstallation) => Promise<boolean>
    ) {
        const { identity } = await this.context(app)
        return this.locks.run(JSON.stringify(identity), async () => {
            const installation = await this.installations.findOne({
                where: identity
            })
            if (!installation?.xpertId || !['ready', 'degraded'].includes(installation.status))
                throw new ConflictException(
                    t('server-ai:Error.OrganizationSetupInitializationRequired', {
                        defaultValue: 'Initialize the application in this organization before editing its settings.'
                    })
                )
            const settings = await this.validate(app, input, { reuseSavedQueries: true })
            const refs = await recoverOrganizationRoleReferences(this.installations.manager, app, installation)
            // A previously degraded instance may have intact published resources. Verify the existing IDs without running provisioning.
            const restored =
                installation.status === 'degraded' &&
                installation.errorCode === 'resource_missing' &&
                checkHealth &&
                (await checkHealth(
                    Object.assign(
                        new PluginApplicationInstallation(),
                        installation,
                        refs ? { resourceRefs: refs } : {},
                        { status: 'ready' }
                    )
                ))
            const update = await this.installations
                .createQueryBuilder()
                .update()
                .set({
                    organizationSettings: () => 'CAST(:settings AS jsonb)',
                    ...(refs ? { resourceRefs: () => 'CAST(:refs AS jsonb)' } : {}),
                    ...(restored ? { status: 'ready' as const, errorCode: null, errorMessage: null } : {})
                })
                .where({ ...identity, id: installation.id, status: installation.status })
                .andWhere(`COALESCE(("organizationSettings"->>'revision')::integer, 0) = :revision`)
                .setParameters({
                    settings: JSON.stringify(settings),
                    refs: JSON.stringify(refs),
                    revision: input.revision
                })
                .execute()
            if (update.affected !== 1)
                throw new ConflictException(
                    t('server-ai:Error.OrganizationSetupChanged', {
                        defaultValue:
                            'Another administrator changed the settings. Reopen the form to load the latest revision.'
                    })
                )
            return { revision: settings.revision }
        })
    }
}
