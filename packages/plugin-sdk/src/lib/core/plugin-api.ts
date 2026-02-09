import type { IChatConversation, IChatMessage, IIntegration, IRole, IUser, TChatOptions, TChatRequest } from '@metad/contracts';
import type { Observable } from 'rxjs';

export type CorePluginApiToken<T> = symbol & { __type?: T };
export type CorePluginApiTokenName = keyof typeof CORE_PLUGIN_API_TOKENS;

export interface CorePluginApi {
  get<T>(token: CorePluginApiToken<T>): T;
  has(token: CorePluginApiToken<any>): boolean;
}

export interface CoreConfigApi {
  get<T = any>(key: string, defaultValue?: T): T;
}

export interface CoreCacheApi {
  get<T = any>(key: string): Promise<T | undefined>;
  set<T = any>(key: string, value: T, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
}

export interface CoreIntegrationApi {
  findById(id: string, options?: { relations?: string[] }): Promise<IIntegration | null>;
}

export interface CoreUserApi {
  findById(id: string, options?: { relations?: string[] }): Promise<IUser | null>;
  findOneBy?(where: Record<string, any>): Promise<IUser | null>;
  create?(input: Partial<IUser>): Promise<IUser>;
}

export interface CoreRoleApi {
  findByName(tenantId: string, name: string): Promise<IRole | null>;
}

export interface CoreI18nApi {
  t(key: string, options?: Record<string, any>): string;
}

export interface CoreChatApi {
  chatXpert(
    request: TChatRequest,
    options?: TChatOptions & {
      xpertId?: string;
      isDraft?: boolean;
      fromEndUserId?: string;
      execution?: { id: string };
      tenantId?: string;
      organizationId?: string;
      user?: IUser;
    }
  ): Promise<Observable<MessageEvent>>;
  upsertChatMessage(entity: Partial<IChatMessage>): Promise<void>;
  getChatConversation(id: string, relations?: string[]): Promise<IChatConversation | null>;
}

export const CORE_PLUGIN_API_TOKENS = {
  config: Symbol('core:config') as CorePluginApiToken<CoreConfigApi>,
  cache: Symbol('core:cache') as CorePluginApiToken<CoreCacheApi>,
  integration: Symbol('core:integration') as CorePluginApiToken<CoreIntegrationApi>,
  user: Symbol('core:user') as CorePluginApiToken<CoreUserApi>,
  role: Symbol('core:role') as CorePluginApiToken<CoreRoleApi>,
  i18n: Symbol('core:i18n') as CorePluginApiToken<CoreI18nApi>,
  chat: Symbol('core:chat') as CorePluginApiToken<CoreChatApi>
} as const;
