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

export type HandoffLaneName = 'main' | 'subagent' | 'cron' | 'nested';
export type HandoffRunSource = 'chat' | 'xpert' | 'lark' | 'analytics' | 'api';

export interface CoreHandoffMessage {
  id: string;
  type: string;
  version: number;
  tenantId: string;
  organizationId?: string;
  userId?: string;
  sessionKey: string;
  threadId?: string;
  conversationId?: string;
  sourceAgent?: string;
  targetAgent?: string;
  businessKey: string;
  attempt: number;
  maxAttempts: number;
  enqueuedAt: number;
  traceId: string;
  parentMessageId?: string;
  source?: HandoffRunSource;
  requestedLane?: HandoffLaneName;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface CoreHandoffProcessContext {
  runId: string;
  traceId: string;
  abortSignal: AbortSignal;
  emit?: (event: unknown) => void;
}

export type CoreHandoffProcessResult =
  | {
      status: 'ok';
      outbound?: CoreHandoffMessage[];
    }
  | {
      status: 'retry';
      delayMs: number;
      reason?: string;
    }
  | {
      status: 'dead';
      reason: string;
    };

export interface CoreHandoffApi {
  enqueue(
    message: CoreHandoffMessage,
    options?: { delayMs?: number }
  ): Promise<{ id: string }>;
  enqueueAndWait(
    message: CoreHandoffMessage,
    options?: {
      delayMs?: number;
      timeoutMs?: number;
      onEvent?: (event: unknown) => void;
    }
  ): Promise<CoreHandoffProcessResult>;
  abortByRunId(runId: string, reason?: string): boolean;
  abortBySessionKey(sessionKey: string, reason?: string): string[];
  abortByIntegration(integrationId: string, reason?: string): string[];
  getIntegrationRunCount(integrationId: string): number;
  getIntegrationRunIds(integrationId: string): string[];
}

export const CORE_PLUGIN_API_TOKENS = {
  config: Symbol('core:config') as CorePluginApiToken<CoreConfigApi>,
  cache: Symbol('core:cache') as CorePluginApiToken<CoreCacheApi>,
  integration: Symbol('core:integration') as CorePluginApiToken<CoreIntegrationApi>,
  user: Symbol('core:user') as CorePluginApiToken<CoreUserApi>,
  role: Symbol('core:role') as CorePluginApiToken<CoreRoleApi>,
  i18n: Symbol('core:i18n') as CorePluginApiToken<CoreI18nApi>,
  chat: Symbol('core:chat') as CorePluginApiToken<CoreChatApi>,
  handoff: Symbol('core:handoff') as CorePluginApiToken<CoreHandoffApi>
} as const;
