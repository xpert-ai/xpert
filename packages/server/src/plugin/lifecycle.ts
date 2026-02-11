import type { INestApplicationContext } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  CORE_PLUGIN_API_TOKENS,
  createPluginLogger,
  INTEGRATION_PERMISSION_SERVICE_TOKEN,
  USER_PERMISSION_SERVICE_TOKEN
} from '@xpert-ai/plugin-sdk';
import type { PluginContext } from '@xpert-ai/plugin-sdk';
import type { Permissions } from '@xpert-ai/plugin-sdk';
import { createCorePluginApi } from './core-plugin-api';

const PROTECTED_PERMISSION_TOKENS: Record<string, string> = {
  [INTEGRATION_PERMISSION_SERVICE_TOKEN]: 'integration',
  [USER_PERMISSION_SERVICE_TOKEN]: 'user',
}

const CORE_API_TOKENS = new Set(Object.values(CORE_PLUGIN_API_TOKENS));

function tryResolveFromNest(app: INestApplicationContext, token: any): { found: boolean; value?: any } {
  try {
    return {
      found: true,
      value: app.get(token, { strict: false }),
    }
  } catch {
    return { found: false }
  }
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
    app: app as unknown as INestApplicationContext,
    config,
    logger: createPluginLogger(`plugin:${name}`),
    resolve: (token) => {
      assertPermissionForToken(name, token, permissionTypes)
      const currentApp = (ctx.app ?? (ctx.module as unknown as INestApplicationContext)) as INestApplicationContext
      if (!currentApp || typeof currentApp.get !== 'function') {
        throw new Error(`Plugin '${name}' context is not bound to a Nest application context yet.`)
      }

      const directResolution = tryResolveFromNest(currentApp, token)
      if (directResolution.found) {
        return directResolution.value
      }

      if (CORE_API_TOKENS.has(token)) {
        const coreApi = createCorePluginApi(currentApp)
        if (coreApi.has(token)) {
          return coreApi.get(token)
        }
      }

      throw new Error(`Plugin '${name}' could not resolve '${stringifyToken(token)}' from the current Nest context.`)
    },
  }
  return ctx
}
