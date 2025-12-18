import { getConfig } from '@metad/server-config';
import { execSync } from 'child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { normalizePluginName } from './types';

export interface OrganizationPluginStoreOptions {
  /** Base directory to keep organization plugin workspaces, defaults to `<repo>/data/plugins` */
  rootDir?: string;
  /** Manifest filename, defaults to `plugins.json` under each organization folder */
  manifestName?: string;
}

export interface InstallOrganizationPluginsOptions extends OrganizationPluginStoreOptions {
  /** npm registry override when installing plugins */
  registry?: string;
  /** Whether to pass --legacy-peer-deps, default true to match existing behaviour */
  legacyPeerDeps?: boolean;
}

export const DEFAULT_ORG_PLUGIN_ROOT =  path.join(getConfig().assetOptions.serverRoot, 'plugins');
export const DEFAULT_ORG_MANIFEST = 'plugins.json';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function isPluginInstalled(pluginDir: string, pluginName: string) {
  const normalizedName = normalizePluginName(pluginName);
  const pkgJsonPath = path.join(pluginDir, 'node_modules', normalizedName, 'package.json');
  return fs.existsSync(pkgJsonPath);
}

export function getOrganizationPluginRoot(organizationId: string, opts?: OrganizationPluginStoreOptions) {
  return path.join(opts?.rootDir ?? DEFAULT_ORG_PLUGIN_ROOT, organizationId);
}

export function getOrganizationManifestPath(organizationId: string, opts?: OrganizationPluginStoreOptions) {
  const root = getOrganizationPluginRoot(organizationId, opts);
  return path.join(root, opts?.manifestName ?? DEFAULT_ORG_MANIFEST);
}

/**
 * Get the filesystem path for a given plugin under the organization's plugin workspace.
 * 
 * Normalize plugin spec to a filesystem-friendly folder name (drops version suffix).
 */
export function getOrganizationPluginPath(
  organizationId: string,
  pluginName: string,
  opts?: OrganizationPluginStoreOptions,
) {
  const normalized = normalizePluginName(pluginName);
  return path.join(getOrganizationPluginRoot(organizationId, opts), normalized);
}

export function readOrganizationManifest(organizationId: string, opts?: OrganizationPluginStoreOptions): string[] {
  const manifestPath = getOrganizationManifestPath(organizationId, opts);
  if (!fs.existsSync(manifestPath)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as string[];
  } catch (err) {
    console.warn(`Failed to parse plugin manifest for org ${organizationId} at ${manifestPath}:`, err);
    return [];
  }
}

export function writeOrganizationManifest(
  organizationId: string,
  plugins: string[],
  opts?: OrganizationPluginStoreOptions,
) {
  const manifestPath = getOrganizationManifestPath(organizationId, opts);
  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, JSON.stringify(Array.from(new Set(plugins)), null, 2));
}

// export function discoverOrganizationPlugins(
//   organizationId: string,
//   opts?: OrganizationPluginStoreOptions & { discovery?: DiscoveryOptions },
// ): string[] {
//   const root = getOrganizationPluginRoot(organizationId, opts);
//   const manifestPath = getOrganizationManifestPath(organizationId, opts);
//   return discoverPlugins(root, {
//     manifestPath,
//     ...opts?.discovery,
//   });
// }

/**
 * Install plugins into the given organization's plugin workspace and update its manifest.
 * 
 * @param organizationId 
 * @param plugins 
 * @param opts 
 * @returns 
 */
export function installOrganizationPlugins(
  organizationId: string,
  plugins: string[],
  opts: InstallOrganizationPluginsOptions = {},
) {
  if (!plugins?.length) {
    return;
  }
  const root = getOrganizationPluginRoot(organizationId, opts);
  ensureDir(root);

  process.stdout.write(`Installing plugins for org ${organizationId}: `);
  for (const plugin of plugins) {
    process.stdout.write(chalk.bgBlue(plugin) + ' ');
  }
  process.stdout.write('\n');

  const manifest = new Set(readOrganizationManifest(organizationId, opts));

  for (const plugin of plugins) {
    const pluginDir = getOrganizationPluginPath(organizationId, plugin, opts);
    if (isPluginInstalled(pluginDir, plugin)) {
      console.log(chalk.yellow(`Plugin ${plugin} already installed at ${pluginDir}, skipping install.`));
      manifest.add(plugin);
      continue;
    }
    ensureDir(pluginDir);

    const args = [
      'npm',
      'install',
      '--no-save',
      opts.legacyPeerDeps === false ? '' : '--legacy-peer-deps',
      '--prefix',
      pluginDir,
      plugin,
    ].filter(Boolean);
    if (opts.registry) {
      args.push('--registry', opts.registry);
    }

    try {
      execSync(args.join(' '), {
        stdio: 'inherit',
        env: {
          ...process.env,
          npm_config_package_lock: 'false',
          npm_config_lockfile: 'false',
        },
      });
      console.log(chalk.green(`Installed plugin ${plugin} for org ${organizationId} at ${pluginDir}`));
      manifest.add(plugin);
    } catch (error) {
      console.error(`Failed to install plugin ${plugin} for org ${organizationId}:`, error);
    }
  }

  writeOrganizationManifest(organizationId, Array.from(manifest), opts);
}
