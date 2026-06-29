import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
	GLOBAL_ORGANIZATION_SCOPE,
	RequestContext,
	resolveTenantGlobalScopeKey,
	setDefaultTenantId,
	StrategyBus
} from '@xpert-ai/plugin-sdk'
import { DEFAULT_TENANT } from '@xpert-ai/contracts'
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

	async upsert(input: PluginInstance) {
		const tenantId = input.tenantId ?? this.getCurrentTenantId()
		const decryptedConfig = input.config ?? {}
		const hasExplicitSourceConfig = input.sourceConfig !== undefined
		const where = await this.buildPluginWhere(tenantId, input.organizationId, {
			pluginName: input.pluginName
		})
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
			existing.tenantId = tenantId ?? existing.tenantId
			const entity = await this.repo.save(existing)
			this.syncLoadedPluginConfig(input.organizationId, input.pluginName, decryptedConfig, tenantId)
			return entity
		}

		const entity = this.repo.create({
			tenantId,
			organizationId: this.getOrganizationValue(input.organizationId),
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
		this.syncLoadedPluginConfig(input.organizationId, input.pluginName, decryptedConfig, tenantId)
		return created
	}

	async findOneByPluginName(pluginName: string, organizationId: string, tenantId = this.getCurrentTenantId()) {
		return this.repo.findOne({
			where: await this.buildPluginWhere(tenantId, organizationId, { pluginName })
		})
	}

	async findVisibleInOrganization(organizationId: string) {
		const tenantId = this.getCurrentTenantId()
		const tenantWhere = await this.buildTenantWhereVariants(tenantId)
		const where = []

		if (organizationId && organizationId !== GLOBAL_ORGANIZATION_SCOPE) {
			where.push(...tenantWhere.map((item) => ({ ...item, organizationId })))
		}

		where.push(...tenantWhere.map((item) => ({ ...item, organizationId: IsNull() })))

		return this.repo.find({ where })
	}

	getConfig(instance?: PluginInstance | null) {
		return deserializePluginConfig(instance?.config)
	}

	syncLoadedPluginConfig(
		organizationId: string | null | undefined,
		pluginName: string,
		config: Record<string, any>,
		tenantId?: string | null
	) {
		const scope = organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const scopeKey = scope === GLOBAL_ORGANIZATION_SCOPE ? resolveTenantGlobalScopeKey(tenantId) : scope
		const plugin = this.loadedPlugins.find(
			(item) =>
				(item.scopeKey ?? item.organizationId) === scopeKey &&
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
	async uninstall(tenantId: string, organizationId: string, names: string[]) {
		const normalizedNames = names.map((name) => normalizePluginName(name))
		for (const tenantWhere of await this.buildTenantWhereVariants(tenantId)) {
			await this.repo.delete({
				...tenantWhere,
				organizationId:
					!organizationId || organizationId === GLOBAL_ORGANIZATION_SCOPE ? IsNull() : organizationId,
				pluginName: In(normalizedNames)
			})
		}

		await this.removePlugins(organizationId, normalizedNames, { tenantId })
	}

	async uninstallByPackageName(tenantId: string, organizationId: string, packageName: string) {
		const normalized = normalizePluginName(packageName)
		const candidates = normalized === packageName ? [packageName] : [packageName, normalized]
		const tenantWhere = await this.buildTenantWhereVariants(tenantId)
		const items = await this.repo.find({
			where: tenantWhere.map((item) => ({
				...item,
				organizationId:
					!organizationId || organizationId === GLOBAL_ORGANIZATION_SCOPE ? IsNull() : organizationId,
				packageName: In(candidates)
			}))
		})

		if (!items.length) {
			await this.removePlugins(organizationId, [packageName], { tenantId })
			return
		}

		const names = items.map((item) => item.pluginName)
		await this.uninstall(tenantId, organizationId, names)
	}

	async removePlugins(
		organizationId: string,
		names: string[],
		options: { tenantId?: string | null; defaultTenantId?: string | null } = {}
	) {
		const tenantId = options.tenantId ?? this.getCurrentTenantId()
		const defaultTenantId = options.defaultTenantId ?? (await this.getDefaultTenantId())
		const scope = resolvePluginScope({ tenantId, organizationId, defaultTenantId })
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
		where: Pick<PluginInstance, 'pluginName'>
	) {
		const organizationCondition = this.getOrganizationCondition(organizationId)
		return (await this.buildTenantWhereVariants(tenantId)).map((tenantWhere) => ({
			...tenantWhere,
			organizationId: organizationCondition,
			...where
		}))
	}

	private getCurrentTenantId() {
		return RequestContext.getScope()?.tenantId ?? RequestContext.currentTenantId()
	}
}
