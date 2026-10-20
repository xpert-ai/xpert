/**
 * Plugin activation owns a schema preflight so a new runtime can never become
 * active before its entities have been applied to the shared database.
 * PostgreSQL's session lock serializes this legacy adapter with host migrations.
 */
import type { PluginMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { DataSource, MixedList } from 'typeorm'
import { createPluginLogger, GLOBAL_ORGANIZATION_SCOPE, type PluginContext } from '@xpert-ai/plugin-sdk'
import { withSchemaLock } from '../database/schema-migration'
import { collectPluginOrmMetadata, validatePluginEntityTableNames } from './plugin-orm-metadata'
import { loadPlugin } from './plugin-loader'
import { scopePluginSchemaSynchronization } from './plugin-schema-scope'

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
		private readonly moduleRef: ModuleRef
	) {}

	async synchronize(input: PluginSchemaSyncInput): Promise<PluginMeta> {
		return this.synchronizeWithLock(input)
	}

	private async synchronizeWithLock(input: PluginSchemaSyncInput): Promise<PluginMeta> {
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

		// Providers without entities have no schema to apply. Synchronizing the host
		// here would run unrelated DDL even when host migrations are managed externally.
		if (!ormMetadata.entities.length) return plugin.meta

		const entities = this.mergeTargets(this.dataSource.options.entities, ormMetadata.entities)
		const migrationDataSource = new DataSource({
			...this.dataSource.options,
			entities,
			subscribers: [],
			migrations: [],
			migrationsRun: false,
			dropSchema: false,
			...(this.dataSource.options.type === 'postgres' ? { installExtensions: false } : {}),
			synchronize: false
		})

		try {
			await migrationDataSource.initialize()
			scopePluginSchemaSynchronization(
				migrationDataSource,
				ormMetadata.entities,
				input.artifactNamespace ?? plugin.meta.artifactNamespace
			)
			if (migrationDataSource.options.type !== 'postgres') {
				throw new Error('Plugin schema migrations require PostgreSQL')
			}
			await withSchemaLock(migrationDataSource, () => migrationDataSource.synchronize())
		} finally {
			if (migrationDataSource.isInitialized) {
				await migrationDataSource.destroy()
			}
		}
		return plugin.meta
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
