// A service operation narrows an authenticated service account's normal permissions.
// It never grants an operation or replaces organization membership / resource ACLs.
import { AsyncLocalStorage } from 'node:async_hooks'
import { IUser, IXpertWorkspace, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'

export interface ServiceOperationScope {
    actorId: string
    tenantId: string
    organizationId: string
    subjectId: string
    application: { pluginName: string; appName: string }
}

const operations = new AsyncLocalStorage<ServiceOperationScope>()

export function runWithServiceOperation<T>(scope: ServiceOperationScope, work: () => Promise<T>): Promise<T> {
    return operations.run(scope, work)
}

export function currentServiceOperation(): ServiceOperationScope | null {
    const scope = operations.getStore()
    const user = RequestContext.currentUser()
    return scope &&
        !RequestContext.currentApiPrincipal() &&
        user?.type === UserType.COMMUNICATION &&
        user.id === scope.actorId &&
        RequestContext.currentUserId() === scope.actorId &&
        user.tenantId === scope.tenantId &&
        RequestContext.currentTenantId() === scope.tenantId &&
        RequestContext.getOrganizationId() === scope.organizationId
        ? scope
        : null
}

/** Attribute service-operation usage to its beneficiary only within the verified execution scope. */
export function resolveServiceOperationUserId(actor: { tenantId: string; organizationId?: string; userId: string }): string {
    const scope = currentServiceOperation()
    return scope && actor.tenantId === scope.tenantId && actor.organizationId === scope.organizationId &&
        actor.userId === scope.actorId ? scope.subjectId : actor.userId
}

export function serviceApplicationScopeAllows(application: { pluginName?: string; appName?: string; scope?: string }) {
    if (RequestContext.currentUser()?.type !== UserType.COMMUNICATION || RequestContext.currentApiPrincipal())
        return true
    const scope = currentServiceOperation()
    return (
        !!scope &&
        application.scope === 'organization' &&
        application.pluginName === scope.application.pluginName &&
        application.appName === scope.application.appName
    )
}

export function serviceWorkspaceScopeAllows(workspace: IXpertWorkspace) {
    if (RequestContext.currentUser()?.type !== UserType.COMMUNICATION || RequestContext.currentApiPrincipal())
        return true
    const scope = currentServiceOperation(),
        system = workspace.settings?.system
    return (
        !!scope &&
        workspace.tenantId === scope.tenantId &&
        workspace.organizationId === scope.organizationId &&
        system?.kind === 'plugin-app' &&
        system.pluginName === scope.application.pluginName &&
        system.appName === scope.application.appName
    )
}

/** Used for users loaded outside an HTTP request, such as registration/bootstrap jobs. */
export function userHasPermission(user: IUser, permission: string): boolean {
    const roleId = user.roleId ?? user.role?.id
    return (
        !!user.id &&
        !!user.tenantId &&
        !!roleId &&
        user.isActive !== false &&
        !!user.role?.rolePermissions?.some(
            (grant) =>
                grant.enabled &&
                grant.permission === permission &&
                grant.tenantId === user.tenantId &&
                grant.roleId === roleId
        )
    )
}
