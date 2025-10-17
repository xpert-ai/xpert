import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { PluginLoadError } from './errors';
import { resolve } from 'path';
import { existsSync } from 'fs';

const isProd = process.env.NODE_ENV === 'production';

async function loadModule(modName: string): Promise<any> {
  // Try ESM import
  try {
    return await import(modName);
  } catch (e1) {
    if (isProd) {
      console.warn(`ESM import failed for ${modName}:`, e1);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(modName);
    } catch (e2) {
      if (isProd) {
        // Production mode: only ESM + CJS allowed
        throw new PluginLoadError(modName, 'Failed to load module in production (ESM/CJS)', e2);
      } else {
        // console.warn(`[DEV] CJS require failed for ${modName}:`, e2);
        // Development mode: Try loading .ts files with ts-node
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require('ts-node').register({
            transpileOnly: true,
            compilerOptions: {
              module: 'CommonJS',
              target: 'ES2021',
              experimentalDecorators: true,
              emitDecoratorMetadata: true,
            },
          });

          // Try to resolve to plugin index.ts
          const tsEntry = resolve(process.cwd(), 'node_modules', modName, 'src/index.ts');
          if (!existsSync(tsEntry)) {
            throw new Error(`No index.ts found for module ${modName}`);
          }

          return require(tsEntry);
        } catch (e3) {
          console.error(e3)
          throw new PluginLoadError(modName, 'Failed to load module in dev (ESM/CJS/TS)', e3);
        }
      }
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