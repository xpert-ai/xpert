import type { INestApplicationContext } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { createPluginLogger, INTEGRATION_PERMISSION_SERVICE_TOKEN, USER_PERMISSION_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk';
import type { PluginContext } from '@xpert-ai/plugin-sdk';
import type { Permissions } from '@xpert-ai/plugin-sdk';

const PROTECTED_PERMISSION_TOKENS: Record<string, string> = {
  [INTEGRATION_PERMISSION_SERVICE_TOKEN]: 'integration',
  [USER_PERMISSION_SERVICE_TOKEN]: 'user',
}

function stringifyToken(token: any) {
  if (typeof token === 'string') {
    return token
  }
  if (typeof token === 'symbol') {
    return token.toString()
  }
  return token?.name ?? String(token)
}

function assertPermissionForToken(name: string, token: any, permissionTypes: Set<string>) {
  const requiredPermission = PROTECTED_PERMISSION_TOKENS[token]
  if (!requiredPermission) {
    return
  }
  if (!permissionTypes.has(requiredPermission)) {
    throw new Error(
      `Plugin '${name}' attempted to resolve '${stringifyToken(token)}' without declaring '${requiredPermission}' permission.`
    )
  }
}

export function createPluginContext<TConfig extends object>(
  app: ModuleRef,
  name: string,
  config: TConfig,
  permissions: Permissions = [],
): PluginContext<TConfig> {
  const permissionTypes = new Set(permissions.map((permission) => permission.type))
  const ctx: PluginContext<TConfig> = {
    module: app,
    config,
    logger: createPluginLogger(`plugin:${name}`),
    resolve: (token) => {
      assertPermissionForToken(name, token, permissionTypes)
      const currentApp = ctx.app
      if (!currentApp || typeof currentApp.get !== 'function') {
        throw new Error(`Plugin '${name}' context is not bound to a Nest application context yet.`)
      }
      return currentApp.get(token, { strict: false })
    },
  }
  return ctx
}
