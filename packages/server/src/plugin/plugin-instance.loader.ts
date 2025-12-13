import { DataSource, DataSourceOptions } from 'typeorm';
import { getConfig } from '@metad/server-config';
import { PluginInstance } from './plugin-instance.entity';
import { GLOBAL_ORGANIZATION_SCOPE } from '@xpert-ai/plugin-sdk';

export interface OrganizationPluginConfig {
  organizationId?: string;
  plugins: string[];
  configs: Record<string, any>;
}

/**
 * Before system initialization, connect to the data source via database configuration and read the plugin list.
 * 
 * @returns 
 */
export async function loadPluginInstances(): Promise<PluginInstance[]> {
  const cfg = getConfig();
  const options = cfg.dbConnectionOptions as DataSourceOptions;
  const existingEntities = Array.isArray(options.entities) ? options.entities : options.entities ? Object.values(options.entities) : [];
  const dataSource = new DataSource({
    ...options,
    // Ensure the PluginInstance entity is included in bootstrap scanning
    entities: [...existingEntities, PluginInstance],
  });
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(PluginInstance);
    return await repo.find();
  } finally {
    await dataSource.destroy();
  }
}

/**
 * Load plugins grouped by organization from persisted plugin instances.
 * 
 * @returns 
 */
export async function loadOrganizationPluginConfigs(): Promise<OrganizationPluginConfig[]> {
  try {
    const instances = await loadPluginInstances();
    const byOrg = new Map<string, OrganizationPluginConfig>();

    for (const instance of instances) {
      const orgId = instance.organizationId ?? GLOBAL_ORGANIZATION_SCOPE;
      const record = byOrg.get(orgId) ?? { organizationId: instance.organizationId, plugins: [], configs: {} };
      const packageName = instance.packageName || instance.pluginName
      const name = instance.version ? `${packageName}@${instance.version}` : packageName;
      record.plugins.push(name);
      record.configs[instance.pluginName] = instance.config || {};
      byOrg.set(orgId, record);
    }

    return Array.from(byOrg.values());
  } catch (err) {
    console.warn('Failed to load plugin instances from DB, fallback to defaults', err);
    return [];
  }
}
