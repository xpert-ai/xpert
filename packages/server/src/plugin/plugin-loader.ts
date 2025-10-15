import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { PluginLoadError } from './errors';

async function loadModule(modName: string): Promise<any> {
  try {
    // Try ESM import first
    return await import(modName);
  } catch (e1) {
    console.error(e1);
    // Fallback to require (CJS)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(modName);
    } catch (e2) {
      throw new PluginLoadError(modName, 'Failed to load module', e2);
    }
  }
}

export async function loadPlugin(modName: string): Promise<XpertPlugin> {
  // Remove version suffix if present (e.g., '@xpert-ai/plugin-lark@0.0.4' -> '@xpert-ai/plugin-lark')
  if (modName.includes('@')) {
    const atIndex = modName.lastIndexOf('@');
    // If '@' is not at the start, it's a version suffix
    if (atIndex > 0) {
      modName = modName.slice(0, atIndex);
    }
  }

  const m = await loadModule(modName);
  const plugin = (m?.default ?? m) as XpertPlugin;
  if (!plugin?.meta || typeof plugin.register !== 'function') {
    throw new PluginLoadError(modName, 'Module does not export a valid XpertPlugin');
  }
  return plugin;
}