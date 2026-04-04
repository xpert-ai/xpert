import { getConfig } from '@metad/server-config'
import { PluginLevel, PluginSourceConfig } from '@metad/contracts'
import { GLOBAL_ORGANIZATION_SCOPE } from '@xpert-ai/plugin-sdk'
import { DataSource, DataSourceOptions } from 'typeorm'
import { deserializePluginConfig } from './plugin-config.crypto'

export interface OrganizationPluginConfig {
	organizationId?: string
	plugins: { name: string; version?: string; source?: string; level?: PluginLevel; sourceConfig?: PluginSourceConfig | null }[]
	configs: Record<string, any>
}

/**
 * Before system initialization, connect to the data source via database configuration and read the plugin list.
 * Query the plugin_instance table directly so plugin restore does not depend on unrelated ORM metadata.
 *
 * @returns
 */
export async function loadPluginInstances(): Promise<Array<Record<string, any>>> {
	const cfg = getConfig()
	const options = cfg.dbConnectionOptions as DataSourceOptions
	const dataSource = new DataSource({
		...options,
		entities: [],
		subscribers: [],
		migrations: []
	})
	await dataSource.initialize()
	try {
		return await dataSource.query(
			'SELECT "organizationId", "pluginName", "packageName", version, source, "sourceConfig", level, config FROM plugin_instance'
		)
	} finally {
		await dataSource.destroy()
	}
}

/**
 * Load plugins grouped by organization from persisted plugin instances.
 *
 * @returns
 */
export async function loadOrganizationPluginConfigs(): Promise<OrganizationPluginConfig[]> {
	try {
		const instances = await loadPluginInstances()
		const byOrg = new Map<string, OrganizationPluginConfig>()

		for (const instance of instances) {
			const orgId = instance.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
			const record = byOrg.get(orgId) ?? { organizationId: orgId, plugins: [], configs: {} }
			const packageName = instance.packageName || instance.pluginName
			const name = instance.version ? `${packageName}@${instance.version}` : packageName
			record.plugins.push({
				name,
				version: instance.version,
				source: instance.source,
				sourceConfig: instance.sourceConfig ?? null,
				level: instance.level
			})
			record.configs[instance.pluginName] = deserializePluginConfig(
				typeof instance.config === 'string'
					? (() => {
							try {
								return JSON.parse(instance.config)
							} catch {
								return instance.config
							}
						})()
					: instance.config
			)
			byOrg.set(orgId, record)
		}

		return Array.from(byOrg.values())
	} catch (err) {
		console.warn('Failed to load plugin instances from DB, fallback to defaults', err)
		return []
	}
}
