import {
    IPluginResourceComponentState,
    PLUGIN_COMPONENT_TYPE,
    PLUGIN_RESOURCE_INSTALLATION_STATUS,
    PLUGIN_RESOURCE_RUNTIME_TYPE
} from '@xpert-ai/contracts'
import {
    LOADED_PLUGINS,
    LoadedPluginRecord,
    normalizePluginName,
    PluginBundleComponentRegistration
} from '@xpert-ai/server-core'
import { BadRequestException, Inject, Optional } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { SkillPackage } from '../../../skill-package/skill-package.entity'
import { XpertService } from '../../../xpert/xpert.service'
import { XpertWorkspaceAccessService } from '../../../xpert-workspace'
import {
    isPluginResourceInstallableForTarget,
    pluginResourceComponentStateKey,
    pluginSkillSharedId,
    readPluginResourceComponents,
    resolveLoadedPluginResourceRoot
} from '../../plugin-resource-components'
import { PluginResourceInstallation } from '../../plugin-resource-installation.entity'
import { ListPluginResourceComponentStatesQuery } from '../list-component-states.query'

@QueryHandler(ListPluginResourceComponentStatesQuery)
export class ListPluginResourceComponentStatesHandler implements IQueryHandler<ListPluginResourceComponentStatesQuery> {
    constructor(
        @InjectRepository(PluginResourceInstallation)
        private readonly installationRepo: Repository<PluginResourceInstallation>,
        @InjectRepository(SkillPackage)
        private readonly skillPackageRepo: Repository<SkillPackage>,
        private readonly workspaceAccess: XpertWorkspaceAccessService,
        private readonly xpertService: XpertService,
        @Optional()
        @Inject(LOADED_PLUGINS)
        private readonly loadedPlugins: LoadedPluginRecord[] = []
    ) {}

    async execute(query: ListPluginResourceComponentStatesQuery): Promise<IPluginResourceComponentState[]> {
        const pluginName = normalizePluginName(query.pluginName)
        const input = query.input
        const xpert = input.xpertId ? await this.xpertService.getTeam(input.xpertId) : null
        const workspaceId = xpert?.workspaceId ?? input.workspaceId
        if (!workspaceId) {
            throw new BadRequestException('workspaceId is required')
        }
        if (input.workspaceId && xpert?.workspaceId && input.workspaceId !== xpert.workspaceId) {
            throw new BadRequestException('workspaceId does not match Xpert workspace')
        }
        await this.workspaceAccess.assertCanRead(workspaceId)

        const target = input.target ?? (input.xpertId ? 'xpert' : 'workspace')
        const rootDir = resolveLoadedPluginResourceRoot(pluginName, this.loadedPlugins)
        const components = readPluginResourceComponents(pluginName, rootDir).filter((component) =>
            isPluginResourceInstallableForTarget(component.componentType, target)
        )
        if (!components.length) {
            return []
        }

        const installations = await this.findInstallationsForTarget(
            workspaceId,
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

        const skillPackagesBySharedId =
            target === 'workspace'
                ? await this.findPluginSkillPackages(workspaceId, pluginName, components)
                : new Map<string, SkillPackage>()
        const skillPackagesById =
            target === 'workspace'
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
                installation: installed ? effectiveInstallation : null
            }
        })
    }

    private async findInstallationsForTarget(
        workspaceId: string,
        xpertId: string | null,
        pluginName: string,
        agentKey?: string
    ) {
        const query = this.installationRepo
            .createQueryBuilder('installation')
            .where('installation.workspaceId = :workspaceId', { workspaceId })
            .andWhere('installation.pluginName = :pluginName', { pluginName })
            .orderBy('installation.updatedAt', 'DESC')
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
