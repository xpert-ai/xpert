import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { GLOBAL_ORGANIZATION_SCOPE, StrategyBus } from '@xpert-ai/plugin-sdk'
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
import { LOADED_PLUGINS, LoadedPluginRecord, normalizePluginName } from './types'

@Injectable()
export class PluginInstanceService extends TenantOrganizationAwareCrudService<PluginInstance> {
	private readonly logger = new Logger(PluginInstanceService.name)

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
		const organizationId = this.getOrganizationCondition(input.organizationId)
		const decryptedConfig = input.config ?? {}
		const existing = await this.repo.findOne({
			where: {
				organizationId,
				pluginName: input.pluginName
			}
		})

		if (existing) {
			existing.packageName = input.packageName
			existing.version = input.version
			existing.source = input.source
			existing.level = input.level ?? existing.level
			existing.config = serializePluginConfig(decryptedConfig)
			existing.configurationStatus = input.configurationStatus ?? null
			existing.configurationError = input.configurationError ?? null
			existing.tenantId = input.tenantId ?? existing.tenantId
			const entity = await this.repo.save(existing)
			this.syncLoadedPluginConfig(input.organizationId, input.pluginName, decryptedConfig)
			return entity
		}

		const entity = this.repo.create({
			tenantId: input.tenantId,
			organizationId: this.getOrganizationValue(input.organizationId),
			pluginName: input.pluginName,
			packageName: input.packageName,
			version: input.version,
			source: input.source,
			level: input.level,
			config: serializePluginConfig(decryptedConfig),
			configurationStatus: input.configurationStatus ?? null,
			configurationError: input.configurationError ?? null
		})
		const created = await this.create(entity)
		this.syncLoadedPluginConfig(input.organizationId, input.pluginName, decryptedConfig)
		return created
	}

	async findOneByPluginName(pluginName: string, organizationId: string) {
		return this.repo.findOne({
			where: {
				organizationId: this.getOrganizationCondition(organizationId),
				pluginName
			}
		})
	}

	getConfig(instance?: PluginInstance | null) {
		return deserializePluginConfig(instance?.config)
	}

	syncLoadedPluginConfig(organizationId: string | null | undefined, pluginName: string, config: Record<string, any>) {
		const scope = organizationId ?? GLOBAL_ORGANIZATION_SCOPE
		const plugin = this.loadedPlugins.find(
			(item) =>
				item.organizationId === scope && normalizePluginName(item.name) === normalizePluginName(pluginName)
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
		await this.delete({
			tenantId,
			organizationId: !organizationId || organizationId === GLOBAL_ORGANIZATION_SCOPE ? IsNull() : organizationId,
			pluginName: In(names)
		})

		await this.removePlugins(organizationId, names)
	}

	async uninstallByPackageName(tenantId: string, organizationId: string, packageName: string) {
		const normalized = normalizePluginName(packageName)
		const candidates = normalized === packageName ? [packageName] : [packageName, normalized]
		const items = await this.repo.find({
			where: {
				tenantId,
				organizationId:
					!organizationId || organizationId === GLOBAL_ORGANIZATION_SCOPE ? IsNull() : organizationId,
				packageName: In(candidates)
			}
		})

		if (!items.length) {
			await this.removePlugins(organizationId, [packageName])
			return
		}

		const names = items.map((item) => item.pluginName)
		await this.uninstall(tenantId, organizationId, names)
	}

	async removePlugins(organizationId: string, names: string[]) {
		const manifestPath = getOrganizationManifestPath(organizationId)
		const rootDir = getOrganizationPluginRoot(organizationId)
		const normalizedTargets = new Set(names.map((item) => normalizePluginName(item)))
		for (const pluginName of normalizedTargets) {
			this.strategyBus.remove(organizationId, pluginName)
			const pluginIndex = this.loadedPlugins.findIndex(
				(plugin) => plugin.organizationId === organizationId && plugin.name === pluginName
			)
			if (pluginIndex !== -1) {
				this.loadedPlugins.splice(pluginIndex, 1)
			}

			const pluginDir = getOrganizationPluginPath(organizationId, pluginName)
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
}
