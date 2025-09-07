import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { PluginLoadError } from './errors';

async function loadModule(modName: string): Promise<any> {
  try {
    // 先尝试 ESM import
    return await import(modName);
  } catch (e1) {
    // 回退到 require（CJS）
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(modName);
    } catch (e2) {
      throw new PluginLoadError(modName, 'Failed to load module', e2);
    }
  }
}

export async function loadPlugin(modName: string): Promise<XpertPlugin> {
  const m = await loadModule(modName);
  const plugin = (m?.default ?? m) as XpertPlugin;
  if (!plugin?.meta || typeof plugin.register !== 'function') {
    throw new PluginLoadError(modName, 'Module does not export a valid XpertPlugin');
  }
  return plugin;
}