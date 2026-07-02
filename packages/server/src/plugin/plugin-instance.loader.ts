/**
 * Why this exists:
 * Startup restore reads persisted plugin rows before plugin ORM metadata is available.
 * Code plugins are restored by package name, not by a versioned npm spec.
 * Keep `sourceConfig` attached so runtime restore can restage local workspaces or reuse uploaded staged runtime directories.
 */
import { getConfig } from '@xpert-ai/server-config'
import { DEFAULT_TENANT, PLUGIN_LEVEL, PluginLevel, PluginSourceConfig } from '@xpert-ai/contracts'
import { GLOBAL_ORGANIZATION_SCOPE, SYSTEM_GLOBAL_SCOPE, setDefaultTenantId } from '@xpert-ai/plugin-sdk'
import { DataSource, DataSourceOptions } from 'typeorm'
import { deserializePluginConfig } from './plugin-config.crypto'
import { getCodeRuntimeName } from './source-config'
import { resolvePluginScope } from './plugin-scope'

const PLUGIN_INSTANCE_TABLE = 'plugin_instance'
const TENANT_TABLE = 'tenant'

interface PluginInstanceRow {
	tenantId?: string | null
	organizationId?: string | null
	scopeKey?: string | null
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

async function hasPluginInstanceScopeKeyColumn(dataSource: DataSource): Promise<boolean> {
	const queryRunner = dataSource.createQueryRunner()
	try {
		return await queryRunner.hasColumn(PLUGIN_INSTANCE_TABLE, 'scopeKey')
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

async function backfillPluginInstanceScopeKeys(dataSource: DataSource, defaultTenantId?: string | null): Promise<void> {
	await dataSource.query(
		`
			WITH ranked AS (
				SELECT id,
					ROW_NUMBER() OVER (
						PARTITION BY "pluginName"
						ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
					) AS rn
				FROM ${PLUGIN_INSTANCE_TABLE}
				WHERE "scopeKey" IS NULL AND level = $1
			)
			DELETE FROM ${PLUGIN_INSTANCE_TABLE} target
			USING ranked
			WHERE target.id = ranked.id AND ranked.rn > 1
		`,
		[PLUGIN_LEVEL.SYSTEM]
	)

	await dataSource.query(
		`
			UPDATE ${PLUGIN_INSTANCE_TABLE}
			SET "scopeKey" = $1, "tenantId" = NULL, "organizationId" = NULL
			WHERE "scopeKey" IS NULL AND level = $2
		`,
		[SYSTEM_GLOBAL_SCOPE, PLUGIN_LEVEL.SYSTEM]
	)

	await dataSource.query(
		`
			UPDATE ${PLUGIN_INSTANCE_TABLE}
			SET "scopeKey" = CASE
				WHEN "organizationId" IS NOT NULL THEN "organizationId"::text
				WHEN "tenantId" IS NOT NULL AND $2::text IS NOT NULL AND "tenantId"::text <> $2::text
					THEN CONCAT('tenant:', "tenantId", ':global')
				ELSE $1
			END
			WHERE "scopeKey" IS NULL AND (level IS NULL OR level <> $3)
		`,
		[GLOBAL_ORGANIZATION_SCOPE, defaultTenantId ?? null, PLUGIN_LEVEL.SYSTEM]
	)
}

/**
 * Before system initialization, connect to the data source via database configuration and read the plugin list.
 * Query the plugin_instance table directly so plugin restore does not depend on unrelated ORM metadata.
 *
 * @returns
 */
export async function loadPluginInstances(
	input: { defaultTenantId?: string | null } = {}
): Promise<PluginInstanceRow[]> {
	const cfg = getConfig()
	const dataSourceOptions = cfg.dbConnectionOptions as DataSourceOptions
	const dataSource = new DataSource({
		...dataSourceOptions,
		entities: [],
		subscribers: [],
		migrations: []
	})
	await dataSource.initialize()
	try {
		if (!(await hasPluginInstanceTable(dataSource))) {
			return []
		}
		const hasScopeKeyColumn = await hasPluginInstanceScopeKeyColumn(dataSource)
		if (hasScopeKeyColumn) {
			await backfillPluginInstanceScopeKeys(dataSource, input.defaultTenantId)
		}
		const scopeKeySelect = hasScopeKeyColumn ? `"scopeKey"` : `NULL AS "scopeKey"`

		return await dataSource.query<PluginInstanceRow[]>(
			`SELECT "tenantId", "organizationId", ${scopeKeySelect}, "pluginName", "packageName", version, source, "sourceConfig", level, config FROM ${PLUGIN_INSTANCE_TABLE}`
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
			defaultTenantId,
			scopeKey: instance.level === PLUGIN_LEVEL.SYSTEM ? SYSTEM_GLOBAL_SCOPE : instance.scopeKey
		})
		const record = byOrg.get(scope.scopeKey) ?? {
			tenantId: scope.isSystem ? null : scope.tenantId,
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
		const instances = await loadPluginInstances({ defaultTenantId })
		return buildOrganizationPluginConfigs(instances, { defaultTenantId })
	} catch (err) {
		console.warn('Failed to load plugin instances from DB, fallback to defaults', err)
		return []
	} finally {
		await dataSource?.destroy()
	}
}
