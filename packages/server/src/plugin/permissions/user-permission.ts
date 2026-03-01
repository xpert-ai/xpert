import { RolesEnum } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import {
  Permissions,
  RequirePermissionOperation,
  UserPermissionOperation,
  UserPermissionService,
  UserProvisionByThirdPartyIdentityInput
} from '@xpert-ai/plugin-sdk'
import { RoleService } from '../../role'
import { UserService } from '../../user'
import {
  createOperationGuardedPermissionService,
  resolvePermissionOperations
} from './service-permission-guard'

const USER_ALL_OPERATIONS = ['read', 'write', 'update', 'delete'] as const

function resolveUserOperations(permissions: Permissions): Set<UserPermissionOperation> {
  return resolvePermissionOperations<UserPermissionOperation>(
    permissions,
    'user',
    USER_ALL_OPERATIONS,
    (operation): operation is UserPermissionOperation =>
      operation === 'read' ||
      operation === 'write' ||
      operation === 'update' ||
      operation === 'delete'
  )
}

export function createGuardedUserPermissionService(
  pluginName: string,
  service: UserPermissionService,
  permissions: Permissions
): UserPermissionService {
  return createOperationGuardedPermissionService<UserPermissionOperation, UserPermissionService>(
    pluginName,
    'user',
    service,
    permissions,
    resolveUserOperations
  )
}

@Injectable()
export class PluginUserPermissionService implements UserPermissionService {
  constructor(private readonly moduleRef: ModuleRef) {}

  @RequirePermissionOperation('user', 'read')
  async read<TUser = any>(criteria: Record<string, any>): Promise<TUser | null> {
    if (!criteria || typeof criteria !== 'object') {
      return null
    }

    let userService: UserService
    try {
      userService = this.moduleRef.get<UserService>(UserService, {
        strict: false
      })
    } catch {
      return null
    }
    if (!userService) {
      return null
    }

    try {
      return (await userService.findOneByWhereOptions(criteria as any)) as TUser
    } catch {
      return null
    }
  }

  @RequirePermissionOperation('user', 'write')
  async provisionByThirdPartyIdentity<TUser = any>(
    input: UserProvisionByThirdPartyIdentityInput
  ): Promise<TUser | null> {
    if (!input?.tenantId || !input?.thirdPartyId) {
      return null
    }

    const existing = await this.read<TUser>({
      tenantId: input.tenantId,
      thirdPartyId: input.thirdPartyId
    })
    if (existing) {
      return existing
    }

    let userService: UserService
    try {
      userService = this.moduleRef.get<UserService>(UserService, {
        strict: false
      })
    } catch {
      return null
    }
    if (!userService) {
      return null
    }

    let roleId = input.defaults?.roleId
    const roleName = input.defaults?.roleName || RolesEnum.EMPLOYEE
    if (!roleId && roleName) {
      try {
        const roleService = this.moduleRef.get<RoleService>(RoleService, {
          strict: false
        })
        if (roleService) {
          const role = await roleService.findOneByWhereOptions({
            tenantId: input.tenantId,
            name: roleName
          } as any)
          roleId = role?.id
        }
      } catch {
        //
      }
    }

    const profile = input.profile ?? {}
    const sanitizedThirdPartyId = String(input.thirdPartyId).replace(/[^a-zA-Z0-9_]/g, '')
    const fallbackUsernameBase = sanitizedThirdPartyId || `lark_${Date.now().toString(36)}`
    const fallbackUsername =
      fallbackUsernameBase.length >= 20 ? fallbackUsernameBase.slice(0, 20) : fallbackUsernameBase

    const payload = {
      tenantId: input.tenantId,
      thirdPartyId: input.thirdPartyId,
      username: profile.username || fallbackUsername,
      email: profile.email,
      mobile: profile.mobile,
      imageUrl: profile.imageUrl,
      firstName: profile.firstName,
      lastName: profile.lastName,
      preferredLanguage: profile.preferredLanguage,
      ...(roleId ? { roleId } : {})
    } as Record<string, any>

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
        delete payload[key]
      }
    })

    try {
      await userService.create(payload as any)
    } catch {
      // Ignore create race/conflict and try read path below.
    }

    return this.read<TUser>({
      tenantId: input.tenantId,
      thirdPartyId: input.thirdPartyId
    })
  }
}
