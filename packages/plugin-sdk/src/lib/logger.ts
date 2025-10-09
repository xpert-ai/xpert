import { Logger } from '@nestjs/common';
import type { PluginLogger } from './types';

export function createPluginLogger(scope: string, baseMeta: Record<string, any> = {}): PluginLogger {
  const nestLogger = new Logger(scope);
  const wrap = (level: keyof Logger, msg: string, meta?: any) => {
    const payload = meta ? { ...baseMeta, ...meta } : baseMeta;
    // 保持与 Nest Logger 接口对齐
    (nestLogger as any)[level]?.(msg + (Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : ''));
  };
  return {
    child(meta) { return createPluginLogger(scope, { ...baseMeta, ...meta }); },
    debug: (msg, meta) => wrap('debug' as any, msg, meta),
    log:   (msg, meta) => wrap('log', msg, meta),
    warn:  (msg, meta) => wrap('warn', msg, meta),
    error: (msg, meta) => wrap('error', msg, meta),
  };
}