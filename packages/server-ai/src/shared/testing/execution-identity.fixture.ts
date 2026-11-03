import { AIPermissionsEnum, IUser, UserType } from '@xpert-ai/contracts'
import { ExecutionActorRef } from '@xpert-ai/server-core'
import { createExecutionIdentity } from '../../../../server/src/user/execution-identity/execution-identity'

export function executionIdentityFixture(scope: Omit<ExecutionActorRef, 'kind'>, user: Partial<IUser> = {}) {
    return createExecutionIdentity(
        {
            id: scope.userId,
            tenantId: scope.tenantId,
            isActive: true,
            type: UserType.USER,
            roleId: 'role',
            role: {
                id: 'role',
                name: 'AI_BUILDER',
                rolePermissions: [AIPermissionsEnum.XPERT_VIEW, AIPermissionsEnum.XPERT_EDIT].map((permission) => ({
                    permission,
                    roleId: 'role',
                    tenantId: scope.tenantId,
                    enabled: true,
                    role: { name: 'AI_BUILDER' }
                }))
            },
            ...user
        },
        { ...scope, kind: 'user' }
    )
}
