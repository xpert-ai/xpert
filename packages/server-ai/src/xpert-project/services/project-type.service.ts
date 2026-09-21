// Invariants: classification is immutable during reconciliation. Plugin providers
// verify persisted business links; display snapshots never authorize app execution.
import { projectApplicationDefinitions } from './project-type-metadata'
import {
    GENERAL_PROJECT_TYPE,
    IXpert,
    XpertProjectClassification,
    XpertProjectEntry,
    XpertProjectTypeRef,
    XpertProjectTypeSummary
} from '@xpert-ai/contracts'
import {
    RequestContext,
    ProjectTypeProviderRegistry,
    type ProjectTypeContext,
    type IProjectTypeProvider
} from '@xpert-ai/plugin-sdk'
import { LOADED_PLUGINS, LoadedPluginRecord, normalizePluginName } from '@xpert-ai/server-core'
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { t } from 'i18next'
import { PluginApplicationInstallation } from '../../plugin-resource/plugin-application-installation.entity'
import { effectiveLoadedPlugins } from '../../plugin-resource/effective-loaded-plugins'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { XpertProject } from '../entities/project.entity'
import { XpertProjectAccessService } from './project-access.service'

type RegisteredType = XpertProjectTypeSummary & { pluginName?: string; appName?: string; scopeKey?: string }

@Injectable()
export class XpertProjectTypeService {
    constructor(
        private readonly providers: ProjectTypeProviderRegistry,
        @InjectRepository(PluginApplicationInstallation)
        private readonly installations: Repository<PluginApplicationInstallation>,
        private readonly access: XpertProjectAccessService,
        private readonly xperts: PublishedXpertAccessService,
        @Optional() @Inject(LOADED_PLUGINS) private readonly plugins: LoadedPluginRecord[] = []
    ) {}

    /** Resolve types from effective loaded plugins, retaining provenance for provider validation. */
    catalog(): RegisteredType[] {
        const result: RegisteredType[] = [
            {
                ...GENERAL_PROJECT_TYPE,
                applicationTitle: { en_US: 'Platform', zh_Hans: '平台' },
                title: { en_US: 'General project', zh_Hans: '通用项目' },
                binding: { kind: 'project' },
                available: true
            }
        ]
        const identities = new Set<string>()
        for (const plugin of effectiveLoadedPlugins(this.plugins)) {
            const meta = plugin.instance?.meta
            const pluginName = normalizePluginName(plugin.packageName ?? plugin.name ?? meta?.name ?? '')
            for (const app of projectApplicationDefinitions(meta?.targetAppMeta)) {
                for (const definition of app.projectTypes ?? []) {
                    if (
                        !/^[a-z][a-z0-9_-]{0,99}$/.test(definition.key) ||
                        !['project', 'entity'].includes(definition.binding?.kind) ||
                        (definition.binding.kind === 'entity' && !definition.binding.providerKey?.trim())
                    ) {
                        throw new BadRequestException(t('server-ai:Error.ProjectTypeInvalid'))
                    }
                    const applicationKey = `${pluginName}:${app.name}`
                    const identity = `${applicationKey}\0${definition.key}`
                    if (identities.has(identity)) throw new ConflictException(t('server-ai:Error.ProjectTypeDuplicate'))
                    identities.add(identity)
                    result.push({
                        applicationKey,
                        projectTypeKey: definition.key,
                        applicationTitle: app.displayName ?? app.name,
                        title: definition.title,
                        icon: definition.icon,
                        binding: definition.binding,
                        available: true,
                        pluginName,
                        appName: app.name,
                        scopeKey: plugin.scopeKey ?? plugin.organizationId
                    })
                }
            }
        }
        return result
    }

    /** Expose public type metadata and the accessible Assistant's validated default type. */
    async list(xpertId?: string) {
        const xpert = xpertId ? await this.xperts.getAccessiblePublishedXpert(xpertId) : null
        const defaultProjectType = xpert?.options?.workspaceScope?.projectType
        // An unavailable App must not silently fall back to creating a generic Project.
        if (defaultProjectType) this.resolve(defaultProjectType)
        return { items: this.catalog().map(({ pluginName, appName, scopeKey, ...type }) => type), defaultProjectType }
    }

    /** Resolve stable keys against live registrations; snapshots cannot restore an unavailable type. */
    resolve(ref: XpertProjectTypeRef): RegisteredType {
        if (typeof ref?.applicationKey !== 'string' || typeof ref?.projectTypeKey !== 'string') {
            throw new BadRequestException(t('server-ai:Error.ProjectTypeInvalid'))
        }
        const type = this.catalog().find(
            (item) => item.applicationKey === ref.applicationKey && item.projectTypeKey === ref.projectTypeKey
        )
        if (!type) throw new NotFoundException(t('server-ai:Error.ProjectTypeUnavailable'))
        return type
    }

    /** Reject providers whose registered plugin or scope differs from the type declaration. */
    private provider(type: RegisteredType): IProjectTypeProvider {
        if (type.binding.kind !== 'entity') throw new BadRequestException(t('server-ai:Error.ProjectTypeInvalid'))
        let provider: IProjectTypeProvider
        try {
            provider = this.providers.get(type.binding.providerKey, RequestContext.getOrganizationId())
        } catch {
            throw new NotFoundException(t('server-ai:Error.ProjectTypeUnavailable'))
        }
        const source = this.providers.getSource(provider)
        if (
            source.kind !== 'plugin' ||
            normalizePluginName(source.pluginName) !== type.pluginName ||
            source.scopeKey !== type.scopeKey
        ) {
            throw new NotFoundException(t('server-ai:Error.ProjectTypeUnavailable'))
        }
        return provider
    }

    /** Derive the provider's actor and security scope exclusively from the authenticated request. */
    private context(
        ref: XpertProjectTypeRef,
        xpertId: string,
        purpose: ProjectTypeContext['purpose']
    ): ProjectTypeContext {
        const user = RequestContext.currentUser()
        if (!user?.id || !user.tenantId) throw new BadRequestException(t('server-ai:Error.AuthenticatedUserRequired'))
        return {
            applicationKey: ref.applicationKey,
            projectTypeKey: ref.projectTypeKey,
            tenantId: user.tenantId,
            organizationId: RequestContext.getOrganizationId(),
            userId: user.id,
            xpertId,
            purpose
        }
    }

    /** Capture validated type metadata and optional installation provenance for a new Project. */
    async classification(ref: XpertProjectTypeRef): Promise<XpertProjectClassification> {
        const type = this.resolve(ref)
        const installation = type.pluginName
            ? await this.installations.findOneBy({
                  tenantId: RequestContext.currentTenantId(),
                  organizationId: RequestContext.getOrganizationId() ?? IsNull(),
                  pluginName: type.pluginName,
                  appName: type.appName
              })
            : null
        return {
            applicationKey: type.applicationKey,
            projectTypeKey: type.projectTypeKey,
            applicationInstallationId: installation?.id ?? null,
            projectTypeSnapshot: { applicationTitle: type.applicationTitle, title: type.title, binding: type.binding }
        }
    }

    /** Allow ordinary creation only for direct Project types; entity types require their business workflow. */
    async forCreate(ref = GENERAL_PROJECT_TYPE) {
        if (this.resolve(ref).binding.kind !== 'project')
            throw new BadRequestException(t('server-ai:Error.ProjectApplicationWorkflowRequired'))
        return this.classification(ref)
    }

    /**
     * Validate a provisioning attempt without reclassifying an existing Project.
     * Entity providers must confirm the persisted link, actor, Assistant and desired business state.
     */
    async forEnsure(
        project: XpertProject | null,
        ref: XpertProjectTypeRef | undefined,
        xpert: IXpert,
        projectId: string,
        desired: { name: string; status: 'active' | 'archived' }
    ) {
        if (!ref) {
            if (project?.applicationKey) throw new ConflictException(t('server-ai:Error.ProjectTypeConflict'))
            return {}
        }
        if (
            project &&
            (project.applicationKey !== ref.applicationKey || project.projectTypeKey !== ref.projectTypeKey)
        ) {
            throw new ConflictException(t('server-ai:Error.ProjectTypeConflict'))
        }
        const type = this.resolve(ref)
        if (type.binding.kind === 'entity') {
            const state = await this.provider(type).resolve(this.context(ref, xpert.id, 'provision'), projectId)
            if (state.xpertId && (await this.xperts.getAccessiblePublishedXpert(state.xpertId)).id !== xpert.id) {
                throw new ConflictException(t('server-ai:Error.ProjectManagedStateConflict'))
            }
            if (state.name !== desired.name || state.status !== desired.status) {
                throw new ConflictException(t('server-ai:Error.ProjectManagedStateConflict'))
            }
        } else if (project && ref.applicationKey !== 'platform') {
            // Direct application projects use ordinary platform lifecycle endpoints.
            throw new BadRequestException(t('server-ai:Error.ProjectApplicationWorkflowRequired'))
        }
        return project ? {} : this.classification(ref)
    }

    /** Keep entity-owned lifecycle changes in the application, even when its plugin is unavailable. */
    assertPlatformLifecycle(project: XpertProjectClassification) {
        if (!project.applicationKey) return // Explicit legacy compatibility; backfill does not infer types.
        if (project.applicationKey === 'platform' && project.projectTypeKey === 'general') return
        // A missing plugin cannot turn an entity-managed project into a generic one.
        const type = this.resolve({
            applicationKey: project.applicationKey,
            projectTypeKey: project.projectTypeKey ?? ''
        })
        if (type.binding.kind === 'entity' || project.projectTypeSnapshot?.binding.kind === 'entity')
            throw new BadRequestException(t('server-ai:Error.ProjectApplicationWorkflowRequired'))
    }

    /**
     * Resolve a governed creation/opening destination rather than accepting a browser-provided URL.
     * Existing Projects require read access before provider resolution and access to the connected Assistant.
     */
    async entry(ref: XpertProjectTypeRef, input: { projectId?: string; xpertId?: string }): Promise<XpertProjectEntry> {
        let project: XpertProject | undefined
        if (input.projectId) {
            project = (await this.access.assertCanRead(input.projectId)).project
            if (project.applicationKey !== ref.applicationKey || project.projectTypeKey !== ref.projectTypeKey) {
                throw new ConflictException(t('server-ai:Error.ProjectTypeConflict'))
            }
        }
        const type = this.resolve(ref)
        if (type.binding.kind === 'project') return { kind: 'project', projectId: input.projectId, projectType: ref }
        const classification = project ?? (await this.classification(ref))
        const installation = classification.applicationInstallationId
            ? await this.installations.findOneBy({
                  id: classification.applicationInstallationId,
                  tenantId: RequestContext.currentTenantId(),
                  organizationId: RequestContext.getOrganizationId() ?? IsNull()
              })
            : null
        const suggestedXpertId = input.xpertId ?? installation?.xpertId ?? ''
        const provider = this.provider(type)
        const context = this.context(ref, suggestedXpertId, input.projectId ? 'open' : 'create')
        const binding = input.projectId
            ? await provider.resolve(context, input.projectId)
            : await provider.createEntry(context)
        const xpertId = binding.xpertId ?? suggestedXpertId
        if (!xpertId) throw new NotFoundException(t('server-ai:Error.ProjectApplicationEntryUnavailable'))
        const xpert = await this.xperts.getAccessiblePublishedXpert(xpertId)
        if ((xpert.organizationId ?? null) !== (RequestContext.getOrganizationId() ?? null))
            throw new NotFoundException(t('server-ai:Error.ProjectApplicationEntryUnavailable'))
        if (input.projectId) await this.access.assertCanUseXpert(input.projectId, xpert.id)
        return {
            kind: 'assistant',
            xpertId: xpert.id,
            slug: xpert.slug,
            projectId: input.projectId,
            viewKey: binding.viewKey,
            selectionId: binding.selectionId
        }
    }
}
