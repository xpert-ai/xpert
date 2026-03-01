import {
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  Permissions,
  USER_PERMISSION_SERVICE_TOKEN,
  UserPermissionService
} from '@xpert-ai/plugin-sdk'
import { createGuardedUserPermissionService } from './user-permission'

export interface PluginServicePermissionHandler {
  token: any
  permissionType: string
  resolveToken?: any
  cacheKey?: string
  createGuardedService?: (pluginName: string, resolvedService: unknown, permissions: Permissions) => unknown
  unavailableMessage?: (pluginName: string, token: any) => string
}

const PLUGIN_SERVICE_PERMISSION_HANDLERS = new Map<any, PluginServicePermissionHandler>([
  [
    INTEGRATION_PERMISSION_SERVICE_TOKEN,
    {
      token: INTEGRATION_PERMISSION_SERVICE_TOKEN,
      permissionType: 'integration'
    }
  ],
  [
    USER_PERMISSION_SERVICE_TOKEN,
    {
      token: USER_PERMISSION_SERVICE_TOKEN,
      permissionType: 'user',
      cacheKey: 'user',
      createGuardedService: (pluginName, resolvedService, permissions) =>
        createGuardedUserPermissionService(
          pluginName,
          resolvedService as UserPermissionService,
          permissions
        ),
      unavailableMessage: (pluginName) =>
        `Plugin '${pluginName}' attempted to resolve user service but it is not available.`
    }
  ]
])

function stringifyToken(token: any) {
  if (typeof token === 'string') {
    return token
  }
  if (typeof token === 'symbol') {
    return token.toString()
  }
  return token?.name ?? String(token)
}

export function registerPluginServicePermissionHandler(
  handler: PluginServicePermissionHandler
): void {
  PLUGIN_SERVICE_PERMISSION_HANDLERS.set(handler.token, handler)
}

function getPluginServicePermissionHandler(token: any): PluginServicePermissionHandler | undefined {
  return PLUGIN_SERVICE_PERMISSION_HANDLERS.get(token)
}

export function assertPermissionForToken(name: string, token: any, permissionTypes: Set<string>) {
  const requiredPermission = getRequiredPluginPermissionType(token)
  if (!requiredPermission) {
    return
  }
  if (!permissionTypes.has(requiredPermission)) {
    throw new Error(
      `Plugin '${name}' attempted to resolve '${stringifyToken(token)}' without declaring '${requiredPermission}' permission.`
    )
  }
}

export interface PluginPermissionProxyCache {
  guardedServices?: Map<string, unknown>
}

export function getRequiredPluginPermissionType(token: any): string | undefined {
  const handler = getPluginServicePermissionHandler(token)
  return handler?.permissionType
}

export function resolvePluginServiceToken(token: any): any {
  const handler = getPluginServicePermissionHandler(token)
  return handler?.resolveToken ?? token
}

export function guardPluginResolvedService(
  pluginName: string,
  permissions: Permissions,
  token: any,
  resolvedService: unknown,
  cache: PluginPermissionProxyCache
): unknown {
  const handler = getPluginServicePermissionHandler(token)
  if (!handler) {
    return resolvedService
  }

  if (!resolvedService) {
    throw new Error(
      handler.unavailableMessage?.(pluginName, token) ??
        `Plugin '${pluginName}' attempted to resolve '${handler.permissionType}' service but it is not available.`
    )
  }

  if (!handler.createGuardedService) {
    return resolvedService
  }

  if (!cache.guardedServices) {
    cache.guardedServices = new Map()
  }
  const cacheKey = handler.cacheKey ?? handler.permissionType
  if (!cache.guardedServices.has(cacheKey)) {
    cache.guardedServices.set(
      cacheKey,
      handler.createGuardedService(pluginName, resolvedService, permissions)
    )
  }

  return cache.guardedServices.get(cacheKey)
}

export * from './integration-permission'
export * from './user-permission'
export * from './service-permission-guard'