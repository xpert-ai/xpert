import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	SYSTEM_GLOBAL_SCOPE,
	resolveTenantGlobalScopeKey,
	setDefaultTenantId,
	StrategyBus
} from '@xpert-ai/plugin-sdk'
import { DEFAULT_TENANT, PLUGIN_LEVEL } from '@xpert-ai/contracts'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { In, IsNull, Repository } from 'typeorm'
import { PluginInstance } from './plugin-instance.entity'
import { TenantOrganizationAwareCrudService } from '../core/crud'
import { deserializePluginConfig, serializePluginConfig } from './plugin-config.crypto'
import {
	getOrganizationManifestPath,
	getOrganizationPluginPath,
	getOrganizationPluginRoot
} from './organization-plugin.store'
import { clearPluginLoadFailure } from './plugin.helper'
import { normalizePluginSourceConfig } from './source-config'
import { LOADED_PLUGINS, LoadedPluginRecord, normalizePluginName } from './types'
import { resolvePluginScope } from './plugin-scope'

@Injectable()
export class PluginInstanceService extends TenantOrganizationAwareCrudService<PluginInstance> {
	private readonly logger = new Logger(PluginInstanceService.name)
	private defaultTenantId: string | null | undefined

	constructor(
		@InjectRepository(PluginInstance)
		private repo: Repository<PluginInstance>,
		@Inject(LOADED_PLUGINS)
		private readonly loadedPlugins: Array<LoadedPluginRecord>,
		private readonly strategyBus: StrategyBus
	) {
		super(repo)
	}

	async upsert(input: PluginInstance, options: { syncLoadedConfig?: boolean } = {}) {
		const requestTenantId = input.tenantId ?? this.getCurrentTenantId()
		const defaultTenantId = await this.getDefaultTenantId()
		const scope = resolvePluginScope({
			tenantId: requestTenantId,
			organizationId: input.organizationId,
			defaultTenantId,
			scopeKey: input.level === PLUGIN_LEVEL.SYSTEM ? SYSTEM_GLOBAL_SCOPE : input.scopeKey
		})
		const tenantId = scope.isSystem ? null : scope.tenantId
		const organizationId = scope.organizationId
		const decryptedConfig = input.config ?? {}
		const hasExplicitSourceConfig = input.sourceConfig !== undefined
		const where = await this.buildPluginWhere(
			tenantId,
			organizationId,
			{ pluginName: input.pluginName },
			scope.scopeKey
		)
		const existing = await this.repo.findOne({
			where
		})
		const normalizedSourceConfig = normalizePluginSourceConfig(input.source, input.sourceConfig)
		const persistedSourceConfig = hasExplicitSourceConfig
			? normalizedSourceConfig
			: existing && input.source === existing.source
				? (existing.sourceConfig ?? null)
				: normalizedSourceConfig

		if (existing) {
			existing.packageName = input.packageName
			existing.version = input.version
			existing.source = input.source
			existing.sourceConfig = persistedSourceConfig
			existing.level = input.level ?? existing.level
			existing.config = serializePluginConfig(decryptedConfig)
			existing.configurationStatus = input.configurationStatus ?? null
			existing.configurationError = input.configurationError ?? null
			existing.tenantId = tenantId
			existing.organizationId = this.getOrganizationValue(organizationId)
			existing.scopeKey = scope.scopeKey
			const entity = await this.repo.save(existing)
			if (options.syncLoadedConfig !== false) {
				this.syncLoadedPluginConfig(organizationId, input.pluginName, decryptedConfig, tenantId, scope.scopeKey)
			}
			return entity
		}

		const entity = this.repo.create({
			tenantId,
			organizationId: this.getOrganizationValue(organizationId),
			scopeKey: scope.scopeKey,
			pluginName: input.pluginName,
			packageName: input.packageName,
			version: input.version,
			source: input.source,
			sourceConfig: normalizedSourceConfig,
			level: input.level,
			config: serializePluginConfig(decryptedConfig),
			configurationStatus: input.configurationStatus ?? null,
			configurationError: input.configurationError ?? null
		})
		const created = await this.create(entity)
		if (options.syncLoadedConfig !== false) {
			this.syncLoadedPluginConfig(organizationId, input.pluginName, decryptedConfig, tenantId, scope.scopeKey)
		}
		return created
	}

	async findOneByPluginName(
		pluginName: string,
		organizationId: string,
		tenantId = this.getCurrentTenantId(),
		scopeKey?: string | null
	) {
		const defaultTenantId = await this.getDefaultTenantId()
		const scope = resolvePluginScope({ tenantId, organizationId, defaultTenantId, scopeKey })
		return this.repo.findOne({
			where: await this.buildPluginWhere(tenantId, scope.organizationId, { pluginName }, scope.scopeKey)
		})
	}

	/**
	 * Tenant-level plugins may contribute process-global Nest modules, controllers and ORM metadata.
	 * Keep one owning tenant per plugin package so the same runtime is never bootstrapped twice.
	 */
	async findTenantLevelOwner(pluginName: string) {
		const normalized = normalizePluginName(pluginName)
		return this.repo.findOne({
			where: [
				{ level: PLUGIN_LEVEL.TENANT, pluginName: normalized },
				{ level: PLUGIN_LEVEL.TENANT, packageName: normalized }
			]
		})
	}

	async findSystemLevelRegistration(pluginName: string) {
		const normalized = normalizePluginName(pluginName)
		return this.repo.findOne({
			where: [
				{ level: PLUGIN_LEVEL.SYSTEM, pluginName: normalized },
				{ level: PLUGIN_LEVEL.SYSTEM, packageName: normalized }
			]
		})
	}

	async findVisibleInOrganization(organizationId: string) {
		const tenantId = this.getCurrentTenantId()
		const defaultTenantId = await this.getDefaultTenantId()
		const organizationScope = resolvePluginScope({ tenantId, organizationId, defaultTenantId })
		const globalScope = resolvePluginScope({ tenantId, organizationId: GLOBAL_ORGANIZATION_SCOPE, defaultTenantId })
		const tenantWhere = await this.buildTenantWhereVariants(tenantId)
		const where: Array<Record<string, any>> = [{ scopeKey: SYSTEM_GLOBAL_SCOPE }]

		if (organizationId && organizationId !== GLOBAL_ORGANIZATION_SCOPE) {
			where.push({ scopeKey: organizationScope.scopeKey })
		}

		where.push({ scopeKey: globalScope.scopeKey })

		if (organizationId && organizationId !== GLOBAL_ORGANIZATION_SCOPE) {
			where.push(...tenantWhere.map((item) => ({ ...item, organizationId, scopeKey: IsNull() })))
		}

		where.push(...tenantWhere.map((item) => ({ ...item, organizationId: IsNull(), scopeKey: IsNull() })))

		return this.repo.find({ where })
	}

	getConfig(instance?: PluginInstance | null) {
		return deserializePluginConfig(instance?.config)
	}

	syncLoadedPluginConfig(
		organizationId: string | null | undefined,
		pluginName: string,
		config: Record<string, any>,
		tenantId?: string | null,
		scopeKey?: string | null
	) {
		const scope = organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const resolvedScopeKey =
			scopeKey ?? (scope === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : scope)
		const plugin = this.loadedPlugins.find(
			(item) =>
				(item.scopeKey ?? item.organizationId) === resolvedScopeKey &&
				normalizePluginName(item.name) === normalizePluginName(pluginName)
		)

		if (plugin) {
			plugin.ctx.config = config ?? {}
		}
	}

	/**
	 * Uninstall plugins by names for a given tenant and organization. remove from DB, delete files, update manifest.
	 *
	 * @param tenantId
	 * @param organizationId
	 * @param names Plugin names to uninstall
	 */
	async uninstall(
		tenantId: string | null,
		organizationId: string,
		names: string[],
		options: { scopeKey?: string | null } = {}
	) {
		const normalizedNames = names.map((name) => normalizePluginName(name))
		await this.deactivate(tenantId, organizationId, normalizedNames, options)
		const defaultTenantId = await this.getDefaultTenantId()
		const scope = resolvePluginScope({ tenantId, organizationId, defaultTenantId, scopeKey: options.scopeKey })
		await this.removePlugins(organizationId, normalizedNames, { tenantId, scopeKey: scope.scopeKey })
	}

	/**
	 * Remove persisted plugin registrations without mutating the live Nest module graph
	 * or deleting runtime files. System plugins use this path and finish deactivation
	 * when the API process is restarted or replaced.
	 */
	async deactivate(
		tenantId: string | null,
		organizationId: string,
		names: string[],
		options: { scopeKey?: string | null } = {}
	) {
		const normalizedNames = names.map((name) => normalizePluginName(name))
		const defaultTenantId = await this.getDefaultTenantId()
		const scope = resolvePluginScope({ tenantId, organizationId, defaultTenantId, scopeKey: options.scopeKey })
		await this.repo.delete({
			scopeKey: scope.scopeKey,
			pluginName: In(normalizedNames)
		})
		if (scope.isSystem) {
			await this.repo.delete({
				scopeKey: IsNull(),
				level: PLUGIN_LEVEL.SYSTEM,
				pluginName: In(normalizedNames)
			})
			return
		}
		for (const tenantWhere of await this.buildTenantWhereVariants(tenantId)) {
			await this.repo.delete({
				...tenantWhere,
				organizationId:
					!organizationId || organizationId === GLOBAL_ORGANIZATION_SCOPE ? IsNull() : organizationId,
				scopeKey: IsNull(),
				pluginName: In(normalizedNames)
			})
		}
	}

	async uninstallByPackageName(
		tenantId: string | null,
		organizationId: string,
		packageName: string,
		options: { scopeKey?: string | null } = {}
	) {
		const normalized = normalizePluginName(packageName)
		const candidates = normalized === packageName ? [packageName] : [packageName, normalized]
		const defaultTenantId = await this.getDefaultTenantId()
		const scope = resolvePluginScope({ tenantId, organizationId, defaultTenantId, scopeKey: options.scopeKey })
		const tenantWhere = await this.buildTenantWhereVariants(tenantId)
		const items = await this.repo.find({
			where: scope.isSystem
				? [
						{
							scopeKey: scope.scopeKey,
							packageName: In(candidates)
						},
						{
							scopeKey: IsNull(),
							level: PLUGIN_LEVEL.SYSTEM,
							packageName: In(candidates)
						}
					]
				: [
						{
							scopeKey: scope.scopeKey,
							packageName: In(candidates)
						},
						...tenantWhere.map((item) => ({
							...item,
							organizationId:
								!organizationId || organizationId === GLOBAL_ORGANIZATION_SCOPE
									? IsNull()
									: organizationId,
							scopeKey: IsNull(),
							packageName: In(candidates)
						}))
					]
		})

		if (!items.length) {
			await this.removePlugins(organizationId, [packageName], { tenantId, scopeKey: scope.scopeKey })
			return
		}

		const names = items.map((item) => item.pluginName)
		await this.uninstall(tenantId, organizationId, names, { scopeKey: scope.scopeKey })
	}

	async removePlugins(
		organizationId: string,
		names: string[],
		options: { tenantId?: string | null; defaultTenantId?: string | null; scopeKey?: string | null } = {}
	) {
		const tenantId = options.tenantId ?? this.getCurrentTenantId()
		const defaultTenantId = options.defaultTenantId ?? (await this.getDefaultTenantId())
		const scope = resolvePluginScope({ tenantId, organizationId, defaultTenantId, scopeKey: options.scopeKey })
		const storeOptions = { tenantId, defaultTenantId, scopeKey: scope.scopeKey }
		const manifestPath = getOrganizationManifestPath(organizationId, storeOptions)
		const rootDir = getOrganizationPluginRoot(organizationId, storeOptions)
		const normalizedTargets = new Set(names.map((item) => normalizePluginName(item)))
		clearPluginLoadFailure(scope.scopeKey, ...Array.from(normalizedTargets))
		for (const pluginName of normalizedTargets) {
			this.strategyBus.remove(scope.scopeKey, pluginName)
			const pluginIndex = this.loadedPlugins.findIndex(
				(plugin) =>
					(plugin.scopeKey ?? plugin.organizationId) === scope.scopeKey &&
					normalizePluginName(plugin.name) === pluginName
			)
			if (pluginIndex !== -1) {
				this.loadedPlugins.splice(pluginIndex, 1)
			}

			const pluginDir = getOrganizationPluginPath(organizationId, pluginName, storeOptions)
			rmSync(pluginDir, { recursive: true, force: true })

			const segments = pluginName.split('/')
			// Remove versioned plugin directories (e.g., @scope/pkg@1.2.3 or pkg@1.2.3) under the org root.
			if (segments[0]?.startsWith('@') && segments[1]) {
				const scopeDir = join(rootDir, segments[0])
				if (existsSync(scopeDir)) {
					for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
						if (!entry.isDirectory()) continue
						if (entry.name === segments[1] || entry.name.startsWith(`${segments[1]}@`)) {
							rmSync(join(scopeDir, entry.name), { recursive: true, force: true })
						}
					}
				}
			} else if (existsSync(rootDir)) {
				for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
					if (!entry.isDirectory()) continue
					if (entry.name === pluginName || entry.name.startsWith(`${pluginName}@`)) {
						rmSync(join(rootDir, entry.name), { recursive: true, force: true })
					}
				}
			}
		}

		if (existsSync(manifestPath)) {
			try {
				const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as string[]
				const filteredManifest = manifest.filter((entry) => !normalizedTargets.has(normalizePluginName(entry)))
				if (filteredManifest.length !== manifest.length) {
					writeFileSync(manifestPath, JSON.stringify(filteredManifest, null, 2))
				}
			} catch (error) {
				this.logger.warn(`Failed to update plugin manifest for org ${organizationId}`, error)
			}
		}
	}

	private getOrganizationValue(organizationId?: string | null) {
		return !organizationId || organizationId === GLOBAL_ORGANIZATION_SCOPE ? null : organizationId
	}

	private getOrganizationCondition(organizationId?: string | null) {
		return !organizationId || organizationId === GLOBAL_ORGANIZATION_SCOPE ? IsNull() : organizationId
	}

	async getDefaultTenantId() {
		if (this.defaultTenantId !== undefined) {
			return this.defaultTenantId
		}

		try {
			const tenant = await this.repo.manager
				.createQueryBuilder()
				.select('tenant.id', 'id')
				.from('tenant', 'tenant')
				.where('tenant.name = :name', { name: DEFAULT_TENANT })
				.limit(1)
				.getRawOne<{ id?: string }>()
			this.defaultTenantId = tenant?.id ?? null
			setDefaultTenantId(this.defaultTenantId)
			return this.defaultTenantId
		} catch (error) {
			this.logger.warn(`Failed to resolve default tenant id for plugin scope isolation`, error)
			this.defaultTenantId = null
			return this.defaultTenantId
		}
	}

	private async buildTenantWhereVariants(tenantId?: string | null) {
		if (!tenantId) {
			return [{ tenantId: IsNull() }]
		}

		const defaultTenantId = await this.getDefaultTenantId()
		if (defaultTenantId && tenantId === defaultTenantId) {
			return [{ tenantId }, { tenantId: IsNull() }]
		}

		return [{ tenantId }]
	}

	private async buildPluginWhere(
		tenantId: string | null | undefined,
		organizationId: string | null | undefined,
		where: Pick<PluginInstance, 'pluginName'>,
		scopeKey?: string | null
	) {
		const organizationCondition = this.getOrganizationCondition(organizationId)
		const scopedWhere: Array<Record<string, any>> = scopeKey ? [{ scopeKey, ...where }] : []
		const systemLegacyWhere: Array<Record<string, any>> =
			scopeKey === SYSTEM_GLOBAL_SCOPE ? [{ scopeKey: IsNull(), level: PLUGIN_LEVEL.SYSTEM, ...where }] : []
		const legacyWhere = (await this.buildTenantWhereVariants(tenantId)).map((tenantWhere) => ({
			...tenantWhere,
			organizationId: organizationCondition,
			scopeKey: IsNull(),
			...where
		}))
		return [...scopedWhere, ...systemLegacyWhere, ...legacyWhere]
	}

	private getCurrentTenantId() {
		return RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
	}
}
