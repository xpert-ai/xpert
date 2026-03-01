import { ModuleRef } from '@nestjs/core';
import { createPluginLogger } from '@xpert-ai/plugin-sdk';
import type { PluginContext, Permissions } from '@xpert-ai/plugin-sdk';
import {
  guardPluginResolvedService,
  PluginPermissionProxyCache,
  resolvePluginServiceToken,
  assertPermissionForToken
} from './permissions';


export function createPluginContext<TConfig extends object>(
  app: ModuleRef,
  name: string,
  config: TConfig,
  permissions: Permissions = [],
): PluginContext<TConfig> {
  const permissionTypes = new Set(permissions.map((permission) => permission.type))
  const permissionProxyCache: PluginPermissionProxyCache = {}
  const ctx: PluginContext<TConfig> = {
    module: app,
    config,
    logger: createPluginLogger(`plugin:${name}`),
    resolve: <TInput = any, TResult = TInput>(token: any): TResult => {
      assertPermissionForToken(name, token, permissionTypes)
      const currentModule = ctx.module
      if (!currentModule || typeof currentModule.get !== 'function') {
        throw new Error(`Plugin '${name}' context is not bound to a Nest application context yet.`)
      }
      const resolvedToken = resolvePluginServiceToken(token)
      const resolved = currentModule.get(resolvedToken, { strict: false })
      return guardPluginResolvedService(name, permissions, token, resolved, permissionProxyCache) as TResult
    },
  }
  return ctx
}
