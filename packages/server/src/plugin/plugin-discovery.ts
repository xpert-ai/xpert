import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DiscoveryOptions {
  /** Package name prefix convention, such as '@xpert-ai/plugin-' or 'xpert-plugin-' */
  prefix?: string;
  /** Specify manifest file path (JSON), takes precedence over prefix scanning */
  manifestPath?: string; // e.g. ./plugins.json
  /** Override the directory that contains node_modules, default: <cwd>/node_modules */
  nodeModulesDir?: string;
}

export function discoverPlugins(cwd = process.cwd(), opts: DiscoveryOptions = {}): string[] {
  const manifestPath = opts.manifestPath
    ? path.isAbsolute(opts.manifestPath)
      ? opts.manifestPath
      : path.resolve(cwd, opts.manifestPath)
    : undefined;
  const nodeModules = opts.nodeModulesDir ?? path.join(cwd, 'node_modules');
  const out = new Set<string>();

  // 1) Manifest takes precedence
  if (manifestPath && fs.existsSync(manifestPath)) {
    const list = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as string[];
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
        if (full === '@xpert-ai/plugin-sdk') continue; // Skip SDK itself
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
