import type { XpertPlugin } from '@xpert-ai/plugin-sdk';
import { existsSync } from 'fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'path';
import { PluginLoadError } from './errors';

export interface PluginLoadOptions {
  /** Resolve modules relative to this base directory (expects a node_modules inside it) */
  basedir?: string;
}

const isProd = process.env.NODE_ENV === 'production';

function getRequire(basedir?: string) {
  if (!basedir) return require;
  try {
    return createRequire(join(basedir, 'package.json'));
  } catch {
    return createRequire(basedir);
  }
}

async function loadModule(modName: string, opts: PluginLoadOptions = {}): Promise<any> {
  const basedir = opts.basedir;
  const cjsRequire = getRequire(basedir);
  const resolveFromBase = (name: string) => {
    if (!basedir) return name;
    try {
      return cjsRequire.resolve(name);
    } catch {
      return name;
    }
  };
  const target = resolveFromBase(modName);

  // Try ESM import
  try {
    return await import(target);
  } catch (e1) {
    console.warn(`ESM import failed for ${target}:`, e1);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return cjsRequire(target);
    } catch (e2) {
      if (isProd) {
        // Production mode: only ESM + CJS allowed
        throw new PluginLoadError(modName, 'Failed to load module in production (ESM/CJS)', e2);
      } else {
        // console.warn(`[DEV] CJS require failed for ${modName}:`, e2);
        // Development mode: Try loading .ts files with ts-node
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          cjsRequire('ts-node').register({
            transpileOnly: true,
            compilerOptions: {
              module: 'CommonJS',
              target: 'ES2021',
              experimentalDecorators: true,
              emitDecoratorMetadata: true,
            },
          });

          // Try to resolve to plugin index.ts
          const tsEntry = resolve(basedir ?? process.cwd(), 'node_modules', modName, 'src/index.ts');
          if (!existsSync(tsEntry)) {
            throw new Error(`No index.ts found for module ${modName}`);
          }

          return cjsRequire(tsEntry);
        } catch (e3) {
          console.error(e3)
          throw new PluginLoadError(modName, 'Failed to load module in dev (ESM/CJS/TS)', e3);
        }
      }
    }
  }
}

export async function loadPlugin(modName: string, opts: PluginLoadOptions = {}): Promise<XpertPlugin> {
  // Remove version suffix if present (e.g., '@xpert-ai/plugin-lark@0.0.4' -> '@xpert-ai/plugin-lark')
  if (modName.includes('@')) {
    const atIndex = modName.lastIndexOf('@');
    // If '@' is not at the start, it's a version suffix
    if (atIndex > 0) {
      modName = modName.slice(0, atIndex);
    }
  }

  const m = await loadModule(modName, opts);
  const plugin = (m?.default ?? m) as XpertPlugin;
  if (!plugin?.meta || typeof plugin.register !== 'function') {
    throw new PluginLoadError(modName, 'Module does not export a valid XpertPlugin');
  }
  return plugin;
}
