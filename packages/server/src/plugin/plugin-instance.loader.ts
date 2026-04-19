/**
 * Why this exists:
 * Startup restore reads persisted plugin rows before plugin ORM metadata is available.
 * Code plugins are restored by workspace-backed package name, not by a versioned npm spec, so their staged path stays stable across restarts.
 * Keep `sourceConfig` attached so runtime restore can restage local code plugins when needed.
 */
import { getConfig } from '@xpert-ai/server-config'
import { PluginLevel, PluginSourceConfig } from '@xpert-ai/contracts'
import { GLOBAL_ORGANIZATION_SCOPE } from '@xpert-ai/plugin-sdk'
import { DataSource, DataSourceOptions } from 'typeorm'
import { deserializePluginConfig } from './plugin-config.crypto'

const PLUGIN_INSTANCE_TABLE = 'plugin_instance'

interface PluginInstanceRow {
	organizationId?: string | null
	pluginName: string
	packageName?: string | null
	version?: string | null
	source?: string | null
	sourceConfig?: PluginSourceConfig | null
	level?: PluginLevel
	config: unknown
}

export interface OrganizationPluginConfig {
	organizationId?: string
	plugins: { name: string; version?: string; source?: string; level?: PluginLevel; sourceConfig?: PluginSourceConfig | null }[]
	configs: Record<string, any>
}

async function hasPluginInstanceTable(dataSource: DataSource): Promise<boolean> {
	const queryRunner = dataSource.createQueryRunner()
	try {
		return await queryRunner.hasTable(PLUGIN_INSTANCE_TABLE)
	} finally {
		await queryRunner.release()
	}
}

/**
 * Before system initialization, connect to the data source via database configuration and read the plugin list.
 * Query the plugin_instance table directly so plugin restore does not depend on unrelated ORM metadata.
 *
 * @returns
 */
export async function loadPluginInstances(): Promise<PluginInstanceRow[]> {
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
		if (!(await hasPluginInstanceTable(dataSource))) {
			return []
		}

		return await dataSource.query<PluginInstanceRow[]>(
			`SELECT "organizationId", "pluginName", "packageName", version, source, "sourceConfig", level, config FROM ${PLUGIN_INSTANCE_TABLE}`
		)
	} finally {
		await dataSource.destroy()
	}
}

export function buildOrganizationPluginConfigs(instances: PluginInstanceRow[]): OrganizationPluginConfig[] {
	const byOrg = new Map<string, OrganizationPluginConfig>()

	for (const instance of instances) {
		const orgId = instance.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const record = byOrg.get(orgId) ?? { organizationId: orgId, plugins: [], configs: {} }
		const packageName = instance.packageName || instance.pluginName
		const name = instance.source === 'code'
			? packageName
			: instance.version
				? `${packageName}@${instance.version}`
				: packageName
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
}

/**
 * Load plugins grouped by organization from persisted plugin instances.
 *
 * @returns
 */
export async function loadOrganizationPluginConfigs(): Promise<OrganizationPluginConfig[]> {
	try {
		const instances = await loadPluginInstances()
		return buildOrganizationPluginConfigs(instances)
	} catch (err) {
		console.warn('Failed to load plugin instances from DB, fallback to defaults', err)
		return []
	}
}
