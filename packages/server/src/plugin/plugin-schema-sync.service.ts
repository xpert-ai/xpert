/**
 * Plugin activation owns a schema preflight so a new runtime can never become
 * active before its entities have been applied to the shared database.
 * The lock keeps concurrent API replicas from running TypeORM DDL together.
 */
import { Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { DataSource, MixedList } from 'typeorm'
import { createPluginLogger, GLOBAL_ORGANIZATION_SCOPE, type PluginContext } from '@xpert-ai/plugin-sdk'
import { RedisLockService } from '../core/redis/redis-lock.service'
import { collectPluginOrmMetadata, validatePluginEntityTableNames } from './plugin-orm-metadata'
import { loadPlugin } from './plugin-loader'

const PLUGIN_SCHEMA_SYNC_LOCK = 'xpert:plugin:schema-sync'
const PLUGIN_SCHEMA_SYNC_LOCK_TTL = 5 * 60 * 1000

export interface PluginSchemaSyncInput {
	pluginName: string
	pluginBaseDir: string
	source?: string
	workspacePath?: string
	config?: Record<string, unknown>
	organizationId?: string | null
	tenantId?: string | null
	scopeKey?: string | null
	artifactNamespace?: string | null
}

@Injectable()
export class PluginSchemaSyncService {
	constructor(
		private readonly dataSource: DataSource,
		private readonly moduleRef: ModuleRef,
		private readonly locks: RedisLockService
	) {}

	async synchronize(input: PluginSchemaSyncInput): Promise<void> {
		const result = await this.locks.runWithLock(PLUGIN_SCHEMA_SYNC_LOCK, PLUGIN_SCHEMA_SYNC_LOCK_TTL, async () => {
			await this.synchronizeWithLock(input)
			return true
		})

		if (!result.acquired) {
			throw new Error('Another plugin schema migration is already in progress')
		}
	}

	private async synchronizeWithLock(input: PluginSchemaSyncInput): Promise<void> {
		const plugin = await loadPlugin(input.pluginName, {
			basedir: input.pluginBaseDir,
			source: input.source,
			workspacePath: input.workspacePath,
			codeLoadMode: input.source === 'code' ? 'staged-package' : undefined
		})
		const scope = {
			tenantId: input.tenantId ?? null,
			organizationId: input.organizationId ?? GLOBAL_ORGANIZATION_SCOPE,
			scopeKey: input.scopeKey ?? null
		}
		const context: PluginContext = {
			module: this.moduleRef,
			config: input.config ?? {},
			tenantId: scope.tenantId,
			organizationId: scope.organizationId,
			scopeKey: scope.scopeKey,
			logger: createPluginLogger(`plugin:${plugin.meta.name}`),
			resolve: () => {
				throw new Error(
					`Plugin '${plugin.meta.name}' cannot resolve application services during schema migration.`
				)
			}
		}
		const module = plugin.register(context)
		const ormMetadata = collectPluginOrmMetadata([module])

		validatePluginEntityTableNames({
			pluginName: plugin.meta.name,
			entities: ormMetadata.entities,
			artifactNamespace: input.artifactNamespace ?? plugin.meta.artifactNamespace,
			requireNamespaceMatch: Boolean(input.artifactNamespace ?? plugin.meta.artifactNamespace)
		})

		const entities = this.mergeTargets(this.dataSource.options.entities, ormMetadata.entities)
		const subscribers = this.mergeTargets(this.dataSource.options.subscribers, ormMetadata.subscribers)
		const migrationDataSource = new DataSource({
			...this.dataSource.options,
			entities,
			subscribers,
			migrations: [],
			synchronize: false
		})

		try {
			await migrationDataSource.initialize()
			await migrationDataSource.synchronize()
		} finally {
			if (migrationDataSource.isInitialized) {
				await migrationDataSource.destroy()
			}
		}
	}

	private mergeTargets<T>(existing: MixedList<T> | undefined, additions: T[]): T[] {
		if (!existing) {
			return [...additions]
		}
		if (Array.isArray(existing)) {
			return Array.from(new Set([...existing, ...additions]))
		}
		if (typeof existing === 'object') {
			return Array.from(new Set([...Object.values(existing), ...additions]))
		}
		return Array.from(new Set([existing, ...additions]))
	}
}
