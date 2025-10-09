import { PluginMeta } from '@metad/contracts';
import type { DynamicModule, INestApplicationContext } from '@nestjs/common';
import type { ZodSchema } from 'zod';

export interface PluginLifecycle {
  /** 在模块注册完成但应用启动前调用 */
  onInit?(ctx: PluginContext): Promise<void> | void;
  /** 在应用启动后调用（可开始对外服务） */
  onStart?(ctx: PluginContext): Promise<void> | void;
  /** 优雅停机时调用 */
  onStop?(ctx: PluginContext): Promise<void> | void;
}

export interface PluginHealth {
  /** 返回健康状态与可选的依赖检查详情 */
  checkHealth?(ctx: PluginContext): Promise<{ status: 'up' | 'down'; details?: any }> | { status: 'up' | 'down'; details?: any };
}

export interface PluginConfigSpec<T extends object = any> {
  /** 插件级配置的 zod 校验 schema（可选） */
  schema?: ZodSchema<T>;
  /** 默认配置 */
  defaults?: Partial<T>;
}

export interface XpertPlugin<TConfig extends object = any> extends PluginLifecycle, PluginHealth {
  meta: PluginMeta;
  config?: PluginConfigSpec<TConfig>;
  /** 返回要挂载到主应用的 DynamicModule（可设为 global） */
  register(ctx: PluginContext<TConfig>): DynamicModule;
}

export interface PluginContext<TConfig extends object = any> {
  app: INestApplicationContext;      // Nest 运行时上下文（启动后注入）
  logger: PluginLogger;              // SDK 提供的 Logger 包装
  config: TConfig;                   // 校验合并后的最终配置
  /** 访问容器中其他 Provider 的辅助方法 */
  resolve<TInput = any, TResult = TInput>(token: any): TResult;
}

export interface PluginLogger {
  child(meta: Record<string, any>): PluginLogger;
  debug(msg: string, meta?: any): void;
  log(msg: string, meta?: any): void;
  warn(msg: string, meta?: any): void;
  error(msg: string, meta?: any): void;
}