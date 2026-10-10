// Invariants: source credentials stay on the server; only authorable, same-organization
// configurations may be copied. Persist target IDs before creation so retry/repair keeps
// Assistant graph references stable. Rollback deletes only instances created by this attempt.
import {
    LanguagesEnum,
    isToolEnabled,
    PluginApplicationToolsetRequirement,
    PluginApplicationToolsetSelection,
    PluginTemplateApplicationSummary,
    XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { RequestContext, ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, In, IsNull, Repository } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { XpertToolsetService } from '../../xpert-toolset/xpert-toolset.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { applicationSuiteAssistants } from '../plugin-application-suite'
import {
    applicationToolsetDependencies,
    applicationToolsetRef,
    ApplicationToolsetDependency
} from './toolset-requirements'

export interface PreparedApplicationToolset {
    dependency: ApplicationToolsetDependency
    sourceId: string
}

export interface ApplicationToolsetChanges {
    created: string[]
    restored: { id: string; deletedAt: Date }[]
}

@Injectable()
export class PluginApplicationToolsetsService {
    constructor(
        private readonly templates: XpertTemplateService,
        private readonly access: XpertWorkspaceAccessService,
        private readonly registry: ToolsetRegistry,
        private readonly toolsets: XpertToolsetService,
        @InjectRepository(XpertToolset) private readonly repository: Repository<XpertToolset>,
        @InjectRepository(PluginApplicationInstallation)
        private readonly installations: Repository<PluginApplicationInstallation>
    ) {}

    async requirements(application: PluginTemplateApplicationSummary): Promise<ApplicationToolsetDependency[]> {
        const keys = [
            application.assistantTemplateKey,
            ...(application.config.assistantSuite
                ? applicationSuiteAssistants(application.config.assistantSuite).map((role) => role.templateKey)
                : [])
        ]
        const language = (RequestContext.getLanguageCode() || LanguagesEnum.English) as LanguagesEnum
        const templates = await Promise.all(
            [...new Set(keys)].map((key) =>
                this.templates.getTemplateDetail(`${application.pluginName}:${key}`, language)
            )
        )
        return applicationToolsetDependencies(application, templates)
    }

    async preflight(
        application: PluginTemplateApplicationSummary,
        installation?: PluginApplicationInstallation | null
    ): Promise<PluginApplicationToolsetRequirement[]> {
        const dependencies = await this.requirements(application)
        if (!dependencies.length) return []
        const managedIds = dependencies.flatMap((item) => {
            const id = installation?.resourceRefs?.[applicationToolsetRef(item.key)]
            return id ? [id] : []
        })
        const sources = await this.authorizedSources(
            dependencies.map((item) => item.provider),
            undefined,
            managedIds
        )
        return dependencies.map((dependency) => {
            const provider = this.provider(dependency)
            const managedId = installation?.resourceRefs?.[applicationToolsetRef(dependency.key)]
            const managed = sources.find(
                (source) =>
                    source.id === managedId &&
                    this.matches(source, dependency) &&
                    source.workspaceId === installation?.workspaceId
            )
            return {
                ...dependency,
                label: provider?.meta.label ?? dependency.instanceName ?? dependency.provider,
                providerAvailable: !!provider,
                options: provider
                    ? sources
                          .filter((source) => source.type === dependency.provider && this.usable(source))
                          .map((source) => ({
                              id: source.id,
                              name: source.name,
                              ...(source.workspace?.name ? { workspaceName: source.workspace.name } : {})
                          }))
                    : [],
                ...(managed ? { configuredToolsetId: managed.id } : {})
            }
        })
    }

    /** Revalidates client choices before the initialization claim or resource creation. */
    async prepare(
        application: PluginTemplateApplicationSummary,
        selections: PluginApplicationToolsetSelection[] = [],
        installation?: PluginApplicationInstallation | null
    ): Promise<PreparedApplicationToolset[]> {
        const requirements = await this.preflight(application, installation)
        const selected = new Map(selections.map((item) => [item.key, item.toolsetId]))
        if (
            selected.size !== selections.length ||
            selections.some((item) => !requirements.some((r) => r.key === item.key))
        )
            this.invalidSelection()
        return requirements.map((requirement) => {
            const sourceId = requirement.configuredToolsetId ?? selected.get(requirement.key)
            if (
                !requirement.providerAvailable ||
                !sourceId ||
                !requirement.options.some((option) => option.id === sourceId) ||
                (requirement.configuredToolsetId &&
                    selected.has(requirement.key) &&
                    selected.get(requirement.key) !== sourceId)
            )
                this.invalidSelection()
            return { dependency: requirement, sourceId }
        })
    }

    async ensure(
        prepared: PreparedApplicationToolset[],
        installation: PluginApplicationInstallation,
        changes: ApplicationToolsetChanges
    ): Promise<void> {
        if (!prepared.length) return
        const workspaceId = installation.workspaceId
        const { workspace } = await this.access.assertCanAuthor(workspaceId)
        if (workspace.tenantId !== installation.tenantId || workspace.organizationId !== installation.organizationId)
            this.invalidSelection()
        for (const { dependency, sourceId } of prepared) {
            if (!this.provider(dependency)) this.invalidSelection()
            const ref = applicationToolsetRef(dependency.key)
            const previousId = installation.resourceRefs?.[ref]
            const existing = previousId
                ? await this.repository.findOne({ where: { id: previousId }, withDeleted: true, relations: ['tools'] })
                : null
            if (existing) {
                if (
                    !this.matches(existing, dependency) ||
                    !this.usable(existing) ||
                    existing.workspaceId !== workspaceId ||
                    existing.tenantId !== installation.tenantId ||
                    existing.organizationId !== installation.organizationId
                )
                    this.invalidSelection()
                if (existing.deletedAt) {
                    await this.repository.restore({
                        id: existing.id,
                        tenantId: installation.tenantId,
                        organizationId: installation.organizationId,
                        workspaceId
                    })
                    changes.restored.push({ id: existing.id, deletedAt: existing.deletedAt })
                }
                continue
            }
            // Point-read through the same authorization filter again; UI preflight is not an authorization grant.
            const source = (await this.authorizedSources([dependency.provider], sourceId))[0]
            if (!source || !this.usable(source)) this.invalidSelection()
            // A local source can be adopted once; another named dependency needs its own copy.
            const alreadyManaged = Object.entries(installation.resourceRefs ?? {}).some(
                ([key, id]) => key.startsWith('toolset:') && key !== ref && id === source.id
            )
            if (!previousId && source.workspaceId === workspaceId && !alreadyManaged) {
                const updated = await this.repository.update(
                    {
                        id: source.id,
                        workspaceId,
                        tenantId: installation.tenantId,
                        organizationId: installation.organizationId
                    },
                    { name: dependency.instanceName ?? dependency.provider }
                )
                if (updated.affected !== 1) this.invalidSelection()
                installation.resourceRefs = { ...installation.resourceRefs, [ref]: source.id }
                await this.installations.save(installation)
                continue
            }
            const targetId = previousId ?? randomUUID()
            installation.resourceRefs = { ...installation.resourceRefs, [ref]: targetId }
            await this.installations.save(installation)
            await this.toolsets.create({
                id: targetId,
                workspaceId,
                tenantId: installation.tenantId,
                organizationId: installation.organizationId,
                name: dependency.instanceName ?? dependency.provider,
                category: XpertToolsetCategoryEnum.BUILTIN,
                type: dependency.provider,
                description: source.description,
                avatar: source.avatar,
                credentials: source.credentials,
                options: source.options,
                tools: source.tools?.map((tool) => ({
                    tenantId: installation.tenantId,
                    organizationId: installation.organizationId,
                    name: tool.name,
                    label: tool.label,
                    description: tool.description,
                    avatar: tool.avatar,
                    enabled: tool.enabled,
                    disabled: tool.disabled,
                    schema: tool.schema,
                    parameters: tool.parameters,
                    options: tool.options
                }))
            })
            changes.created.push(targetId)
        }
    }

    /** Records the completed configuration without copying it or accepting client-supplied scope. */
    async bind(
        application: PluginTemplateApplicationSummary,
        selection: PluginApplicationToolsetSelection,
        installation: PluginApplicationInstallation,
        manager: EntityManager
    ) {
        const dependency = (await this.requirements(application)).find((item) => item.key === selection.key)
        if (!dependency || !this.provider(dependency)) this.invalidSelection()
        const repository = manager.getRepository(XpertToolset)
        const toolset = await repository.findOne({
            where: {
                id: selection.toolsetId,
                workspaceId: installation.workspaceId,
                tenantId: installation.tenantId,
                organizationId: installation.organizationId,
                type: dependency.provider,
                category: XpertToolsetCategoryEnum.BUILTIN
            },
            relations: ['tools']
        })
        if (!toolset || !this.usable(toolset)) this.invalidSelection()
        const ref = applicationToolsetRef(dependency.key)
        // One concrete instance cannot be renamed to satisfy two differently named template dependencies.
        if (
            Object.entries(installation.resourceRefs ?? {}).some(
                ([key, id]) => key.startsWith('toolset:') && key !== ref && id === toolset.id
            )
        )
            this.invalidSelection()
        const updated = await repository.update(
            { id: toolset.id, workspaceId: installation.workspaceId },
            { name: dependency.instanceName ?? dependency.provider }
        )
        if (updated.affected !== 1) this.invalidSelection()
        installation.resourceRefs = { ...installation.resourceRefs, [ref]: toolset.id }
        await manager.getRepository(PluginApplicationInstallation).save(installation)
    }

    async rollback(changes: ApplicationToolsetChanges, installation: PluginApplicationInstallation) {
        for (const restored of changes.restored) {
            await this.repository.update(
                {
                    id: restored.id,
                    tenantId: installation.tenantId,
                    organizationId: installation.organizationId,
                    workspaceId: installation.workspaceId
                },
                { deletedAt: restored.deletedAt }
            )
        }
        for (const id of changes.created) {
            await this.repository.delete({
                id,
                tenantId: installation.tenantId,
                organizationId: installation.organizationId,
                workspaceId: installation.workspaceId
            })
        }
    }

    async healthy(installation: PluginApplicationInstallation): Promise<boolean> {
        const ids = Object.entries(installation.resourceRefs ?? {})
            .filter(([key]) => key.startsWith('toolset:'))
            .map(([, id]) => id)
        if (!ids.length) return true
        const count = await this.repository.count({
            where: {
                id: In(ids),
                tenantId: installation.tenantId,
                organizationId: installation.organizationId,
                workspaceId: installation.workspaceId,
                category: XpertToolsetCategoryEnum.BUILTIN
            }
        })
        return count === new Set(ids).size
    }

    private provider(dependency: ApplicationToolsetDependency) {
        const registration = this.registry.listRegistrations().find((item) => item.type === dependency.provider)
        if (!registration) return null
        const { source, strategy } = registration
        return source.kind !== 'plugin' || source.pluginName === dependency.pluginName ? strategy : null
    }

    private usable(toolset: XpertToolset) {
        return toolset.tools?.some((tool) => isToolEnabled(tool, toolset.options?.disableToolDefault))
    }

    private matches(toolset: XpertToolset, dependency: ApplicationToolsetDependency) {
        return (
            toolset.category === XpertToolsetCategoryEnum.BUILTIN &&
            toolset.type === dependency.provider &&
            toolset.name === (dependency.instanceName ?? dependency.provider)
        )
    }

    private async authorizedSources(
        providers: string[],
        id?: string,
        restorableIds: string[] = []
    ): Promise<XpertToolset[]> {
        const tenantId = RequestContext.currentTenantId(),
            organizationId = RequestContext.getOrganizationId(),
            userId = RequestContext.currentUserId()
        if (!tenantId || !organizationId || !userId) return []
        const workspaces = await this.access.findAccessibleWorkspaces(undefined, { purpose: 'authoring' })
        const writableIds: string[] = []
        for (const workspace of workspaces) {
            if (
                workspace.tenantId === tenantId &&
                workspace.organizationId === organizationId &&
                (await this.access.getCapabilities(workspace)).canWrite
            )
                writableIds.push(workspace.id)
        }
        const scope = {
            tenantId,
            organizationId,
            category: XpertToolsetCategoryEnum.BUILTIN,
            type: In(providers),
            ...(id ? { id } : {})
        }
        const where = [
            { ...scope, workspaceId: IsNull(), createdById: userId },
            ...(writableIds.length ? [{ ...scope, workspaceId: In(writableIds) }] : [])
        ]
        const active = await this.repository.find({
            where,
            relations: ['workspace', 'tools'],
            order: { updatedAt: 'DESC' }
        })
        if (!restorableIds.length) return active
        // Deleted managed copies can be restored; deleted arbitrary source configurations are never selectable.
        const managed = await this.repository.find({
            where: where.map((filter) => ({ ...filter, id: In(restorableIds) })),
            withDeleted: true,
            relations: ['workspace', 'tools']
        })
        return [...new Map([...active, ...managed].map((toolset) => [toolset.id, toolset])).values()]
    }

    private invalidSelection(): never {
        throw new BadRequestException(
            t('server-ai:Error.ApplicationToolsetSelectionInvalid', {
                defaultValue:
                    'Select an available toolset configuration for each application requirement and try again.'
            })
        )
    }
}
