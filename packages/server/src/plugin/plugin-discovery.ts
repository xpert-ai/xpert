import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DiscoveryOptions {
  /** Package name prefix convention, such as '@xpert-ai/plugin-' or 'xpert-plugin-' */
  prefix?: string;
  /** Specify manifest file path (JSON), takes precedence over prefix scanning */
  manifestPath?: string; // e.g. ./plugins.json
}

export function discoverPlugins(cwd = process.cwd(), opts: DiscoveryOptions = {}): string[] {
  const nodeModules = path.join(cwd, 'node_modules');
  const out = new Set<string>();

  // 1) Manifest takes precedence
  if (opts.manifestPath && fs.existsSync(opts.manifestPath)) {
    const list = JSON.parse(fs.readFileSync(opts.manifestPath, 'utf8')) as string[];
    list.forEach((p) => out.add(p));
    return Array.from(out);
  }

  // 2) Prefix scanning (only scan top-level and scoped packages)
  if (!fs.existsSync(nodeModules)) return [];
  const prefix = opts.prefix ?? '@xpert-ai/plugin-';
  for (const entry of fs.readdirSync(nodeModules)) {
    // Scoped packages
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
    // Top-level packages
    if (entry.startsWith(prefix)) out.add(entry);
  }
  return Array.from(out);
}