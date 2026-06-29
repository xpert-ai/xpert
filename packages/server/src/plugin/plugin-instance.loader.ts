/**
 * Why this exists:
 * Startup restore reads persisted plugin rows before plugin ORM metadata is available.
 * Code plugins are restored by package name, not by a versioned npm spec.
 * Keep `sourceConfig` attached so runtime restore can restage local workspaces or reuse uploaded staged runtime directories.
 */
import { getConfig } from '@xpert-ai/server-config'
import { DEFAULT_TENANT, PluginLevel, PluginSourceConfig } from '@xpert-ai/contracts'
import { GLOBAL_ORGANIZATION_SCOPE, setDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { DataSource, DataSourceOptions } from 'typeorm'
import { deserializePluginConfig } from './plugin-config.crypto'
import { getCodeRuntimeName } from './source-config'
import { resolvePluginScope } from './plugin-scope'

const PLUGIN_INSTANCE_TABLE = 'plugin_instance'
const TENANT_TABLE = 'tenant'

interface PluginInstanceRow {
	tenantId?: string | null
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
	tenantId?: string | null
	organizationId?: string
	scopeKey?: string
	plugins: {
		name: string
		runtimeName?: string
		version?: string
		source?: string
		level?: PluginLevel
		sourceConfig?: PluginSourceConfig | null
	}[]
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

async function hasTenantTable(dataSource: DataSource): Promise<boolean> {
	const queryRunner = dataSource.createQueryRunner()
	try {
		return await queryRunner.hasTable(TENANT_TABLE)
	} finally {
		await queryRunner.release()
	}
}

export async function loadDefaultTenantId(dataSource: DataSource): Promise<string | null> {
	if (!(await hasTenantTable(dataSource))) {
		return null
	}

	const row = await dataSource
		.createQueryBuilder()
		.select('tenant.id', 'id')
		.from(TENANT_TABLE, 'tenant')
		.where('tenant.name = :name', { name: DEFAULT_TENANT })
		.limit(1)
		.getRawOne<{ id?: string }>()

	return row?.id ?? null
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
			`SELECT "tenantId", "organizationId", "pluginName", "packageName", version, source, "sourceConfig", level, config FROM ${PLUGIN_INSTANCE_TABLE}`
		)
	} finally {
		await dataSource.destroy()
	}
}

export function buildOrganizationPluginConfigs(
	instances: PluginInstanceRow[],
	options: { defaultTenantId?: string | null } = {}
): OrganizationPluginConfig[] {
	const byOrg = new Map<string, OrganizationPluginConfig>()
	const defaultTenantId = options.defaultTenantId ?? null
	setDefaultTenantId(defaultTenantId)

	for (const instance of instances) {
		const orgId = instance.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const scope = resolvePluginScope({
			tenantId: instance.tenantId,
			organizationId: orgId,
			defaultTenantId
		})
		const record = byOrg.get(scope.scopeKey) ?? {
			tenantId: scope.tenantId,
			organizationId: orgId,
			scopeKey: scope.scopeKey,
			plugins: [],
			configs: {}
		}
		const packageName = instance.packageName || instance.pluginName
		const runtimeName = instance.source === 'code' ? getCodeRuntimeName(instance.sourceConfig ?? null) : undefined
		const name =
			instance.source === 'code'
				? packageName
				: instance.version
					? `${packageName}@${instance.version}`
					: packageName
		record.plugins.push({
			name,
			...(runtimeName ? { runtimeName } : {}),
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
		byOrg.set(scope.scopeKey, record)
	}

	return Array.from(byOrg.values())
}

/**
 * Load plugins grouped by organization from persisted plugin instances.
 *
 * @returns
 */
export async function loadOrganizationPluginConfigs(): Promise<OrganizationPluginConfig[]> {
	let dataSource: DataSource | null = null
	try {
		const cfg = getConfig()
		const options = cfg.dbConnectionOptions as DataSourceOptions
		dataSource = new DataSource({
			...options,
			entities: [],
			subscribers: [],
			migrations: []
		})
		await dataSource.initialize()
		const defaultTenantId = await loadDefaultTenantId(dataSource)
		setDefaultTenantId(defaultTenantId)
		const instances = await loadPluginInstances()
		return buildOrganizationPluginConfigs(instances, { defaultTenantId })
	} catch (err) {
		console.warn('Failed to load plugin instances from DB, fallback to defaults', err)
		return []
	} finally {
		await dataSource?.destroy()
	}
}
