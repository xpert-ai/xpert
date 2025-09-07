import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DiscoveryOptions {
  /** 包名前缀约定，如 '@xpert-ai/plugin-' 或 'xpert-plugin-' */
  prefix?: string;
  /** 指定清单文件路径（JSON），优先于前缀扫描 */
  manifestPath?: string; // e.g. ./plugins.json
}

export function discoverPlugins(cwd = process.cwd(), opts: DiscoveryOptions = {}): string[] {
  const nodeModules = path.join(cwd, 'node_modules');
  const out = new Set<string>();

  // 1) 清单优先
  if (opts.manifestPath && fs.existsSync(opts.manifestPath)) {
    const list = JSON.parse(fs.readFileSync(opts.manifestPath, 'utf8')) as string[];
    list.forEach((p) => out.add(p));
    return Array.from(out);
  }

  // 2) 前缀扫描（仅扫描顶层与作用域包）
  if (!fs.existsSync(nodeModules)) return [];
  const prefix = opts.prefix ?? '@xpert-ai/plugin-';
  for (const entry of fs.readdirSync(nodeModules)) {
    // 作用域包
    if (entry.startsWith('@')) {
      const scopeDir = path.join(nodeModules, entry);
      for (const scoped of fs.readdirSync(scopeDir)) {
        const full = `${entry}/${scoped}`;
        if (full.startsWith(prefix) || scoped.startsWith(prefix.replace(`${entry}/`, ''))) {
          out.add(full);
        }
      }
      continue;
    }
    // 顶层包
    if (entry.startsWith(prefix)) out.add(entry);
  }
  return Array.from(out);
}