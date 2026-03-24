import type { PluginConfigSpec } from '@xpert-ai/plugin-sdk';
import { z } from 'zod';
import { PluginConfigError } from './errors';

export function buildConfig<T extends object>(
  pluginName: string,
  input: unknown,
  spec?: PluginConfigSpec<T>,
): T {
  const defaults = (spec?.defaults ?? {}) as T;
  if (!spec?.schema) return { ...(defaults as any), ...(input as any) } as T;
  const merged = { ...(defaults as any), ...(input as any) };
  const parsed = spec.schema.safeParse(merged);
  if (!parsed.success) {
    throw new PluginConfigError(pluginName, parsed.error.toString());
  }
  return parsed.data as T;
}

export const CommonBooleanFlag = z.coerce.boolean().default(false);