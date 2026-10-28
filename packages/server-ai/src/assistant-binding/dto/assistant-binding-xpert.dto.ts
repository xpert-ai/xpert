import type { IXpert } from '@xpert-ai/contracts'
import { Exclude, Expose } from 'class-transformer'

/** Public catalog metadata only; authoring graphs and workspace membership never belong in this response. */
@Exclude()
export class AssistantBindingXpertDTO {
    @Expose() id: IXpert['id']
    @Expose() slug: IXpert['slug']
    @Expose() name: IXpert['name']
    @Expose() type: IXpert['type']
    @Expose() title: IXpert['title']
    @Expose() titleCN: IXpert['titleCN']
    @Expose() description: IXpert['description']
    @Expose() avatar: IXpert['avatar']
    @Expose() version: IXpert['version']
    @Expose() latest: IXpert['latest']
    @Expose() publishAt: IXpert['publishAt']
    @Expose() createdAt: IXpert['createdAt']
    @Expose() updatedAt: IXpert['updatedAt']
    @Expose() createdById: IXpert['createdById']
    @Expose() workspaceId: IXpert['workspaceId']
    @Expose() businessAreaId: IXpert['businessAreaId']
    @Expose() businessArea?: { id: string; name: string }
    @Expose() tags?: Array<{ id: string; name: string }>
    @Expose() workspace?: {
        id: string
        ownerId?: string
        capabilities?: NonNullable<IXpert['workspace']>['capabilities']
    }
    @Expose() options?: Pick<NonNullable<IXpert['options']>, 'workbench' | 'workspaceScope'>

    constructor(xpert: Partial<IXpert>) {
        this.id = xpert.id
        this.slug = xpert.slug
        this.name = xpert.name
        this.type = xpert.type
        this.title = xpert.title
        this.titleCN = xpert.titleCN
        this.description = xpert.description
        this.avatar = xpert.avatar
        this.version = xpert.version
        this.latest = xpert.latest
        this.publishAt = xpert.publishAt
        this.createdAt = xpert.createdAt
        this.updatedAt = xpert.updatedAt
        this.createdById = xpert.createdById
        this.workspaceId = xpert.workspaceId
        this.businessAreaId = xpert.businessAreaId
        this.businessArea = xpert.businessArea && { id: xpert.businessArea.id, name: xpert.businessArea.name }
        this.tags = xpert.tags?.map(({ id, name }) => ({ id, name }))
        const capabilities = xpert.workspace?.capabilities
        this.workspace = xpert.workspace && {
            id: xpert.workspace.id,
            ownerId: xpert.workspace.ownerId,
            capabilities: capabilities && {
                canRead: capabilities.canRead,
                canRun: capabilities.canRun,
                canWrite: capabilities.canWrite,
                canManage: capabilities.canManage
            }
        }
        const workbench = xpert.options?.workbench
        const workspaceScope = xpert.options?.workspaceScope
        this.options =
            workbench || workspaceScope
                ? {
                      workbench: workbench && {
                          initialLayout: workbench.initialLayout,
                          defaultViewKey: workbench.defaultViewKey
                      },
                      workspaceScope: workspaceScope && {
                          mode: workspaceScope.mode,
                          onMissing: workspaceScope.onMissing
                      }
                  }
                : undefined
    }
}
