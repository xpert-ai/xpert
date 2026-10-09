// Invariants: preparation and discard lock the scoped installation row. Workspace creation
// and its installation reference commit together; configuration never publishes an Assistant.
// Credentials remain in the existing toolset APIs. Closing setup never deletes configuration.
import {
    PLUGIN_APPLICATION_INSTALLATION_STATUS as Status,
    IPluginApplicationInstallation,
    PluginApplicationToolsetSelection,
    PluginTemplateApplicationSummary,
    resolveI18nText
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { t } from 'i18next'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { PluginApplicationInstallation } from '../plugin-application-installation.entity'
import { PluginApplicationToolsetsService } from '../application-toolsets/plugin-application-toolsets.service'

export interface ResolvedApplication {
    application: PluginTemplateApplicationSummary
    pluginVersion: string | null
    templateId: string
    templateVersion: string | null
}

export function canDiscardApplicationConfiguration(installation: IPluginApplicationInstallation) {
    return (
        [Status.CONFIGURING, Status.FAILED].some((status) => status === installation.status) &&
        !installation.xpertId &&
        !installation.knowledgebaseIds?.length &&
        Object.keys(installation.resourceRefs ?? {}).every((key) => key === 'workspace' || key.startsWith('toolset:'))
    )
}

@Injectable()
export class PluginApplicationSetupService {
    constructor(
        @InjectRepository(PluginApplicationInstallation)
        private readonly installations: Repository<PluginApplicationInstallation>,
        private readonly access: XpertWorkspaceAccessService,
        private readonly toolsets: PluginApplicationToolsetsService
    ) {}

    async prepare(resolved: ResolvedApplication) {
        const scope = this.scope(resolved.application)
        return this.installations.manager.transaction(async (manager) => {
            const repository = manager.getRepository(PluginApplicationInstallation)
            await repository
                .createQueryBuilder()
                .insert()
                .values({
                    ...scope,
                    declaredScope: resolved.application.scope,
                    status: Status.CONFIGURING,
                    pluginVersion: resolved.pluginVersion,
                    templateId: resolved.templateId,
                    templateVersion: resolved.templateVersion,
                    createdById: RequestContext.currentUserId(),
                    updatedById: RequestContext.currentUserId()
                })
                .orIgnore()
                .execute()
            const installation = await this.lock(manager, resolved.application)
            if (installation.status === Status.INITIALIZING) this.conflict()
            const workspaces = manager.getRepository(XpertWorkspace)
            const workspace = installation.workspaceId
                ? await workspaces.findOneBy({
                      id: installation.workspaceId,
                      tenantId: installation.tenantId,
                      organizationId: installation.organizationId
                  })
                : null
            if (workspace) {
                await this.access.assertCanAuthor(workspace.id)
                return installation
            }
            if (!canDiscardApplicationConfiguration(installation)) this.conflict()
            const application = resolved.application
            const localized = (value: Parameters<typeof resolveI18nText>[0], fallback: string) =>
                resolveI18nText(value, RequestContext.getLanguageCode()) ?? fallback
            const prepared = await workspaces.save(
                workspaces.create({
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    createdById: RequestContext.currentUserId(),
                    updatedById: RequestContext.currentUserId(),
                    ownerId: RequestContext.currentUserId(),
                    name: localized(application.config.workspace.name, 'Application Workspace'),
                    description: localized(application.config.workspace.description, ''),
                    status: 'active',
                    settings: {
                        access: { visibility: 'private' },
                        system: { kind: 'plugin-app', pluginName: application.pluginName, appName: application.appName }
                    }
                })
            )
            installation.workspaceId = prepared.id
            installation.resourceRefs = { workspace: prepared.id }
            installation.status = Status.CONFIGURING
            installation.errorCode = null
            installation.errorMessage = null
            return repository.save(installation)
        })
    }

    async bind(application: PluginTemplateApplicationSummary, selection: PluginApplicationToolsetSelection) {
        return this.installations.manager.transaction(async (manager) => {
            const installation = await this.lock(manager, application)
            if (!canDiscardApplicationConfiguration(installation) || !installation.workspaceId) this.conflict()
            await this.access.assertCanAuthor(installation.workspaceId)
            await this.toolsets.bind(application, selection, installation, manager)
            return installation
        })
    }

    async discard(application: PluginTemplateApplicationSummary) {
        return this.installations.manager.transaction(async (manager) => {
            const installation = await this.lock(manager, application)
            if (!canDiscardApplicationConfiguration(installation)) this.conflict()
            if (installation.workspaceId) {
                const workspaces = manager.getRepository(XpertWorkspace)
                const workspace = await workspaces.findOne({
                    where: {
                        id: installation.workspaceId,
                        tenantId: installation.tenantId,
                        organizationId: installation.organizationId
                    },
                    lock: { mode: 'pessimistic_write' }
                })
                if (workspace) {
                    await this.access.assertCanManage(workspace.id)
                    const owner = workspace.settings?.system
                    if (
                        owner?.kind !== 'plugin-app' ||
                        owner.pluginName !== application.pluginName ||
                        owner.appName !== application.appName
                    )
                        this.conflict()
                    // Refuse cleanup if the prepared Workspace has since been used for other resources.
                    // The Workspace row lock also blocks new FK references until this transaction ends.
                    for (const metadata of manager.connection.entityMetadatas) {
                        if (
                            metadata.target === XpertToolset ||
                            metadata.target === PluginApplicationInstallation ||
                            !metadata.columns.some((column) => column.propertyName === 'workspaceId')
                        )
                            continue
                        if (
                            await manager
                                .getRepository(metadata.target)
                                .createQueryBuilder('resource')
                                .withDeleted()
                                .where('resource.workspaceId = :workspaceId', { workspaceId: workspace.id })
                                .getExists()
                        )
                            this.conflict()
                    }
                    await manager.getRepository(XpertToolset).delete({
                        workspaceId: workspace.id,
                        tenantId: installation.tenantId,
                        organizationId: installation.organizationId
                    })
                    await workspaces.delete({
                        id: workspace.id,
                        tenantId: installation.tenantId,
                        organizationId: installation.organizationId
                    })
                }
            }
            await manager
                .getRepository(PluginApplicationInstallation)
                .delete({ id: installation.id, ...this.scope(application) })
        })
    }

    private async lock(manager: EntityManager, application: PluginTemplateApplicationSummary) {
        const installation = await manager.getRepository(PluginApplicationInstallation).findOne({
            where: this.scope(application),
            lock: { mode: 'pessimistic_write' }
        })
        if (!installation) this.conflict()
        return installation
    }

    private scope(application: PluginTemplateApplicationSummary) {
        const tenantId = RequestContext.currentTenantId(),
            organizationId = RequestContext.getOrganizationId()
        if (!tenantId || !organizationId || !RequestContext.currentUserId()) {
            throw new BadRequestException(
                t('server-ai:Error.ApplicationSetupScopeRequired', {
                    defaultValue: 'Select an organization before configuring the application.'
                })
            )
        }
        return {
            tenantId,
            organizationId,
            scopeKey: organizationId,
            pluginName: application.pluginName,
            appName: application.appName
        }
    }

    private conflict(): never {
        throw new ConflictException(
            t('server-ai:Error.ApplicationSetupConflict', {
                defaultValue:
                    'The application state has changed or its Workspace contains other resources. Refresh setup before continuing.'
            })
        )
    }
}
