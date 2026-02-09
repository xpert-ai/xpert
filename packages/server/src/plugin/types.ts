import type { ClassProvider, ExistingProvider, FactoryProvider, Provider, ValueProvider } from '@nestjs/common'

// Expose a list of loaded plugins through a global provider for lifecycle control.
export const LOADED_PLUGINS = 'XPERT_LOADED_PLUGINS';

// Token for built-in XpertPlugin package names
export const BUILTIN_XPERT_PLUGINS = 'XPERT_BUILTIN_PLUGINS';

export interface LoadedPluginRecord {
  organizationId: string;
  name: string;
  instance: any;
  ctx: any;
  packageName?: string;
  baseDir?: string;
  source?: string;
}

export function isCustomProvider(p: Provider): p is Exclude<Provider, () => void> {
  return typeof p === 'object' && p !== null && 'provide' in p
}

export function isClassProvider(p: Provider): p is ClassProvider {
  return isCustomProvider(p) && 'useClass' in p
}

export function isFactoryProvider(p: Provider): p is FactoryProvider {
  return isCustomProvider(p) && 'useFactory' in p
}

export function isValueProvider(p: Provider): p is ValueProvider {
  return isCustomProvider(p) && 'useValue' in p
}

export function isExistingProvider(p: Provider): p is ExistingProvider {
  return isCustomProvider(p) && 'useExisting' in p
}

/** Convert `<pkg>@1.2.3` -> `<pkg>` to align install/load paths. */
export function normalizePluginName(pluginName: string) {
  if (!pluginName.includes('@')) return pluginName;
  const lastAt = pluginName.lastIndexOf('@');
  return lastAt > 0 ? pluginName.slice(0, lastAt) : pluginName;
}
