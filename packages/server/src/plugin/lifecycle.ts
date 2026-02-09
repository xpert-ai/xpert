import type { INestApplicationContext } from '@nestjs/common';
import { CORE_PLUGIN_API_TOKENS, createPluginLogger } from '@xpert-ai/plugin-sdk';
import type { CoreApiPermission, CorePluginApiTokenName, Permissions, PluginRuntimeContext } from '@xpert-ai/plugin-sdk';
import { createCorePluginApi } from './core-plugin-api';

const RESTRICTED_APP_CONTEXT_ERROR = 'non-code plugin cannot access Nest app context; use ctx.api';

interface PluginContextOptions {
  allowed?: CorePluginApiTokenName[];
  allowResolve?: boolean;
  allowAppContext?: boolean;
  pluginName?: string;
}

function throwRestrictedAppContextError(pluginName?: string): never {
  const message = pluginName
    ? `[plugin:${pluginName}] ${RESTRICTED_APP_CONTEXT_ERROR}`
    : RESTRICTED_APP_CONTEXT_ERROR;
  throw new Error(message);
}

export function createRestrictedPluginAppContext(pluginName?: string): INestApplicationContext {
  return {
    get: () => throwRestrictedAppContextError(pluginName),
    select: () => throwRestrictedAppContextError(pluginName),
    resolve: () => throwRestrictedAppContextError(pluginName),
  } as unknown as INestApplicationContext;
}

export function createPluginContext<TConfig extends object>(
  app: INestApplicationContext,
  name: string,
  config: TConfig,
  options?: PluginContextOptions
): PluginRuntimeContext<TConfig> {
  const allowResolve = options?.allowResolve ?? true;
  const allowAppContext = options?.allowAppContext ?? true;
  return {
    app: allowAppContext ? app : createRestrictedPluginAppContext(options?.pluginName ?? name),
    config,
    logger: createPluginLogger(`plugin:${name}`),
    api: createCorePluginApi(app as any, { allowed: options?.allowed }),
    resolve: allowResolve
      ? (token: any) => app.get(token, { strict: false })
      : () => {
        throw new Error('Plugin context resolve is disabled');
      }
  };
}

export function attachPluginContext<TConfig extends object>(
  ctx: PluginRuntimeContext<TConfig>,
  app: INestApplicationContext,
  options?: PluginContextOptions
): PluginRuntimeContext<TConfig> {
  const allowResolve = options?.allowResolve ?? true;
  const allowAppContext = options?.allowAppContext ?? true;
  ctx.app = allowAppContext ? app : createRestrictedPluginAppContext(options?.pluginName);
  ctx.api = createCorePluginApi(app as any, { allowed: options?.allowed });
  ctx.resolve = allowResolve
    ? (token: any) => app.get(token, { strict: false })
    : () => {
        throw new Error('Plugin context resolve is disabled');
      };
  return ctx;
}

export function resolveCoreApiAllowList(
  plugin: { permissions?: Permissions } | undefined,
  source?: string
): CorePluginApiTokenName[] | undefined {
  const permissions = plugin?.permissions ?? [];
  const coreApi = permissions.find((item) => item.type === 'core-api') as CoreApiPermission | undefined;
  if (coreApi) {
    const allowed = new Set<CorePluginApiTokenName>();
    const validNames = new Set(Object.keys(CORE_PLUGIN_API_TOKENS) as CorePluginApiTokenName[]);
    for (const token of coreApi.tokens ?? []) {
      if (validNames.has(token)) {
        allowed.add(token);
      }
    }
    return Array.from(allowed);
  }

  if (source === 'code') {
    return undefined; // allow all for built-in plugins
  }

  return []; // deny all for non-code plugins unless explicitly declared
}

export function resolvePluginAccessPolicy(
  plugin: { permissions?: Permissions } | undefined,
  source?: string
) {
  return {
    allowed: resolveCoreApiAllowList(plugin, source),
    allowResolve: source === 'code',
    allowAppContext: source === 'code',
  };
}
