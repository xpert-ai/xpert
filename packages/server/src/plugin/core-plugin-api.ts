import type { INestApplicationContext } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ConfigService } from '@metad/server-config';
import { I18nService } from 'nestjs-i18n';
import {
  CoreCacheApi,
  CoreChatApi,
  CoreConfigApi,
  CoreI18nApi,
  CoreIntegrationApi,
  CorePluginApi,
  CorePluginApiToken,
  CoreRoleApi,
  CoreUserApi,
  CORE_PLUGIN_API_TOKENS,
} from '@xpert-ai/plugin-sdk';
import type { CorePluginApiTokenName } from '@xpert-ai/plugin-sdk';
import { IntegrationService } from '../integration/integration.service';
import { RoleService } from '../role/role.service';
import { UserService } from '../user/user.service';

type AppLike = INestApplicationContext | { get?: (...args: any[]) => any };

function tryGet<T>(app: AppLike, token: any): T | undefined {
  if (!app || typeof app.get !== 'function') {
    return undefined;
  }
  try {
    return app.get(token, { strict: false });
  } catch {
    return undefined;
  }
}

class DefaultCorePluginApi implements CorePluginApi {
  constructor(private readonly registry: Map<CorePluginApiToken<any>, any>) {}

  get<T>(token: CorePluginApiToken<T>): T {
    if (!this.registry.has(token)) {
      throw new Error('CorePluginApi token is not registered');
    }
    return this.registry.get(token) as T;
  }

  has(token: CorePluginApiToken<any>): boolean {
    return this.registry.has(token);
  }
}

class NotReadyCorePluginApi implements CorePluginApi {
  get<T>(token: CorePluginApiToken<T>): T {
    throw new Error('CorePluginApi is not ready yet. Use ctx.api in onInit/onStart after app bootstrap.');
  }

  has(): boolean {
    return false;
  }
}

export function createCorePluginApi(
  app: AppLike,
  options?: { allowed?: CorePluginApiTokenName[] }
): CorePluginApi {
  if (!app || typeof app.get !== 'function') {
    return new NotReadyCorePluginApi();
  }

  const registry = new Map<CorePluginApiToken<any>, any>();
  const allowed = options?.allowed;
  const restricted = Array.isArray(allowed);
  const allow = (token: CorePluginApiTokenName) => !restricted || allowed.includes(token);

  const configService = tryGet<ConfigService>(app, ConfigService);
  if (configService && allow('config')) {
    const configApi: CoreConfigApi = {
      get: (key, defaultValue) => {
        // First try to get from IEnvironment (typed config)
        const value = configService.get(key as any);
        if (value !== undefined) {
          return value;
        }
        // Fall back to process.env for arbitrary env vars (e.g., REDIS_PASSWORD)
        const envValue = process.env[key as string];
        return envValue !== undefined ? (envValue as any) : (defaultValue as any);
      },
    };
    registry.set(CORE_PLUGIN_API_TOKENS.config, configApi);
  }

  const cacheManager = tryGet<Cache>(app, CACHE_MANAGER);
  if (cacheManager && allow('cache')) {
    const cacheApi: CoreCacheApi = {
      get: (key) => cacheManager.get(key),
      set: async (key, value, ttlMs) => {
        await cacheManager.set(key, value, ttlMs);
      },
      del: async (key) => {
        await cacheManager.del(key);
      },
    };
    registry.set(CORE_PLUGIN_API_TOKENS.cache, cacheApi);
  }

  const integrationService = tryGet<IntegrationService>(app, IntegrationService);
  if (integrationService && allow('integration')) {
    const integrationApi: CoreIntegrationApi = {
      findById: async (id, options) => {
        try {
          return await integrationService.findOne(id, options as any);
        } catch {
          return null;
        }
      },
    };
    registry.set(CORE_PLUGIN_API_TOKENS.integration, integrationApi);
  }

  const userService = tryGet<UserService>(app, UserService);
  if (userService && allow('user')) {
    const userApi: CoreUserApi = {
      findById: async (id, options) => {
        try {
          return await userService.findOne(id, options as any);
        } catch {
          return null;
        }
      },
      findOneBy: async (where) => {
        try {
          return await userService.findOneByWhereOptions(where as any);
        } catch {
          return null;
        }
      },
      create: async (input) => userService.create(input as any),
    };
    registry.set(CORE_PLUGIN_API_TOKENS.user, userApi);
  }

  const roleService = tryGet<RoleService>(app, RoleService);
  if (roleService && allow('role')) {
    const roleApi: CoreRoleApi = {
      findByName: async (tenantId, name) => {
        try {
          return await roleService.findOneByWhereOptions({ tenantId, name } as any);
        } catch {
          return null;
        }
      },
    };
    registry.set(CORE_PLUGIN_API_TOKENS.role, roleApi);
  }

  const i18nService = tryGet<I18nService>(app, I18nService);
  if (i18nService && allow('i18n')) {
    const i18nApi: CoreI18nApi = {
      t: (key, options) => i18nService.t(key, options as any),
    };
    registry.set(CORE_PLUGIN_API_TOKENS.i18n, i18nApi);
  }

  const chatApi = tryGet<CoreChatApi>(app, CORE_PLUGIN_API_TOKENS.chat);
  if (chatApi && allow('chat')) {
    registry.set(CORE_PLUGIN_API_TOKENS.chat, chatApi);
  }

  return new DefaultCorePluginApi(registry);
}
