import { Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import {
  CreatePendingBindingInput,
  Permissions,
  RequirePermissionOperation,
  SsoBindingPermission,
  SsoBindingPermissionOperation,
  SsoBindingPermissionService
} from '@xpert-ai/plugin-sdk'
import { PendingSsoBindingChallengeService } from '../../auth/sso/pending-sso-binding-challenge.service'
import {
  createOperationGuardedPermissionService,
  resolvePermissionOperations
} from './service-permission-guard'

const SSO_BINDING_ALL_OPERATIONS = ['create'] as const

function resolveSsoBindingOperations(
  permissions: Permissions
): Set<SsoBindingPermissionOperation> {
  return resolvePermissionOperations<SsoBindingPermissionOperation>(
    permissions,
    'sso_binding',
    SSO_BINDING_ALL_OPERATIONS,
    (operation): operation is SsoBindingPermissionOperation => operation === 'create'
  )
}

function resolveAllowedProviders(permissions: Permissions): Set<string> | null {
  const permission = permissions.find(
    (item): item is SsoBindingPermission => item.type === 'sso_binding'
  )

  if (!permission || !Array.isArray(permission.providers) || permission.providers.length === 0) {
    return null
  }

  return new Set(
    permission.providers.filter(
      (provider): provider is string => typeof provider === 'string' && provider.length > 0
    )
  )
}

export function createGuardedSsoBindingPermissionService(
  pluginName: string,
  service: SsoBindingPermissionService,
  permissions: Permissions
): SsoBindingPermissionService {
  const operationGuardedService =
    createOperationGuardedPermissionService<
      SsoBindingPermissionOperation,
      SsoBindingPermissionService
    >(pluginName, 'sso_binding', service, permissions, resolveSsoBindingOperations)
  const allowedProviders = resolveAllowedProviders(permissions)

  if (!allowedProviders || allowedProviders.size === 0) {
    return operationGuardedService
  }

  return new Proxy(operationGuardedService, {
    get(target, property, receiver) {
      const value = Reflect.get(target as object, property, receiver)
      if (typeof value !== 'function' || property !== 'createPendingBinding') {
        return value
      }

      return (...args: any[]) => {
        const provider = args[0]?.provider
        if (!provider || !allowedProviders.has(provider)) {
          throw new Error(
            `Plugin '${pluginName}' attempted sso_binding provider '${provider}' without declaring it in 'sso_binding.providers'.`
          )
        }

        return value.apply(target, args)
      }
    }
  }) as SsoBindingPermissionService
}

@Injectable()
export class PluginSsoBindingPermissionService implements SsoBindingPermissionService {
  constructor(private readonly moduleRef: ModuleRef) {}

  @RequirePermissionOperation('sso_binding', 'create')
  async createPendingBinding(input: CreatePendingBindingInput) {
    const pendingSsoBindingChallengeService = this.getPendingSsoBindingChallengeService()
    return pendingSsoBindingChallengeService.create(input)
  }

  private getPendingSsoBindingChallengeService(): PendingSsoBindingChallengeService {
    try {
      const service = this.moduleRef.get(PendingSsoBindingChallengeService, {
        strict: false
      })
      if (!service) {
        throw new Error('PendingSsoBindingChallengeService is not available.')
      }
      return service
    } catch {
      throw new Error('PendingSsoBindingChallengeService is not available.')
    }
  }
}
