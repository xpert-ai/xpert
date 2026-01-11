import { PluginMeta } from '@metad/contracts';
import type { DynamicModule, INestApplicationContext } from '@nestjs/common';
import type { ZodSchema } from 'zod';

export const ORGANIZATION_METADATA_KEY = 'xpert:organizationId'
export const PLUGIN_METADATA_KEY = 'xpert:pluginName'
export const GLOBAL_ORGANIZATION_SCOPE = 'global'
export const STRATEGY_META_KEY = 'XPERT_STRATEGY_META_KEY'

export interface PluginLifecycle {
  /** Called after module registration but before application startup */
  onInit?(ctx: PluginContext): Promise<void> | void;
  /** Called after application startup (can start serving externally) */
  onStart?(ctx: PluginContext): Promise<void> | void;
  /** Called during graceful shutdown */
  onStop?(ctx: PluginContext): Promise<void> | void;
}

export interface PluginHealth {
  /** Returns health status and optional dependency check details */
  checkHealth?(ctx: PluginContext): Promise<{ status: 'up' | 'down'; details?: any }> | { status: 'up' | 'down'; details?: any };
}

export interface PluginConfigSpec<T extends object = any> {
  /** Zod validation schema for plugin-level config (optional) */
  schema?: ZodSchema<T>;
  /** Default configuration */
  defaults?: Partial<T>;
}

export interface XpertPlugin<TConfig extends object = any> extends PluginLifecycle, PluginHealth {
  meta: PluginMeta;
  config?: PluginConfigSpec<TConfig>;
  /** Returns the DynamicModule to be mounted to the main application (can be set as global) */
  register(ctx: PluginContext<TConfig>): DynamicModule;
}

export interface PluginContext<TConfig extends object = any> {
  app: INestApplicationContext;      // Nest runtime context (injected after startup)
  logger: PluginLogger;              // Logger wrapper provided by SDK
  config: TConfig;                   // Final config after validation and merging
  /** Helper method to access other Providers in the container */
  resolve<TInput = any, TResult = TInput>(token: any): TResult;
}

export interface PluginLogger {
  child(meta: Record<string, any>): PluginLogger;
  debug(msg: string, meta?: any): void;
  log(msg: string, meta?: any): void;
  warn(msg: string, meta?: any): void;
  error(msg: string, meta?: any): void;
}

export type PromiseOrValue<T> = T | Promise<T>;