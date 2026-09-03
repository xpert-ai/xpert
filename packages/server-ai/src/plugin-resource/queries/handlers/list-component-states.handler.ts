import {
    IPluginResourceComponentState,
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_LEVEL,
    PLUGIN_RESOURCE_INSTALLATION_STATUS,
    PLUGIN_RESOURCE_RUNTIME_TYPE,
    type PluginLevel
} from '@xpert-ai/contracts'
import {
    LOADED_PLUGINS,
    LoadedPluginRecord,
    normalizePluginName,
    PluginBundleComponentRegistration
} from '@xpert-ai/server-core'
import { BadRequestException, Inject, Optional } from '@nestjs/common'
import { ConfigService } from '@xpert-ai/server-config'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { SkillPackage } from '../../../skill-package/skill-package.entity'
import { XpertService } from '../../../xpert/xpert.service'
import { XpertWorkspaceAccessService } from '../../../xpert-workspace'
import {
    isPluginResourceInstallableForTarget,
    listRuntimeToolProviderComponents,
    pluginResourceComponentStateKey,
    pluginSkillSharedId,
    readPluginResourceComponents,
    resolveLoadedPluginResourceRoot
} from '../../plugin-resource-components'
import { RequestContext, type StrategySource, XpertToolProviderRegistry } from '@xpert-ai/plugin-sdk'
import { McpPublication } from '../../../mcp-publication/entities/mcp-publication.entity'
import { McpPublicationAccess } from '../../../mcp-publication/entities/mcp-publication-access.entity'
import { mcpPublicationPublicUrl } from '../../../mcp-publication/mcp-publication-url'
import { PluginResourceInstallation } from '../../plugin-resource-installation.entity'
import { applyPluginResourceOrganizationScope } from '../../plugin-resource-installation-scope'
import { ListPluginResourceComponentStatesQuery } from '../list-component-states.query'

@QueryHandler(ListPluginResourceComponentStatesQuery)
export class ListPluginResourceComponentStatesHandler implements IQueryHandler<ListPluginResourceComponentStatesQuery> {
    constructor(
        @InjectRepository(PluginResourceInstallation)
        private readonly installationRepo: Repository<PluginResourceInstallation>,
        @InjectRepository(SkillPackage)
        private readonly skillPackageRepo: Repository<SkillPackage>,
        @InjectRepository(McpPublication)
        private readonly publicationRepo: Repository<McpPublication>,
        @InjectRepository(McpPublicationAccess)
        private readonly publicationAccessRepo: Repository<McpPublicationAccess>,
        private readonly workspaceAccess: XpertWorkspaceAccessService,
        private readonly xpertService: XpertService,
        private readonly toolProviderRegistry: XpertToolProviderRegistry,
        private readonly configService: ConfigService,
        @Optional()
        @Inject(LOADED_PLUGINS)
        private readonly loadedPlugins: LoadedPluginRecord[] = []
    ) {}

    async execute(query: ListPluginResourceComponentStatesQuery): Promise<IPluginResourceComponentState[]> {
        const pluginName = normalizePluginName(query.pluginName)
        const input = query.input
        const target = input.target ?? (input.xpertId ? 'xpert' : 'workspace')
        const xpert = input.xpertId ? await this.xpertService.getTeam(input.xpertId) : null
        const workspaceId = xpert?.workspaceId ?? input.workspaceId
        if (target !== 'organization' && !workspaceId) {
            throw new BadRequestException('workspaceId is required')
        }
        if (input.workspaceId && xpert?.workspaceId && input.workspaceId !== xpert.workspaceId) {
            throw new BadRequestException('workspaceId does not match Xpert workspace')
        }
        if (workspaceId) {
            await this.workspaceAccess.assertCanAuthor(workspaceId)
        }

        const rootDir = resolveLoadedPluginResourceRoot(pluginName, this.loadedPlugins)
        const manifestComponents = readPluginResourceComponents(pluginName, rootDir)
        const runtimeRegistrations = listRuntimeToolProviderComponents(pluginName, this.toolProviderRegistry)
        const runtimeComponents = runtimeRegistrations.map(({ component }) => component)
        const tenantScopedRuntimeKeys = new Set(
            runtimeRegistrations
                .filter(({ source }) => isTenantScopedProvider(pluginName, source, this.loadedPlugins))
                .map(({ component }) => pluginResourceComponentStateKey(component))
        )
        const runtimeKeys = new Set(runtimeComponents.map((component) => pluginResourceComponentStateKey(component)))
        const components = [
            ...manifestComponents.filter((component) => !runtimeKeys.has(pluginResourceComponentStateKey(component))),
            ...runtimeComponents
        ].filter((component) => isPluginResourceInstallableForTarget(component.componentType, target))
        if (!components.length) {
            return []
        }

        const installations = await this.findInstallationsForTarget(
            workspaceId ?? null,
            target === 'xpert' ? (input.xpertId ?? null) : null,
            pluginName,
            target === 'xpert' ? input.agentKey : undefined
        )
        const installationByComponent = new Map<string, PluginResourceInstallation>()
        for (const installation of installations) {
            const key = pluginResourceComponentStateKey(installation)
            if (!installationByComponent.has(key)) {
                installationByComponent.set(key, installation)
            }
        }
        if (target === 'organization' && tenantScopedRuntimeKeys.size) {
            const tenantInstallations = await this.findTenantScopedInstallations(pluginName)
            for (const installation of tenantInstallations) {
                const key = pluginResourceComponentStateKey(installation)
                if (tenantScopedRuntimeKeys.has(key)) {
                    installationByComponent.set(key, installation)
                }
            }
        }
        const effectiveInstallations = [...installationByComponent.values()]
        const publicationIds = effectiveInstallations
            .map((installation) => readInstallationString(installation.config, 'publicationId'))
            .filter((id): id is string => !!id)
        const publications = publicationIds.length
            ? await this.publicationRepo.find({
                  where: {
                      id: In(publicationIds),
                      tenantId: RequestContext.currentTenantId()
                  }
              })
            : []
        const publicationById = new Map(publications.map((publication) => [publication.id, publication]))
        const currentOrganizationId = RequestContext.getOrganizationId()
        const publicationAccesses =
            publicationIds.length && currentOrganizationId
                ? await this.publicationAccessRepo.find({
                      where: {
                          publicationId: In(publicationIds),
                          tenantId: RequestContext.currentTenantId(),
                          organizationId: currentOrganizationId,
                          enabled: true
                      }
                  })
                : []
        const accessiblePublicationIds = new Set(publicationAccesses.map(({ publicationId }) => publicationId))

        const skillPackagesBySharedId =
            target === 'workspace' && workspaceId
                ? await this.findPluginSkillPackages(workspaceId, pluginName, components)
                : new Map<string, SkillPackage>()
        const skillPackagesById =
            target === 'workspace' && workspaceId
                ? await this.findSkillPackagesByInstallationRuntimeId(workspaceId, installations)
                : new Map<string, SkillPackage>()

        return components.map((component) => {
            const installation = installationByComponent.get(pluginResourceComponentStateKey(component)) ?? null
            const skillPackage =
                component.componentType === PLUGIN_COMPONENT_TYPE.SKILL
                    ? (skillPackagesBySharedId.get(pluginSkillSharedId(pluginName, component.componentKey)) ??
                      (installation?.runtimeId ? skillPackagesById.get(installation.runtimeId) : null) ??
                      null)
                    : null
            const effectiveInstallation =
                component.componentType === PLUGIN_COMPONENT_TYPE.SKILL &&
                installation?.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE &&
                !skillPackage
                    ? null
                    : installation
            const installed = component.componentType === PLUGIN_COMPONENT_TYPE.SKILL ? !!skillPackage : !!installation
            const runtimeType =
                effectiveInstallation?.runtimeType ?? (skillPackage ? PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE : null)
            const runtimeId = skillPackage?.id ?? effectiveInstallation?.runtimeId ?? null
            const status =
                effectiveInstallation?.status ?? (skillPackage ? PLUGIN_RESOURCE_INSTALLATION_STATUS.READY : null)
            const publicationId = readInstallationString(effectiveInstallation?.config, 'publicationId')
            const publication = publicationId ? publicationById.get(publicationId) : undefined
            const publicationScope = tenantScopedRuntimeKeys.has(pluginResourceComponentStateKey(component))
                ? 'tenant'
                : 'organization'
            const accessEnabled =
                publicationScope === 'tenant' && currentOrganizationId
                    ? !!publicationId && accessiblePublicationIds.has(publicationId)
                    : true

            return {
                componentType: component.componentType,
                componentKey: component.componentKey,
                installed,
                staleDefinition:
                    installed &&
                    !!effectiveInstallation &&
                    effectiveInstallation.definitionHash !== component.definitionHash,
                runtimeType,
                runtimeId,
                status,
                installation: installed ? effectiveInstallation : null,
                ...(isRuntimeNativeMcp(component)
                    ? {
                          mcpServer: {
                              publicationId: publicationId ?? null,
                              publicationScope,
                              accessEnabled,
                              status:
                                  publication && accessEnabled ? publication.status : publication ? 'disabled' : null,
                              endpoint: publication
                                  ? mcpPublicationPublicUrl(
                                        this.configService,
                                        `/api/mcp/p/${encodeURIComponent(publication.slug)}`
                                    )
                                  : null,
                              protocolVersion:
                                  readInstallationString(effectiveInstallation?.config, 'protocolVersion') ?? null,
                              transport: 'streamable-http' as const,
                              syncError: readInstallationString(effectiveInstallation?.config, 'syncError') ?? null,
                              syncFailedAt:
                                  readInstallationString(effectiveInstallation?.config, 'syncFailedAt') ?? null
                          }
                      }
                    : {})
            }
        })
    }

    private async findInstallationsForTarget(
        workspaceId: string | null,
        xpertId: string | null,
        pluginName: string,
        agentKey?: string
    ) {
        const query = this.installationRepo
            .createQueryBuilder('installation')
            .where('installation.pluginName = :pluginName', { pluginName })
            .orderBy('installation.updatedAt', 'DESC')
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
            }
        } else {
            query.andWhere('installation.xpertId IS NULL')
        }
        return query.getMany()
    }

    private findTenantScopedInstallations(pluginName: string) {
        const query = this.installationRepo
            .createQueryBuilder('installation')
            .where('installation.pluginName = :pluginName', { pluginName })
            .andWhere('installation.tenantId = :installationTenantId', {
                installationTenantId: RequestContext.currentTenantId()
            })
            .andWhere('installation.organizationId IS NULL')
            .andWhere('installation.workspaceId IS NULL')
            .andWhere('installation.xpertId IS NULL')
            .andWhere('installation.agentKey IS NULL')
            .orderBy('installation.updatedAt', 'DESC')
        return query.getMany()
    }

    private async findPluginSkillPackages(
        workspaceId: string,
        pluginName: string,
        components: Array<Pick<PluginBundleComponentRegistration, 'componentType' | 'componentKey'>>
    ) {
        const sharedSkillIds = components
            .filter((component) => component.componentType === PLUGIN_COMPONENT_TYPE.SKILL)
            .map((component) => pluginSkillSharedId(pluginName, component.componentKey))
        if (!sharedSkillIds.length) {
            return new Map<string, SkillPackage>()
        }

        const packages = await this.skillPackageRepo.find({
            where: {
                workspaceId,
                sharedSkillId: In(sharedSkillIds)
            },
            order: {
                updatedAt: 'DESC'
            }
        })
        const grouped = new Map<string, SkillPackage>()
        for (const skillPackage of packages) {
            if (skillPackage.sharedSkillId && !grouped.has(skillPackage.sharedSkillId)) {
                grouped.set(skillPackage.sharedSkillId, skillPackage)
            }
        }
        return grouped
    }

    private async findSkillPackagesByInstallationRuntimeId(
        workspaceId: string,
        installations: Array<Pick<PluginResourceInstallation, 'runtimeType' | 'runtimeId'>>
    ) {
        const runtimeIds = installations
            .filter(
                (installation) =>
                    installation.runtimeType === PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE && !!installation.runtimeId
            )
            .map((installation) => installation.runtimeId as string)
        if (!runtimeIds.length) {
            return new Map<string, SkillPackage>()
        }

        const packages = await this.skillPackageRepo.find({
            where: {
                workspaceId,
                id: In(runtimeIds)
            }
        })
        return new Map(packages.filter((item) => !!item.id).map((item) => [item.id as string, item]))
    }
}

function isRuntimeNativeMcp(component: PluginBundleComponentRegistration) {
    const metadata = component.metadata
    return !!metadata && typeof metadata === 'object' && Reflect.get(metadata, 'runtimeDiscovered') === true
}

function readInstallationString(value: unknown, key: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const field = Reflect.get(value, key)
    return typeof field === 'string' && field ? field : undefined
}

function isTenantScopedProvider(pluginName: string, source: StrategySource, loadedPlugins: LoadedPluginRecord[]) {
    if (source.kind !== 'plugin') return false
    const normalizedPluginName = normalizePluginName(pluginName)
    const loaded = loadedPlugins.find(
        (plugin) =>
            (plugin.scopeKey ?? plugin.organizationId) === source.scopeKey &&
            [plugin.name, plugin.packageName, plugin.instance?.meta?.name]
                .filter((value): value is string => typeof value === 'string')
                .some((value) => normalizePluginName(value) === normalizedPluginName)
    )
    return normalizePluginLevel(loaded?.level ?? loaded?.instance?.meta?.level) !== PLUGIN_LEVEL.ORGANIZATION
}

function normalizePluginLevel(value: unknown): PluginLevel {
    if (value === PLUGIN_LEVEL.SYSTEM || value === PLUGIN_LEVEL.TENANT) return value
    return PLUGIN_LEVEL.ORGANIZATION
}
