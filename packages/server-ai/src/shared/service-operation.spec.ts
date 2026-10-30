import { ForbiddenException } from '@nestjs/common'
import { AIPermissionsEnum, IUser, IXpertWorkspace, RolesEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
    currentServiceOperation,
    resolveServiceOperationUserId,
    runWithServiceOperation,
    serviceWorkspaceScopeAllows,
    ServiceOperationScope
} from './service-operation'
import { assertAuthoringUser } from './authoring-access'

const scope: ServiceOperationScope = {
    tenantId: 'tenant',
    organizationId: 'organization',
    actorId: 'actor',
    subjectId: 'customer',
    application: { pluginName: '@test/application', appName: 'example' }
}
const actor = (name: string, permissions: string[] = []): IUser => ({
    id: scope.actorId,
    tenantId: scope.tenantId,
    type: UserType.COMMUNICATION,
    roleId: 'role',
    role: {
        id: 'role',
        name,
        rolePermissions: permissions.map((permission) => ({
            tenantId: scope.tenantId,
            roleId: 'role',
            permission,
            enabled: true,
            role: { id: 'role', name }
        }))
    }
})
const workspace = (overrides: Partial<IXpertWorkspace> = {}): IXpertWorkspace => ({
    name: 'Application workspace',
    status: 'active',
    ownerId: scope.actorId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    settings: { system: { kind: 'plugin-app', ...scope.application } },
    ...overrides
})

describe('service operation scope limits ordinary permissions', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue(null)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(scope.actorId)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(actor('custom-service'))
    })
    afterEach(() => jest.restoreAllMocks())
    it('attributes usage to the beneficiary only for the same trusted actor and scope', async () => {
        const identity = { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.actorId }
        expect(resolveServiceOperationUserId(identity)).toBe(scope.actorId)
        await runWithServiceOperation(scope, async () => {
            expect(resolveServiceOperationUserId(identity)).toBe(scope.subjectId)
            for (const field of ['tenantId', 'organizationId', 'userId'] as const) {
                const other = { ...identity, [field]: 'other' }
                expect(resolveServiceOperationUserId(other)).toBe(other.userId)
            }
            jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ ...actor('ordinary'), type: UserType.USER })
            expect(resolveServiceOperationUserId(identity)).toBe(scope.actorId)
        })
    })
    it('grants no authoring permission just because a service operation exists', async () => {
        await runWithServiceOperation(scope, async () => {
            expect(currentServiceOperation()).toBe(scope)
            expect(assertAuthoringUser).toThrow(ForbiddenException)
        })
    })
    it.each([RolesEnum.APP_USER, RolesEnum.ADMIN, 'BID_CUSTOMER'])('uses permissions, not role name %s', (name) => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(actor(name))
        expect(assertAuthoringUser).toThrow(ForbiddenException)
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(actor(name, [AIPermissionsEnum.XPERT_EDIT]))
        expect(assertAuthoringUser).not.toThrow()
        expect(serviceWorkspaceScopeAllows(workspace())).toBe(false)
    })
    it.each(['actorId', 'tenantId', 'organizationId'] as const)('rejects a mismatched %s', async (field) => {
        await runWithServiceOperation({ ...scope, [field]: 'different' }, async () => {
            expect(currentServiceOperation()).toBeNull()
            expect(serviceWorkspaceScopeAllows(workspace())).toBe(false)
        })
    })
    it('limits a service account to the declared application workspace', async () => {
        await runWithServiceOperation(scope, async () => {
            expect(serviceWorkspaceScopeAllows(workspace())).toBe(true)
            for (const candidate of [
                workspace({ tenantId: 'different' }),
                workspace({ organizationId: 'different' }),
                workspace({ settings: {} }),
                workspace({ settings: { system: { kind: 'plugin-app', ...scope.application, appName: 'other' } } })
            ])
                expect(serviceWorkspaceScopeAllows(candidate)).toBe(false)
        })
        expect(currentServiceOperation()).toBeNull()
    })
    it('isolates overlapping scopes and cleans up after failure', async () => {
        const other = { ...scope, application: { ...scope.application, appName: 'other' } }
        await Promise.all(
            [scope, other].map((current) =>
                runWithServiceOperation(current, async () => {
                    await Promise.resolve()
                    expect(currentServiceOperation()).toBe(current)
                })
            )
        )
        await expect(
            runWithServiceOperation(scope, async () => {
                throw new Error('failed')
            })
        ).rejects.toThrow('failed')
        expect(currentServiceOperation()).toBeNull()
    })
})
