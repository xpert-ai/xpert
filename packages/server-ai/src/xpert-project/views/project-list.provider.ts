import { BadRequestException, ForbiddenException } from '@nestjs/common'
import {
    AGENT_WORKBENCH_SLOT, AIPermissionsEnum, SecretTokenBindingType,
    type XpertExtensionViewManifest, type XpertResolvedViewHostContext, type XpertViewQuery
} from '@xpert-ai/contracts'
import { RequestContext, ViewExtensionProvider, type IXpertViewExtensionProvider } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod'
import { XpertProjectFeatureGuard } from '../guards/project-feature.guard'
import { XpertProjectService } from '../project.service'
import { projectRemoteEntry } from './project-remote-entry'

const provider = 'platform.project-list'
const parameters = z.object({
    manageableOnly: z.boolean().optional(),
    applicationKey: z.string().min(1).optional(),
    projectTypeKey: z.string().min(1).optional(),
    unclassified: z.boolean().optional()
}).strict()

@ViewExtensionProvider(provider)
export class ProjectListViewProvider implements IXpertViewExtensionProvider {
    constructor(private readonly projects: XpertProjectService, private readonly feature: XpertProjectFeatureGuard) {}

    supports(context: XpertResolvedViewHostContext) {
        const actor = RequestContext.currentApiPrincipal()
        return context.hostType === 'agent' && !!context.userId && context.userId === RequestContext.currentUserId()
            && context.tenantId === RequestContext.currentTenantId()
            && (context.organizationId ?? null) === (RequestContext.getOrganizationId() ?? null)
            && (actor?.principalType !== 'client_secret' || actor.clientSecretBindingType === SecretTokenBindingType.USER_XPERT)
            && RequestContext.hasPermissions([AIPermissionsEnum.XPERT_PROJECT_VIEW])
    }

    getViewManifests(context: XpertResolvedViewHostContext, slot: string): XpertExtensionViewManifest[] {
        if (slot !== AGENT_WORKBENCH_SLOT || !this.supports(context)) return []
        return [{
            key: 'list', title: { en_US: 'Project list', zh_Hans: '项目列表' }, hostType: 'agent', slot,
            icon: { type: 'svg', value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7V5h6l2 2h10v12H3z"/><path d="M3 10h18"/></svg>' },
            activation: { requiredFeatures: ['project.tasks'] },
            workbench: { openMode: 'on-demand', menu: { enabled: true, order: 49 } },
            source: { provider }, refreshable: true,
            view: { type: 'remote_component', runtime: 'react', protocolVersion: 1,
                component: { isolation: 'iframe', entry: 'project-list' }, dataSource: { mode: 'platform' } },
            dataSource: { mode: 'platform', cache: { enabled: false },
                querySchema: { supportsPagination: true, supportsSearch: true, supportsParameters: true, defaultPageSize: 25 } },
            clientCommands: [{ key: 'workbench.navigation.open', label: { en_US: 'Open project view', zh_Hans: '打开项目视图' } }]
        }]
    }

    async getViewData(context: XpertResolvedViewHostContext, _viewKey: string, query: XpertViewQuery) {
        if (!this.supports(context)) throw new ForbiddenException(t('server-ai:Error.ProjectPermissionRequired'))
        await this.feature.canActivate()
        const parsed = parameters.safeParse(query.parameters ?? {})
        if (!parsed.success) throw new BadRequestException(t('server:ViewExtension.Errors.QueryParameters'))
        const { manageableOnly, ...filter } = parsed.data
        const take = Math.min(100, Math.max(1, query.pageSize ?? 25))
        const skip = (Math.max(1, query.page ?? 1) - 1) * take
        const { items, types, total, assistantName } = await this.projects.listAssistantProjects({
            xpertId: context.hostId, status: 'all', manageableOnly, skip, take, filter: { ...filter, search: query.search }
        })
        return {
            items: items.map(({ id, name, description, applicationKey, projectTypeKey, projectTypeSnapshot, updatedAt, status, myRole, canEdit, canManage }) =>
                ({ id, name, description, applicationKey, projectTypeKey, typeTitle: projectTypeSnapshot?.title, updatedAt, archived: status === 'archived', myRole, canEdit, canManage })),
            total,
            summary: { assistantName, types: types.map(({ applicationKey, projectTypeKey, snapshot }) =>
                ({ applicationKey, projectTypeKey, title: snapshot?.title })) }
        }
    }

    getRemoteComponentEntry() {
        return projectRemoteEntry('project-list', 'Project list')
    }
}
